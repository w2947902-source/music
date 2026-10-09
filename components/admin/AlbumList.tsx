"use client";
import Link from "next/link";
import { Reorder, useDragControls } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { AlbumCover } from "@/components/album/AlbumCover";
import type { Album } from "@/types/album";
function Row({
  album,
  index,
  total,
  onEdit,
  onDelete,
  onMove,
  onDragEnd,
  disabled,
}: {
  album: Album;
  index: number;
  total: number;
  onEdit: (album: Album) => void;
  onDelete: (album: Album) => void;
  onMove: (index: number, delta: number) => void;
  onDragEnd: () => void;
  disabled: boolean;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={album.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="admin-album-row"
      style={{ position: "relative" }}
    >
      <button
        className="drag-handle"
        disabled={disabled}
        aria-label={`拖动排序 ${album.title}`}
        onPointerDown={(event) => {
          if (!disabled) controls.start(event);
        }}
      >
        <GripVertical size={19} />
      </button>
      <AlbumCover
        className="admin-album-cover"
        source={album.coverUrl}
        title={album.title}
      />
      <div className="admin-album-details">
        <h2>
          {album.title}
          {album.isDemo && <span className="demo-badge">DEMO</span>}
        </h2>
        <p>
          {album.artist} · {album.year ?? "—"} · {album.tracks.length} tracks
        </p>
      </div>
      <div className="admin-row-actions">
        <button
          className="small-icon-button"
          disabled={disabled || index === 0}
          aria-label={`上移专辑 ${album.title}`}
          onClick={() => onMove(index, -1)}
        >
          <ArrowUp size={14} />
        </button>
        <button
          className="small-icon-button"
          disabled={disabled || index === total - 1}
          aria-label={`下移专辑 ${album.title}`}
          onClick={() => onMove(index, 1)}
        >
          <ArrowDown size={14} />
        </button>
        <Link
          className="text-button"
          href={`/?album=${encodeURIComponent(album.id)}`}
          aria-label={`预览 ${album.title}`}
        >
          <Eye size={15} />
          <span>Preview</span>
        </Link>
        <button
          className="text-button"
          disabled={disabled}
          onClick={() => onEdit(album)}
        >
          <Pencil size={14} />
          <span>Edit</span>
        </button>
        <button
          className="text-button danger"
          disabled={disabled}
          aria-label={`删除专辑 ${album.title}`}
          onClick={() => onDelete(album)}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </Reorder.Item>
  );
}
export function AlbumList({
  albums,
  ids,
  onReorder,
  onCommit,
  onMove,
  onEdit,
  onDelete,
  disabled,
}: {
  albums: Album[];
  ids: string[];
  onReorder: (ids: string[]) => void;
  onCommit: () => void;
  onMove: (index: number, delta: number) => void;
  onEdit: (album: Album) => void;
  onDelete: (album: Album) => void;
  disabled: boolean;
}) {
  return (
    <Reorder.Group
      axis="y"
      values={ids}
      onReorder={onReorder}
      className="admin-album-list"
    >
      {ids.map((id, index) => {
        const album = albums.find((item) => item.id === id);
        return album ? (
          <Row
            key={id}
            album={album}
            index={index}
            total={ids.length}
            onEdit={onEdit}
            onDelete={onDelete}
            onMove={onMove}
            onDragEnd={onCommit}
            disabled={disabled}
          />
        ) : null;
      })}
    </Reorder.Group>
  );
}
