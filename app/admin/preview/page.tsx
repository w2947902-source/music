import { Suspense } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { Gallery } from "@/components/album/Gallery";
export default function PreviewPage() {
  return <AdminGate><Suspense fallback={<main className="gallery-loading">正在打开预览…</main>}><Gallery mode="admin" /></Suspense></AdminGate>;
}
