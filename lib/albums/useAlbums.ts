"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Album } from "@/types/album";
import { cloudAlbumRepository, type ArchiveMode } from "@/lib/supabase/albumRepository";
import { synchronizePublicMedia } from "@/lib/storage/mediaUrls";

export function useAlbums(mode: ArchiveMode = "public") {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await cloudAlbumRepository.getAll(mode);
      if (current !== sequence.current) return;
      if (mode === "public") synchronizePublicMedia(next.flatMap(album => [album.coverUrl, ...album.tracks.map(track => track.audioUrl)]));
      setAlbums(next);
      setError(null);
    } catch (cause) {
      if (current !== sequence.current) return;
      setError(cause instanceof Error ? cause.message : "无法读取档案馆，请稍后重试。");
      setAlbums([]);
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [mode]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void refresh();
    });
    const update = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false;
      invalidate();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh, invalidate]);
  return { albums, loading, error, refresh };
}
