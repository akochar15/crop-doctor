"""Download the photos the model trains and is tested on.

    python -m crop_doctor.data.download            # PlantVillage + PlantDoc only (the original v1 data)
    python -m crop_doctor.data.download --all      # every source the current splits (splits_v3) use
    python -m crop_doctor.data.download --check    # only report which split photos are missing

Sources (--all):
  PlantVillage   lab photos. git "partial clone + sparse checkout" fetches only our folders, not the 2 GB repo.
  PlantDoc       web field photos. One zip, only our folders are extracted.
  Tomato-Village Indian tomato leaves (Gehlot et al. 2023). Sparse clone of the "Variant-a" folder only.
  Tanzania       smartphone potato photos (Zenodo 10.5281/zenodo.8286529, CC-BY-4.0). Three zips of ~7 GB in all;
                 prepare_v2 picks the same ~1,950 photos per class every time (fixed seed) and shrinks them to 512 px,
                 then the zips are deleted, so only ~0.5 GB stays.

Meant for Google Colab: run it there and the photos land on Google's machine, not your laptop.
Set CROP_DOCTOR_DATASETS to choose the folder (e.g. on Google Drive, so the next session skips the download).
"""
from __future__ import annotations

import argparse
import glob
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

from crop_doctor import config
from crop_doctor.config import CLASS_MAP, PLANTDOC_DIR, PLANTVILLAGE_DIR

TOMATO_VILLAGE_REPO = "https://github.com/mamta-joshi-gehlot/Tomato-Village.git"
TOMATO_VILLAGE_DIR = config.DATASETS_DIR / "tomato_village"
TANZANIA_ZIPS = {z: f"https://zenodo.org/api/records/8286529/files/{z}.zip/content" for z in ("earlyblt", "lateblt", "healthy")}
SPLITS_V3 = config.ROOT / "crop_doctor" / "data" / "splits_v3"

PLANTVILLAGE_REPO = "https://github.com/spMohanty/PlantVillage-Dataset.git"
PLANTDOC_ZIP = "https://codeload.github.com/pratikkayal/PlantDoc-Dataset/zip/refs/heads/master"


def sparse_clone(repo: str, dest: Path, folders: list[str]) -> None:
    if (dest / ".git").exists():
        # Already cloned: just make sure every folder we need is checked out (adding one is cheap).
        subprocess.run(["git", "-C", str(dest), "sparse-checkout", "add", *folders], check=True)
        print(f"{dest.name}: already downloaded, folders up to date")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"{dest.name}: cloning {len(folders)} folders from {repo}")
    subprocess.run(
        ["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", repo, str(dest)], check=True
    )
    # --no-cone lets us list exact folder paths (folder names contain spaces).
    subprocess.run(["git", "-C", str(dest), "sparse-checkout", "set", "--no-cone", *folders], check=True)


def safe_name(name: str) -> str:
    """Some PlantDoc files are named like 'IMG_1629.JPG?1507122477.jpg'.
    '?' and similar characters are illegal in Windows file names, so replace them."""
    return re.sub(r'[<>:"|?*]', "_", name)


def download_zip_folders(zip_url: str, dest: Path, folders: list[str]) -> None:
    """Download a GitHub repo as one zip and extract only `folders` (paths inside the repo)."""
    if dest.exists() and any(dest.iterdir()):
        print(f"{dest.name}: already downloaded, skipping")
        return
    print(f"{dest.name}: downloading {zip_url} (about 1 GB, a few minutes) ...")
    with tempfile.TemporaryDirectory() as tmp:
        zip_path = Path(tmp) / "repo.zip"
        with urllib.request.urlopen(zip_url) as resp, open(zip_path, "wb") as out:
            shutil.copyfileobj(resp, out, length=1 << 20)
        wanted = tuple(f.strip("/") + "/" for f in folders)
        n = 0
        with zipfile.ZipFile(zip_path) as zf:
            for info in zf.infolist():
                # Zip entries look like "PlantDoc-Dataset-master/train/Tomato leaf/x.jpg": drop the top folder.
                inner = info.filename.split("/", 1)[-1]
                if info.is_dir() or not inner.startswith(wanted):
                    continue
                target = dest.joinpath(*(safe_name(part) for part in inner.split("/")))
                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src, open(target, "wb") as out:
                    shutil.copyfileobj(src, out)
                n += 1
    print(f"{dest.name}: extracted {n} files")


