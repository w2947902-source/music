"use client";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import type { Track } from "@/types/album";
import { formatTime } from "@/lib/albums/validation";
export function TrackEditor({
  tracks,
  onChange,
  disabled,
  onReplace,
}: {
  tracks: Track[];
  onChange: (tracks: Track[]) => void;
  disabled?: boolean;
  onReplace: (id:string) => void;
}) {
  const move = (index: number, direction: number) => {
    const next = [...tracks];
    const target = index + direction;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(
      next.map((track, position) => ({ ...track, trackNumber: position + 1 })),
    );
  };
  return (
    <div>
      {tracks.map((track, index) => (
        <div className="track-editor-row" key={track.id}>
          <span className="track-order">
            {String(index + 1).padStart(2, "0")}
          </span>
          <input
            className="input"
            aria-label={`歌曲 ${index + 1} 名称`}
            value={track.title}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                tracks.map((item) =>
                  item.id === track.id
                    ? { ...item, title: event.target.value }
                    : item,
                ),
              )
            }
          />
          <span className="track-duration">
            {track.audioUrl ? formatTime(track.duration ?? 0) : "—"}
          </span>
          <button type="button" className="text-button track-source-button" disabled={disabled} onClick={() => onReplace(track.id)} aria-label={`更换音频 ${track.title}`}>{track.audioUrl ? "更换 MP3" : "选择 MP3"}</button>
          <span className="track-clip-status">{track.audioUrl ? "独立片段" : "暂无片段"}</span>
          <div className="track-editor-actions">
            <button
              type="button"
              className="small-icon-button"
              aria-label={`上移 ${track.title}`}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={15} />
            </button>
            <button
              type="button"
              className="small-icon-button"
              aria-label={`下移 ${track.title}`}
              disabled={disabled || index === tracks.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={15} />
            </button>
            <button
              type="button"
              className="small-icon-button"
              aria-label={`删除歌曲 ${track.title}`}
              disabled={disabled}
              onClick={() =>
                onChange(
                  tracks
                    .filter((item) => item.id !== track.id)
                    .map((item, position) => ({
                      ...item,
                      trackNumber: position + 1,
                    })),
                )
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
