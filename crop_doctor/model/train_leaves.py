"""Exp 12: does training on individual leaves help on field photos?

    python -m crop_doctor.model.train_leaves              # one run, ~25-35 min on a Colab T4
    python -m crop_doctor.model.train_leaves --smoke      # 1-minute code check

The shipped v3 model saw each PlantDoc training photo as ONE example, even when the photo shows several leaves, and
only 285 such photos exist for training. PlantDoc's object-detection release has a box drawn around every leaf
(Singh et al. 2020: training on leaves raised field accuracy to 60-70.5%). This run changes exactly one thing in
training and one at prediction, and keeps everything else identical to v3 (train_v2.py --splits splits_v3):

  Training:   the 285 whole photos stay, PLUS one cut-out per boxed leaf in those same photos (~1,000 leaves).
              Boxes are matched by file name AND disease, and come only from photos already in field_train:
              no validation, calibration or test photo is ever cut up.
  Prediction: the logits of the photo and its mirror image are averaged ("test-time augmentation").
              Results are reported with and without it, so each change's effect can be seen separately.

Same model, data mix, class balancing, augmentation, optimiser, epochs and the same 1,306 test photos as v3.
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.request

import numpy as np
import pandas as pd
import torch
from PIL import Image
from sklearn.metrics import f1_score
from torch.utils.data import ConcatDataset, DataLoader, WeightedRandomSampler

from crop_doctor import config
from crop_doctor.model.common import FrameDataset, eval_transform
from crop_doctor.model.crops import crops_from_labels, mask_logits

SPLITS = config.ROOT / "crop_doctor" / "data" / "splits_v3"
ARCH = "convnext_tiny.fb_in22k_ft_in1k"   # as v3
LAB_SHARE = 0.4                           # as v3: 40% lab photos, 60% field photos per batch
BOX_URL = "https://raw.githubusercontent.com/pratikkayal/PlantDoc-Object-Detection-Dataset/master/{}_labels.csv"
BOX_DIR = config.DATASETS_DIR / "plantdoc_boxes"
BOX_PAD = 0.1          # keep a 10% margin around each leaf
MIN_BOX_PX = 32        # skip tiny boxes: too few pixels to show a lesion
BASELINE_LOGITS = config.ROOT / "server" / "assets" / "logits" / "field_test.npz"   # the shipped v3 model


# ═══ leaf boxes ═══
def _key(name: str) -> str:
    """download.py replaces characters Windows forbids in file names; do the same so names match."""
    return re.sub(r'[<>:"|?*]', "_", str(name)).lower()


def load_boxes() -> pd.DataFrame:
    """PlantDoc's box annotations: two small CSVs (filename, size, disease, box corners)."""
    BOX_DIR.mkdir(parents=True, exist_ok=True)
    frames = []
    for part in ("train", "test"):
        path = BOX_DIR / f"{part}_labels.csv"
        if not path.exists():
            urllib.request.urlretrieve(BOX_URL.format(part), path)
        frames.append(pd.read_csv(path, on_bad_lines="skip"))
    boxes = pd.concat(frames, ignore_index=True)
    for c in ("width", "height", "xmin", "ymin", "xmax", "ymax"):
        boxes[c] = pd.to_numeric(boxes[c], errors="coerce")
    boxes = boxes.dropna(subset=["width", "height", "xmin", "ymin", "xmax", "ymax"])
    boxes["key"] = boxes["filename"].map(_key)
    return boxes


