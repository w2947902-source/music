"use client";
import {
  Pause,
  Play,
  Volume2,
  VolumeX,
  Headphones,
  RotateCcw,
} from "lucide-react";
import type { Album } from "@/types/album";
import type { AudioManager, AudioSnapshot } from "@/lib/audio/AudioManager";
import { formatTime } from "@/lib/albums/validation";
export function AudioPlayer({
  album,
  state,
  manager,
  retry,
  onTrack,
}: {
  album: Album;
  state: AudioSnapshot;
  manager: AudioManager;
  retry: () => void;
  onTrack: (trackId: string) => void;
}) {
  const playing = state.playingIntent;
  const ready = state.status === "playing" || state.status === "paused";
  const length = state.end - state.start;
  return (
    <div className="audio-player">
      <div className="player-topline">
        <span className="eyebrow">
          {playing ? "NOW LISTENING" : "ON THE RECORD"}
        </span>
        <span className="clip-label">
          {album.isDemo ? "ORIGINAL DEMO" : "SELECTED EXCERPT"}
        </span>
      </div>
      <div className="player-track">
        <button
          className="play-button"
          disabled={!ready && !playing}
          onClick={() => (playing ? manager.pause() : void manager.play())}
          aria-label={playing ? "暂停" : "开始播放"}
        >
          {playing ? (
            <Pause size={19} fill="currentColor" />
          ) : (
            <Play size={19} fill="currentColor" />
          )}
        </button>
        <div>
          <span className="track-name">
            {state.track?.title ?? "No audio yet"}
          </span>
          <span className="track-caption">
            {state.status === "loading"
              ? "正在准备音频…"
              : playing
                ? "A little closer. A little quieter."
                : "Press play. Stay a while."}
          </span>
        </div>
        <span className="track-number">
          {state.track ? String(state.track.trackNumber).padStart(2, "0") : "—"}
        </span>
      </div>
      <div className="progress-wrap">
        <input
          aria-label="播放进度"
          className="progress-input"
          type="range"
          min={state.start}
          max={Math.max(state.start + 0.01, state.end)}
          step="0.1"
          value={Math.max(
            state.start,
            Math.min(state.currentTime, state.end || state.start),
          )}
          disabled={!ready}
          onChange={(event) => manager.seek(Number(event.target.value))}
          style={
            {
              "--progress": `${length > 0 ? Math.max(0, Math.min(100, ((state.currentTime - state.start) / length) * 100)) : 0}%`,
            } as React.CSSProperties
          }
        />
        <div className="player-time">
          <span>
            {formatTime(Math.max(0, state.currentTime - state.start))}
          </span>
          <span>{formatTime(Math.max(0, length))}</span>
        </div>
      </div>
      <div className="player-bottom">
        <span className="listening-note">
          <Headphones size={14} />
          {album.isDemo ? "Original ambient demo" : "Your own soundtrack"}
        </span>
        <div className="volume-control">
          <button
            aria-label={state.volume === 0 ? "取消静音" : "静音"}
            onClick={() => manager.setVolume(state.volume === 0 ? 0.7 : 0)}
          >
            {state.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            aria-label="音量"
            min="0"
            max="1"
            step="0.01"
            value={state.volume}
            onChange={(event) => manager.setVolume(Number(event.target.value))}
          />
        </div>
      </div>
      {state.status === "paused" && (
        <button className="start-listening" onClick={() => void manager.play()}>
          <Play size={12} fill="currentColor" /> START LISTENING
        </button>
      )}
      {state.message && (
        <div className="audio-message" role="status">
          {state.message}
          {state.status === "error" && (
            <button onClick={retry}>
              <RotateCcw size={14} /> 重试
            </button>
          )}
        </div>
      )}
      {album.tracks.length > 1 && (
        <details className="track-disclosure">
          <summary>
            查看曲目 <span>{album.tracks.length} tracks</span>
          </summary>
          <div className="gallery-tracks">
            {album.tracks.map((track) => (
              <button
                key={track.id}
                disabled={!track.audioUrl}
                onClick={() => onTrack(track.id)}
                className={track.id === state.track?.id ? "active" : ""}
              >
                <span>{String(track.trackNumber).padStart(2, "0")}</span>
                <span>{track.title}</span>
                <span>{formatTime(track.duration ?? 0)}</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
