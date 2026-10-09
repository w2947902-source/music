"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Album } from "@/types/album";
import { AudioManager } from "./AudioManager";
export function useAudioPlayer(album?: Album) {
  const [manager] = useState(() => new AudioManager({ autoplay: true }));
  const state = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getServerSnapshot,
  );
  const albumRef = useRef(album);
  useEffect(() => {
    albumRef.current = album;
  }, [album]);
  const key = JSON.stringify([
    album?.id,
    album?.backgroundAudio,
    album?.tracks.map((track) => [
      track.id,
      track.audioUrl,
      track.title,
      track.duration,
    ]),
  ]);
  useEffect(() => {
    void manager.select(albumRef.current);
  }, [key, manager]);
  const mounts = useRef(0);
  // Strict Mode rehearses cleanup and setup synchronously before this microtask.
  useEffect(() => {
    mounts.current += 1;
    const counter = mounts;
    return () => {
      counter.current -= 1;
      queueMicrotask(() => {
        if (counter.current === 0) manager.dispose();
      });
    };
  }, [manager]);
  return { state, manager };
}
