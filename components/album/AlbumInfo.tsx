import type { Album } from "@/types/album";
export function AlbumInfo({ album }: { album: Album }) {
  return (
    <div className="album-info">
      <div className="eyebrow album-eyebrow">
        <span>THE LISTENING ROOM</span>
        <span>{album.isDemo ? "DEMO RECORD" : "PERSONAL RECORD"}</span>
      </div>
      <h1>{album.title}</h1>
      <div className="album-artist">
        {album.artist}
        <span className="artist-divider">/</span>
        <span className="album-year">{album.year ?? "—"}</span>
      </div>
      {album.description && (
        <p className="album-description">{album.description}</p>
      )}
    </div>
  );
}
