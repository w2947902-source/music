"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.esm.js";
import { Check, Pause, Play, RotateCcw, Loader2 } from "lucide-react";
import type { AudioClip, Track } from "@/types/album";
import { formatTime, validateClip } from "@/lib/albums/validation";
import { useMediaUrl } from "@/lib/storage/useMediaUrl";

export function AudioClipEditor({
  track,
  initialClip,
  onConfirm,
  onDirty,
  onRangeChange,
  disabled,
  peaks,
}: {
  track: Track;
  initialClip?: AudioClip;
  onConfirm: (clip: AudioClip) => Promise<void>;
  onDirty: () => void;
  onRangeChange?: (clip: AudioClip) => void;
  disabled?: boolean;
  peaks?: number[][];
}) {
  const media = useMediaUrl(track.audioUrl);
  const container = useRef<HTMLDivElement>(null);
  const waves = useRef<WaveSurfer | null>(null);
  const region = useRef<Region | null>(null);
  const callbacks = useRef({ onDirty, onConfirm });
  const original = useRef(initialClip);
  const [duration, setDuration] = useState(track.duration ?? 0);
  const [start, setStart] = useState(initialClip?.start ?? 0);
  const [end, setEnd] = useState(
    initialClip?.end ?? Math.min(track.duration ?? 30, 30),
  );
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmed, setConfirmed] = useState(Boolean(initialClip));
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    callbacks.current = { onDirty, onConfirm };
  }, [onDirty, onConfirm]);
  useEffect(() => {
    onRangeChange?.({trackId:track.id,start,end});
  }, [track.id,start,end,onRangeChange]);
  const dirty = useCallback(() => {
    setConfirmed(false);
    callbacks.current.onDirty();
  }, []);
  useEffect(() => {
    if (!media.url || !container.current) return;
    let alive = true;
    const plugin = RegionsPlugin.create();
    const wave = WaveSurfer.create({
      container: container.current,
      waveColor: "#647561",
      progressColor: "#c3cfaa",
      cursorColor: "#e5eed6",
      height: 116,
      barWidth: 2,
      barGap: 2,
      barRadius: 1,
      normalize: true,
      plugins: [plugin],
    });
    waves.current = wave;
    const fail = () => {
      if (alive) {
        setError("无法生成波形。请尝试 MP3 或 WAV 文件。");
        setReady(false);
      }
    };
    const timeout = setTimeout(fail, 30000);
    wave.on("ready", (length) => {
      clearTimeout(timeout);
      if (!alive) return;
      setDuration(length);
      setReady(true);
      const clip = original.current;
      const from = Math.min(clip?.start ?? 0, Math.max(0, length - 0.1));
      const to = Math.min(clip?.end ?? Math.min(30, length), length);
      setStart(from);
      setEnd(to);
      region.current = plugin.addRegion({
        id: "background",
        start: from,
        end: Math.max(from + 0.05, to),
        color: "rgba(195,207,170,0.17)",
        drag: true,
        resize: true,
        minLength: 0.05,
      });
      plugin.enableDragSelection({
        color: "rgba(195,207,170,0.17)",
        minLength: 0.05,
      });
    });
    plugin.on("region-created", (created) => {
      if (created.id !== "background") {
        region.current?.remove();
        region.current = created;
        setStart(created.start);
        setEnd(created.end);
        dirty();
      }
    });
    plugin.on("region-updated", (updated) => {
      setStart(updated.start);
      setEnd(updated.end);
      wave.pause();
      dirty();
    });
    wave.on("play", () => {
      if (alive) setPlaying(true);
    });
    wave.on("pause", () => {
      if (alive) setPlaying(false);
    });
    wave.on("timeupdate", (time) => {
      if (region.current && time >= region.current.end) wave.pause();
    });
    wave.on("error", fail);
    void wave.load(media.url,peaks,peaks ? track.duration : undefined).catch(fail);
    return () => {
      alive = false;
      clearTimeout(timeout);
      wave.destroy();
      waves.current = null;
      region.current = null;
    };
  }, [media.url, dirty, peaks, track.duration]);
  const validation = validateClip({ trackId: track.id, start, end }, [
    { ...track, duration },
  ]) ?? (end-start < 20 || end-start > 60 ? "请选择 20–60 秒片段。" : null);
  const blocked = disabled || processing;
  function updateRange(from: number, to: number) {
    setStart(from);
    setEnd(to);
    dirty();
    waves.current?.pause();
    if (
      Number.isFinite(from) &&
      Number.isFinite(to) &&
      from >= 0 &&
      from < to &&
      to <= duration
    )
      region.current?.setOptions({ start: from, end: to });
  }
  return (
    <div className="clip-editor">
      <div className="waveform-wrap" style={{pointerEvents:blocked ? "none" : undefined}}>
        <div ref={container} aria-label={`${track.title} 音频波形`} />
        {!ready && (
          <div className="waveform-status" role="status">
            {error ?? media.error ?? "正在解码音频并生成波形…"}
          </div>
        )}
      </div>
      <div className="waveform-times">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
      <p className="file-help" style={{ marginTop: 12 }}>
        拖动两端选择 20–60 秒。保存时自动生成片段，也可以先生成试听。
      </p>
      <div className="clip-fields">
        <div className="field">
          <label htmlFor="clip-start">Start / 起点（秒）</label>
          <input
            id="clip-start"
            className="input"
            type="number"
            min="0"
            max={duration}
            step="0.1"
            value={Number.isFinite(start) ? Number(start.toFixed(2)) : ""}
            disabled={!ready || blocked}
            onChange={(event) =>
              updateRange(
                event.target.value === "" ? NaN : Number(event.target.value),
                end,
              )
            }
          />
        </div>
        <span className="muted">—</span>
        <div className="field">
          <label htmlFor="clip-end">End / 终点（秒）</label>
          <input
            id="clip-end"
            className="input"
            type="number"
            min="0"
            max={duration}
            step="0.1"
            value={Number.isFinite(end) ? Number(end.toFixed(2)) : ""}
            disabled={!ready || blocked}
            onChange={(event) =>
              updateRange(
                start,
                event.target.value === "" ? NaN : Number(event.target.value),
              )
            }
          />
        </div>
        <span className="clip-duration">
          {formatTime(start)} — {formatTime(end)}
        </span>
      </div>
      {validation && ready && (
        <p className="notice error" role="alert">
          {validation}
        </p>
      )}
      <div className="clip-actions">
        <button
          type="button"
          className="button"
          disabled={!ready || !!validation || blocked}
          onClick={() => {
            if (playing) waves.current?.pause();
            else
              void waves.current
                ?.play(start, end)
                .catch(() => setError("播放失败，请重试。"));
          }}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
          {playing ? "Pause" : "Play Selection"}
        </button>
        <button
          type="button"
          className="button"
          disabled={!ready || blocked}
          onClick={() => updateRange(0, Math.min(30, duration))}
        >
          <RotateCcw size={14} />
          Reset
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!ready || !!validation || blocked}
          onClick={async () => {
            waves.current?.pause();
            setProcessing(true); setError(undefined);
            try { await callbacks.current.onConfirm({ trackId: track.id, start, end }); setConfirmed(true); }
            catch(cause) { setError(cause instanceof Error ? cause.message : "片段生成失败，请重试。"); }
            finally { setProcessing(false); }
          }}
        >
          {processing ? <Loader2 size={15} /> : <Check size={15} />}
          {processing ? "正在生成片段…" : "生成独立片段"}
        </button>
      </div>
      {confirmed && (
        <p className="clip-confirmed">
          <Check size={14} />
          片段已生成，保存专辑后上传。
        </p>
      )}
      {error && ready && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
