"use client";
import { motion } from "motion/react";
import type { Album } from "@/types/album";
import { AlbumCover } from "./AlbumCover";
import { AlbumInfo } from "./AlbumInfo";
export function AlbumView({
  album,
  number,
  children,
}: {
  album: Album;
  number: number;
  children?: React.ReactNode;
}) {
  return (
    <motion.section
      className="album-view"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <figure className="cover-figure">
        <motion.div
          initial={{ scale: 0.975 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.975 }}
          transition={{ duration: 0.6 }}
        >
          <AlbumCover source={album.coverUrl} title={album.title} />
        </motion.div>
        <figcaption>
          <span>ARCHIVE NO. {String(number).padStart(3, "0")}</span>
          <span>
            MUSIC EXCERPT{album.year ? ` · ${album.year}` : ""}
          </span>
        </figcaption>
      </figure>
      <div className="record-details">
        <AlbumInfo album={album} />
        {children}
      </div>
    </motion.section>
  );
}
