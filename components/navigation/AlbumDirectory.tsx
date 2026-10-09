"use client";
import { motion } from "motion/react";
import { X, Play } from "lucide-react";
import { AlbumCover } from "@/components/album/AlbumCover";
import { useDialog } from "@/components/ui/useDialog";
import type { Album } from "@/types/album";
export function AlbumDirectory({
  albums,
  currentId,
  onSelect,
  onClose,
}: {
  albums: Album[];
  currentId?: string;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const ref = useDialog(onClose);
  return (
    <motion.div
      className="directory-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="directory-title"
      tabIndex={-1}
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="directory-inner">
        <div className="directory-heading">
          <div>
            <span className="eyebrow">
              THE PERSONAL ARCHIVE / {String(albums.length).padStart(2, "0")}{" "}
              RECORDS
            </span>
            <h2 id="directory-title">
              My collection<span>.</span>
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="关闭目录"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="directory-list">
          {albums.map((album, index) => (
            <motion.button
              className={`directory-item ${album.id === currentId ? "selected" : ""}`}
              key={album.id}
              onClick={() => onSelect(index)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <span className="directory-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <AlbumCover
                className="directory-cover"
                source={album.coverUrl}
                title={album.title}
              />
              <span className="directory-text">
                <span className="directory-album-title">{album.title}</span>
                <span className="muted">{album.artist}</span>
              </span>
              <span className="directory-year">{album.year ?? "—"}</span>
              {album.id === currentId ? (
                <span className="current-indicator">ON DISPLAY</span>
              ) : (
                <Play className="directory-play" size={17} />
              )}
            </motion.button>
          ))}
        </div>
        <p className="directory-footnote">
          One record at a time. Take your time.
        </p>
      </div>
    </motion.div>
  );
}
