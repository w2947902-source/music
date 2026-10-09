"use client";
import { useCallback, useEffect, useState } from "react";
import type { Album } from "@/types/album";
import { albumRepository } from "@/lib/storage/albumRepository";
import { demoAlbums } from "./demo";

export function useAlbums() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      await albumRepository.initialize();
      setAlbums(await albumRepository.getAll());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取本地收藏。");
      setAlbums(demoAlbums);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
    const update = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
  return { albums, loading, error, refresh };
}
