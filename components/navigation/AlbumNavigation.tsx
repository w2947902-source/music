import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Album } from "@/types/album";
export function AlbumNavigation({
  albums,
  index,
  onSelect,
}: {
  albums: Album[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const previous = (index - 1 + albums.length) % albums.length;
  const next = (index + 1) % albums.length;
  return (
    <nav className="album-navigation" aria-label="专辑导航">
      <button
        className="nav-album nav-previous"
        onClick={() => onSelect(previous)}
        disabled={albums.length < 2}
      >
        <ArrowLeft size={20} strokeWidth={1.3} />
        <span>
          <span className="eyebrow">PREVIOUS RECORD</span>
          <span className="nav-title">{albums[previous]?.title}</span>
        </span>
      </button>
      <div className="album-pagination">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <span className="pagination-line" />
        <span>{String(albums.length).padStart(2, "0")}</span>
      </div>
      <button
        className="nav-album nav-next"
        onClick={() => onSelect(next)}
        disabled={albums.length < 2}
      >
        <span>
          <span className="eyebrow">NEXT RECORD</span>
          <span className="nav-title">{albums[next]?.title}</span>
        </span>
        <ArrowRight size={20} strokeWidth={1.3} />
      </button>
    </nav>
  );
}