def download_file(url: str, dest: Path) -> None:
    """Stream a large file to disk with a progress line; skip it if it is already complete."""
    if dest.exists() and dest.stat().st_size > 0:
        print(f"{dest.name}: already downloaded, skipping")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url) as resp, open(part, "wb") as out:
        total, done = int(resp.headers.get("Content-Length") or 0), 0
        while chunk := resp.read(8 << 20):
            out.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r{dest.name}: {done / 1e9:.2f} / {total / 1e9:.2f} GB", end="", flush=True)
    print()
    part.rename(dest)  # only a finished download gets the real name, so a broken one is retried next time


def download_tanzania(keep_zips: bool = False) -> None:
    from crop_doctor.data.prepare_v2 import TZ_CLASSES, TZ_DIR, TZ_IMAGES, extract_tanzania

    if TZ_IMAGES.exists() and all(any((TZ_IMAGES / z).glob("*.jpg")) for z in TZ_CLASSES):
        print("tanzania_potato: already extracted, skipping")
        return
    for name, url in TANZANIA_ZIPS.items():
        download_file(url, TZ_DIR / "zips" / f"{name}.zip")
    # The same function that built the splits, with the same seed: it writes the same file names the CSVs list.
    n = len(extract_tanzania(config.SEED))
    print(f"tanzania_potato: extracted {n} photos")
    if not keep_zips:
        shutil.rmtree(TZ_DIR / "zips")


def check_splits() -> int:
    """Every photo listed in splits_v3 must exist under DATASETS_DIR. Returns the number missing."""
    frames = [pd.read_csv(f) for f in sorted(glob.glob(str(SPLITS_V3 / "*.csv")))]
    paths = pd.concat(frames, ignore_index=True)["path"].drop_duplicates()
    missing = [p for p in paths if not (config.DATASETS_DIR / p).exists()]
    by_source = pd.Series([p.split("/")[0] for p in missing], dtype=str).value_counts()
    print(f"{len(paths) - len(missing)} of {len(paths)} split photos found in {config.DATASETS_DIR}")
    for source, n in by_source.items():
        print(f"  missing from {source}: {n}")
    return len(missing)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true", help="also fetch Tomato-Village, Tanzania and healthy potato")
    ap.add_argument("--check", action="store_true", help="only report missing photos")
    ap.add_argument("--keep-zips", action="store_true", help="keep the 7 GB of Tanzania zips after extracting")
    args = ap.parse_args()
    if args.check:
        sys.exit(1 if check_splits() else 0)

    pv_folders = [f"/raw/color/{pv}/" for pv, _ in CLASS_MAP.values()]
    if args.all:
        pv_folders.append("/raw/color/Potato___healthy/")  # the 12-class model also has healthy potato
    pd_folders = [f"{split}/{pd}" for _, pd in CLASS_MAP.values() for split in ("train", "test")]
    sparse_clone(PLANTVILLAGE_REPO, PLANTVILLAGE_DIR, pv_folders)
    # PlantDoc via zip, not git: git refuses to check out its '?' file names on Windows.
    download_zip_folders(PLANTDOC_ZIP, PLANTDOC_DIR, pd_folders)
    if args.all:
        sparse_clone(TOMATO_VILLAGE_REPO, TOMATO_VILLAGE_DIR, ["/Variant-a(Multiclass Classification)/"])
        download_tanzania(args.keep_zips)
        sys.exit(1 if check_splits() else 0)
    print("done")


if __name__ == "__main__":
    main()