def leaf_rows(field_train: pd.DataFrame, boxes: pd.DataFrame) -> pd.DataFrame:
    """One row per boxed leaf, only for PlantDoc photos in field_train and only when the box's disease matches."""
    folder_to_label = {pd_folder: label for label, (_, pd_folder) in config.CLASS_MAP.items()}
    boxes = boxes.assign(label=boxes["class"].map(folder_to_label)).dropna(subset=["label"])
    pdoc = field_train[field_train["source"] == "plantdoc"].copy()
    pdoc["key"] = pdoc["path"].str.rsplit("/", n=1).str[-1].map(_key)
    rows = pdoc.merge(boxes[["key", "label", "width", "height", "xmin", "ymin", "xmax", "ymax"]], on=["key", "label"])
    # Boxes as fractions of the image, so they fit whatever size the downloaded photo is.
    out = pd.DataFrame({
        "path": rows["path"], "label": rows["label"], "label_idx": rows["label_idx"], "source": "plantdoc_leaf",
        "x0": rows["xmin"] / rows["width"], "y0": rows["ymin"] / rows["height"],
        "x1": rows["xmax"] / rows["width"], "y1": rows["ymax"] / rows["height"],
        "box_px": np.minimum(rows["xmax"] - rows["xmin"], rows["ymax"] - rows["ymin"]),
    })
    out = out[(out["box_px"] >= MIN_BOX_PX) & (out["x1"] > out["x0"]) & (out["y1"] > out["y0"])]
    return out.drop(columns="box_px").reset_index(drop=True)


class LeafDataset(FrameDataset):
    """Like FrameDataset, but cuts out the boxed leaf (plus a margin) before the usual augmentation."""

    def __getitem__(self, i: int):
        row = self.df.iloc[i]
        with Image.open(config.DATASETS_DIR / row["path"]) as im:
            img = im.convert("RGB")
        w, h = img.size
        bw, bh = (row["x1"] - row["x0"]) * w, (row["y1"] - row["y0"]) * h
        box = (max(0, row["x0"] * w - BOX_PAD * bw), max(0, row["y0"] * h - BOX_PAD * bh),
               min(w, row["x1"] * w + BOX_PAD * bw), min(h, row["y1"] * h + BOX_PAD * bh))
        return self.transform(img.crop(tuple(int(round(v)) for v in box))), int(row["label_idx"])


def sqrt_balanced(labels: pd.Series, total_weight: float) -> np.ndarray:
    """As v3: a class with 4x fewer examples is drawn 2x more often per example."""
    counts = labels.map(labels.value_counts()).to_numpy(dtype=float)
    w = 1.0 / np.sqrt(counts)
    return w / w.sum() * total_weight


# ═══ evaluation ═══
@torch.no_grad()
def logits_two_ways(model, loader, dev) -> tuple[np.ndarray, np.ndarray]:
    """Logits of each photo (plain) and averaged with its mirror image (TTA), in one pass."""
    model.eval()
    plain, tta = [], []
    for x, _ in loader:
        x = x.to(dev)
        with torch.autocast(device_type=dev.type, enabled=dev.type == "cuda"):
            a, b = model(x).float(), model(torch.flip(x, dims=[3])).float()
        plain.append(a.cpu())
        tta.append(((a + b) / 2).cpu())
    return torch.cat(plain).numpy().astype(np.float64), torch.cat(tta).numpy().astype(np.float64)


def report(logits: np.ndarray, test: pd.DataFrame, classes: list[str], name: str) -> dict:
    """Accuracy per source and per disease on PlantDoc, with a bootstrap 95% range (the crop is known, as in the app)."""
    y = test["label_idx"].to_numpy()
    pred = mask_logits(logits, classes, crops_from_labels(y, classes)).argmax(1)
    ok = pred == y
    pdoc = test["source"].to_numpy() == "plantdoc"
    rng = np.random.default_rng(config.SEED)
    idx = np.where(pdoc)[0]
    boot = [ok[rng.choice(idx, len(idx))].mean() for _ in range(2000)]
    return {
        "model": name,
        "plantdoc_accuracy": round(float(ok[pdoc].mean()), 4),
        "plantdoc_95pct_range": [round(float(v), 4) for v in np.percentile(boot, [2.5, 97.5])],
        "plantdoc_macro_f1": round(float(f1_score(y[pdoc], pred[pdoc], average="macro")), 4),
        "tanzania_accuracy": round(float(ok[~pdoc].mean()), 4),
        "all_accuracy": round(float(ok.mean()), 4),
        "plantdoc_per_disease": {classes[k]: round(float(ok[pdoc & (y == k)].mean()), 3) for k in sorted(set(y[pdoc]))},
    }


