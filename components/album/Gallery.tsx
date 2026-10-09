"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { ArrowUpRight, Library } from "lucide-react";
import { Brand } from "@/components/ui/Brand";
import { useAlbums } from "@/lib/albums/useAlbums";
import { useAudioPlayer } from "@/lib/audio/useAudioPlayer";
import { AudioPlayer } from "@/components/audio/AudioPlayer";
import { AlbumDirectory } from "@/components/navigation/AlbumDirectory";
import { AlbumNavigation } from "@/components/navigation/AlbumNavigation";
import { AlbumView } from "./AlbumView";

export function Gallery() {
  const { albums, loading, error } = useAlbums();
  const previewId = useSearchParams().get("album");
  const [selectedId, setSelectedId] = useState<string>();
  const [trackId, setTrackId] = useState<string>();
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const index = Math.max(
    0,
    albums.findIndex((album) => album.id === (selectedId ?? previewId)),
  );
  const album = albums[index];
  const playbackAlbum = useMemo(
    () =>
      trackId && album
        ? {
            ...album,
            backgroundAudio: undefined,
            tracks: [
              ...album.tracks.filter((track) => track.id === trackId),
              ...album.tracks.filter((track) => track.id !== trackId),
            ],
          }
        : album,
    [album, trackId],
  );
  const { state, manager } = useAudioPlayer(playbackAlbum);
  const closeDirectory = useCallback(() => setDirectoryOpen(false), []);
  const select = useCallback(
    (position: number) => {
      setSelectedId(albums[position]?.id);
      setTrackId(undefined);
      setDirectoryOpen(false);
    },
    [albums],
  );
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        directoryOpen ||
        !albums.length ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        /INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement)?.tagName) ||
        (event.target as HTMLElement)?.isContentEditable
      )
        return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        select((index - 1 + albums.length) % albums.length);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        select((index + 1) % albums.length);
      }
      if (event.code === "Space" && event.target === document.body) {
        event.preventDefault();
        if (state.status === "playing") manager.pause();
        else void manager.play();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [albums, index, directoryOpen, select, manager, state.status]);
  return (
    <MotionConfig reducedMotion="user">
      <motion.main
        className="gallery"
        animate={{ backgroundColor: album?.backgroundColor ?? "#141b18" }}
        transition={{ duration: 1 }}
      >
        <header className="site-header">
          <Brand />
          <span className="header-caption">A PERSONAL RECORD COLLECTION</span>
          <nav>
            <button
              className="collection-button"
              onClick={() => setDirectoryOpen(true)}
            >
              <Library size={16} strokeWidth={1.3} />
              <span>COLLECTION</span>
              <span className="collection-count">
                {String(albums.length).padStart(2, "0")}
              </span>
            </button>
            <Link href="/admin" className="archive-link">
              MANAGE
              <ArrowUpRight size={15} />
            </Link>
          </nav>
        </header>
        {error && (
          <div className="storage-warning" role="alert">
            {error} 当前显示只读示例，上传未保存。
          </div>
        )}
        <div className="gallery-content">
          {loading ? (
            <div className="gallery-loading">
              <span className="eyebrow">OPENING THE ARCHIVE</span>
              <span className="loading-line" />
            </div>
          ) : album ? (
            <>
              <div className="exhibit-topline">
                <span>CURATED BY YOU. KEPT FOR THE MOMENT.</span>
                <span className="edition-label">
                  VOL. {String(index + 1).padStart(2, "0")} /{" "}
                  {String(albums.length).padStart(2, "0")}
                </span>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <AlbumView key={album.id} album={album} number={index + 1}>
                  <AudioPlayer
                    album={playbackAlbum!}
                    state={state}
                    manager={manager}
                    retry={() => void manager.select(playbackAlbum)}
                    onTrack={setTrackId}
                  />
                </AlbumView>
              </AnimatePresence>
              <AlbumNavigation
                albums={albums}
                index={index}
                onSelect={select}
              />
            </>
          ) : (
            <div className="empty-state">
              <span className="eyebrow">YOUR COLLECTION STARTS HERE</span>
              <h1>
                A space for
                <br />
                your records.
              </h1>
              <p>收藏第一张专辑，让它的声音与封面留在这里。</p>
              <Link href="/admin" className="button primary">
                Add your first album
              </Link>
            </div>
          )}
        </div>
        <footer className="site-footer">
          <span>IN GOOD COMPANY WITH SOUND.</span>
          <span className="keyboard-hint">USE ← → TO EXPLORE</span>
          <span>SLEEVE © {new Date().getFullYear()}</span>
        </footer>
        <AnimatePresence>
          {directoryOpen && (
            <AlbumDirectory
              albums={albums}
              currentId={album?.id}
              onSelect={select}
              onClose={closeDirectory}
            />
          )}
        </AnimatePresence>
      </motion.main>
    </MotionConfig>
  );
}
