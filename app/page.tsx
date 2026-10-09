import { Suspense } from "react";
import { Gallery } from "@/components/album/Gallery";
export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="gallery-loading">
          <span className="eyebrow">OPENING THE ARCHIVE</span>
          <span className="loading-line" />
        </main>
      }
    >
      <Gallery />
    </Suspense>
  );
}