def paired_gain(new: np.ndarray, old: np.ndarray, test: pd.DataFrame, classes: list[str]) -> dict:
    """PlantDoc gain of `new` over `old` on the SAME photos, with a paired bootstrap 95% range.
    Paired = each resample scores both models on the same photos, which is fairer than comparing two ranges."""
    y = test["label_idx"].to_numpy()
    crops = crops_from_labels(y, classes)
    a = mask_logits(new, classes, crops).argmax(1) == y
    b = mask_logits(old, classes, crops).argmax(1) == y
    idx = np.where(test["source"].to_numpy() == "plantdoc")[0]
    rng = np.random.default_rng(config.SEED)
    boot = [(a[s] .mean() - b[s].mean()) for s in (rng.choice(idx, len(idx)) for _ in range(2000))]
    lo, hi = np.percentile(boot, [2.5, 97.5])
    return {"points": round(float(a[idx].mean() - b[idx].mean()) * 100, 1),
            "95pct_range_points": [round(float(lo) * 100, 1), round(float(hi) * 100, 1)],
            "clearly_better": bool(lo > 0)}


# ═══ training (identical to v3 apart from the leaf cut-outs) ═══
def build(n_classes: int, arch: str):
    import timm  # imported here so the data code above can be tested without timm
    return timm.create_model(arch, pretrained=True, num_classes=n_classes)


