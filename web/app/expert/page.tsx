import type { Metadata } from "next";
import ExpertDashboard from "@/components/expert/ExpertDashboard";

export const metadata: Metadata = { title: "Expert dashboard" };

export default function ExpertPage() {
  return (
    <div className="pb-16">
      <ExpertDashboard />
    </div>
  );
}