def main(argv: list[str] | None = None, model_fn=None) -> dict:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=10)                 # as v3
    ap.add_argument("--samples-per-epoch", type=int, default=16000)   # as v3
    ap.add_argument("--lr", type=float, default=1e-4)                 # as v3
    ap.add_argument("--batch-size", type=int, default=32)             # as v3
    ap.add_argument("--workers", type=int, default=2)                 # Colab has 2 CPU cores
    ap.add_argument("--tag", default="exp12_leaf_crops")
    ap.add_argument("--smoke", action="store_true")
    args = ap.parse_args(argv)
    if args.smoke:
        args.epochs, args.samples_per_epoch, args.batch_size = 1, 64, 8
        args.tag += "_smoke"   # never overwrite a real run's files

    torch.manual_seed(config.SEED)
    np.random.seed(config.SEED)
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    classes = json.loads((SPLITS / "classes.json").read_text())
    lab = pd.read_csv(SPLITS / "lab_train.csv")
    field = pd.concat([pd.read_csv(SPLITS / "field_train.csv"), pd.read_csv(SPLITS / "other_train.csv")], ignore_index=True)
    val = pd.concat([pd.read_csv(SPLITS / "field_val.csv"), pd.read_csv(SPLITS / "other_val.csv")], ignore_index=True)
    test = pd.read_csv(SPLITS / "field_test.csv")
    leaves = leaf_rows(field, load_boxes())
    if args.smoke:
        lab, field, leaves = lab.sample(32, random_state=0), field.sample(32, random_state=0), leaves.sample(16, random_state=0)
        val, test = val.sample(16, random_state=0), test.sample(16, random_state=0)
    print(f"lab {len(lab)} | field photos {len(field)} | leaf cut-outs {len(leaves)} from "
          f"{leaves['path'].nunique()} PlantDoc training photos | val {len(val)} | test {len(test)}", flush=True)

    from crop_doctor.model.train_final import strong_train_transform   # v3's augmentation
    tf = strong_train_transform()
    train_ds = ConcatDataset([FrameDataset(lab, tf), FrameDataset(field, tf), LeafDataset(leaves, tf)])
    # Leaves join the field group, so field examples keep their 60% share; balancing is per class, as in v3.
    field_labels = pd.concat([field["label"], leaves["label"]], ignore_index=True)
    weights = np.concatenate([sqrt_balanced(lab["label"], LAB_SHARE), sqrt_balanced(field_labels, 1 - LAB_SHARE)])
    sampler = WeightedRandomSampler(torch.as_tensor(weights), num_samples=args.samples_per_epoch, replacement=True,
                                    generator=torch.Generator().manual_seed(config.SEED))
    kw = dict(num_workers=args.workers, pin_memory=dev.type == "cuda", persistent_workers=args.workers > 0)
    train_dl = DataLoader(train_ds, batch_size=args.batch_size, sampler=sampler, drop_last=True, **kw)
    val_dl = DataLoader(FrameDataset(val, eval_transform()), batch_size=64, **kw)
    val_y = val["label_idx"].to_numpy()

    model = (model_fn or build)(len(classes), ARCH).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.05)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=args.epochs * len(train_dl), pct_start=0.1)
    scaler = torch.amp.GradScaler(enabled=dev.type == "cuda")
    loss_fn = torch.nn.CrossEntropyLoss()

    config.OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    ckpt = config.OUTPUTS_DIR / f"{args.tag}.pt"
    best, log = -1.0, []
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0, running, seen = time.time(), 0.0, 0
        for x, y in train_dl:
            x, y = x.to(dev, non_blocking=True), y.to(dev, non_blocking=True)
            with torch.autocast(device_type=dev.type, enabled=dev.type == "cuda"):
                loss = loss_fn(model(x), y)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            sched.step()
            running += loss.item() * len(y)
            seen += len(y)
        # The best epoch is chosen as in v3: macro-F1 on field_val, plain prediction, never the test photos.
        vl, _ = logits_two_ways(model, val_dl, dev)
        f1 = float(f1_score(val_y, mask_logits(vl, classes, crops_from_labels(val_y, classes)).argmax(1), average="macro"))
        entry = {"epoch": epoch, "train_loss": round(running / seen, 4), "val_macro_f1": round(f1, 4),
                 "minutes": round((time.time() - t0) / 60, 1)}
        log.append(entry)
        print(entry, flush=True)
        if f1 > best:
            best = f1
            torch.save({"state_dict": model.state_dict(), "classes": classes, "arch": ARCH, "img_size": 224,
                        "epoch": epoch, "val_macro_f1": f1, "recipe": vars(args)}, ckpt)

    # Final: the best epoch on the same 1,306 test photos as the shipped model. Logits are saved for later analysis.
    model.load_state_dict(torch.load(ckpt, map_location=dev)["state_dict"])
    saved = {}
    for split, df in (("field_val", val), ("field_cal", pd.read_csv(SPLITS / "field_cal.csv")), ("field_test", test)):
        if args.smoke and split == "field_cal":
            df = df.sample(16, random_state=0)
        plain, tta = logits_two_ways(model, DataLoader(FrameDataset(df, eval_transform()), batch_size=64, **kw), dev)
        saved[split] = (plain, tta)
        np.savez_compressed(config.OUTPUTS_DIR / f"{args.tag}_{split}.npz", logits=plain, logits_tta=tta,
                            labels=df["label_idx"].to_numpy())
    plain, tta = saved["field_test"]
    results = {"leaf_crops": report(plain, test, classes, "v3 + leaf cut-outs"),
               "leaf_crops_plus_mirror": report(tta, test, classes, "v3 + leaf cut-outs + mirror averaging"),
               "epochs": log}
    if not args.smoke and BASELINE_LOGITS.exists():
        old = np.load(BASELINE_LOGITS)["logits"]
        results["shipped_v3"] = report(old, test, classes, "shipped v3")
        results["gain_from_leaf_crops"] = paired_gain(plain, old, test, classes)
        results["gain_from_both"] = paired_gain(tta, old, test, classes)
    (config.OUTPUTS_DIR / f"{args.tag}_results.json").write_text(json.dumps(results, indent=2))
    print(json.dumps({k: v for k, v in results.items() if k != "epochs"}, indent=2), flush=True)
    return results


if __name__ == "__main__":
    main()
