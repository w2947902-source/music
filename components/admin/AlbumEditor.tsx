"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, ImagePlus, Loader2, Plus, Upload, X } from "lucide-react";
import type { Album, AudioClip, PendingAsset, Track } from "@/types/album";
import { validateAlbum } from "@/lib/albums/validation";
import { albumRepository } from "@/lib/storage/albumRepository";
import { probeAudioFile, validateCover } from "@/lib/audio/probeFile";
import { AlbumCover } from "@/components/album/AlbumCover";
import { AudioClipEditor } from "@/components/audio/AudioClipEditor";
import { useDialog } from "@/components/ui/useDialog";
import { TrackEditor } from "./TrackEditor";

const COLORS = ["#141b18", "#101a25", "#281c16", "#201923", "#191919"];
export function AlbumEditor({
  album,
  order,
  onClose,
  onSaved,
}: {
  album?: Album;
  order: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Album>(() =>
    album
      ? structuredClone(album)
      : {
          id: crypto.randomUUID(),
          title: "",
          artist: "",
          coverUrl: "",
          order,
          tracks: [],
          backgroundColor: COLORS[0],
        },
  );
  const [coverPreview, setCoverPreview] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [clipTrackId, setClipTrackId] = useState(
    album?.backgroundAudio?.trackId ?? album?.tracks[0]?.id ?? "",
  );
  const [clipDirty, setClipDirty] = useState(false);
  const pending = useRef<PendingAsset[]>([]);
  const objectUrls = useRef<string[]>([]);
  const audioInput = useRef<HTMLInputElement>(null);
  const closed = useRef(false);
  const busy = uploading || saving;
  const panel = useDialog(onClose);
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
    };
  }, []);
  const setField = <K extends keyof Album>(field: K, value: Album[K]) =>
    setDraft((previous) => ({ ...previous, [field]: value }));
  async function uploadCover(file?: File) {
    if (!file) return;
    setError(undefined);
    setUploading(true);
    try {
      await validateCover(file);
      if (closed.current) return;
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      pending.current = [
        ...pending.current.filter((asset) => asset.kind !== "cover"),
        { id, blob: file, kind: "cover" },
      ];
      setCoverPreview(url);
      setField("coverUrl", `asset:${id}`);
    } catch (cause) {
      if (!closed.current)
        setError(cause instanceof Error ? cause.message : "封面上传失败。");
    } finally {
      if (!closed.current) setUploading(false);
    }
  }
  async function uploadTracks(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setError(undefined);
    const tracks: Track[] = [];
    const failures: string[] = [];
    for (const file of files) {
      if (closed.current) break;
      try {
        const duration = await probeAudioFile(file);
        if (closed.current) break;
        const id = crypto.randomUUID();
        const trackId = crypto.randomUUID();
        pending.current.push({ id, blob: file, kind: "audio" });
        const url = URL.createObjectURL(file);
        objectUrls.current.push(url);
        tracks.push({
          id: trackId,
          title: file.name.replace(/\.[^.]+$/, "").replace(/^\d+[\s._-]+/, ""),
          audioUrl: `asset:${id}`,
          duration,
          trackNumber: draft.tracks.length + tracks.length + 1,
        });
        setPreviewUrls((previous) => ({ ...previous, [trackId]: url }));
      } catch (cause) {
        failures.push(
          cause instanceof Error ? cause.message : `无法读取 ${file.name}`,
        );
      }
    }
    if (closed.current) return;
    setDraft((previous) => ({
      ...previous,
      tracks: [...previous.tracks, ...tracks].map((track, index) => ({
        ...track,
        trackNumber: index + 1,
      })),
    }));
    if (!clipTrackId && tracks[0]) {
      setClipTrackId(tracks[0].id);
      setClipDirty(true);
    }
    if (failures.length) setError(failures.join("\n"));
    setUploading(false);
  }
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const selectedTrack = draft.tracks.find((track) => track.id === clipTrackId);
  const waveformTrack = selectedTrack
    ? {
        ...selectedTrack,
        audioUrl: previewUrls[selectedTrack.id] ?? selectedTrack.audioUrl,
      }
    : undefined;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const failure = validateAlbum(draft);
    if (failure) {
      setError(failure);
      return;
    }
    if (
      draft.tracks.length &&
      clipTrackId &&
      (!draft.backgroundAudio || clipDirty)
    ) {
      setError(
        "请先点击 Confirm Selection 确认背景音乐片段，或选择不使用背景音乐。",
      );
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const sanitized = {
        ...draft,
        title: draft.title.trim(),
        artist: draft.artist.trim(),
        tracks: draft.tracks.map((track) => ({
          ...track,
          title: track.title.trim(),
        })),
      };
      if (album) await albumRepository.update(sanitized, pending.current);
      else await albumRepository.create(sanitized, pending.current);
      await onSaved();
      onClose();
    } catch (cause) {
      if (!closed.current)
        setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      if (!closed.current) setSaving(false);
    }
  }
  function changeTracks(tracks: Track[]) {
    setDraft((previous) => ({
      ...previous,
      tracks,
      backgroundAudio: tracks.some(
        (track) => track.id === previous.backgroundAudio?.trackId,
      )
        ? previous.backgroundAudio
        : undefined,
    }));
    if (!tracks.some((track) => track.id === clipTrackId)) {
      setClipTrackId(tracks[0]?.id ?? "");
      setClipDirty(Boolean(tracks.length));
    }
  }
  const confirmClip = (clip: AudioClip) => {
    setField("backgroundAudio", clip);
    setClipDirty(false);
  };
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="editor-panel"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        tabIndex={-1}
      >
        <form onSubmit={save}>
          <div className="editor-heading">
            <div>
              <span className="eyebrow">THE PERSONAL ARCHIVE</span>
              <h2 id="editor-title">
                {album ? "Edit your record." : "A new addition."}
              </h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="关闭专辑编辑器"
              disabled={saving}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            <div className="editor-body">
              <div className="cover-upload">
                <span className="eyebrow">ALBUM ARTWORK</span>
                <label className="cover-upload-label">
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp"
                    aria-label="上传专辑封面"
                    onChange={(event) => {
                      void uploadCover(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  {coverPreview || draft.coverUrl ? (
                    <>
                      <AlbumCover
                        source={coverPreview ?? draft.coverUrl}
                        title={draft.title || "Album cover"}
                      />
                      <span className="replace-cover">
                        Change cover / 更换封面
                      </span>
                    </>
                  ) : (
                    <span className="upload-cover-prompt">
                      <ImagePlus size={28} strokeWidth={1} />
                      <span>
                        Upload album cover
                        <br />
                        上传专辑封面
                      </span>
                    </span>
                  )}
                </label>
                <p className="file-help">
                  JPG、PNG、WebP · 建议正方形
                  <br />
                  封面可以稍后添加
                </p>
              </div>
              <div>
                <div className="field-grid">
                  <div className="field full">
                    <label htmlFor="album-title">
                      Album title / 专辑名称 *
                    </label>
                    <input
                      id="album-title"
                      className="input"
                      autoComplete="off"
                      maxLength={200}
                      required
                      placeholder="Give this record a name"
                      value={draft.title}
                      onChange={(event) =>
                        setField("title", event.target.value)
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="album-artist">Artist / 艺术家 *</label>
                    <input
                      id="album-artist"
                      className="input"
                      maxLength={200}
                      required
                      placeholder="The artist behind the sound"
                      value={draft.artist}
                      onChange={(event) =>
                        setField("artist", event.target.value)
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="album-year">Year / 年份</label>
                    <input
                      id="album-year"
                      className="input"
                      type="number"
                      min="1000"
                      max="9999"
                      placeholder="2026"
                      value={draft.year ?? ""}
                      onChange={(event) =>
                        setField(
                          "year",
                          event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="album-description">
                    Sleeve notes / 简介（可选）
                  </label>
                  <textarea
                    id="album-description"
                    className="textarea"
                    rows={2}
                    maxLength={1000}
                    placeholder="A few words about this record…"
                    value={draft.description ?? ""}
                    onChange={(event) =>
                      setField("description", event.target.value)
                    }
                  />
                </div>
                <div className="field">
                  <label>Room color / 展厅背景</label>
                  <div className="color-swatches">
                    {COLORS.map((color, index) => (
                      <button
                        type="button"
                        className={`color-swatch ${draft.backgroundColor === color ? "selected" : ""}`}
                        style={{ background: color }}
                        key={color}
                        aria-label={`背景颜色 ${["森林绿", "午夜蓝", "暖棕", "深紫", "炭黑"][index]}`}
                        aria-pressed={draft.backgroundColor === color}
                        onClick={() => setField("backgroundColor", color)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <section className="editor-section">
              <div className="editor-section-heading">
                <h3>
                  Track list <span>/ 曲目 · {draft.tracks.length}</span>
                </h3>
                <button
                  type="button"
                  className="button"
                  onClick={() => audioInput.current?.click()}
                >
                  <Plus size={15} />
                  Add tracks
                </button>
              </div>
              <input
                ref={audioInput}
                type="file"
                className="sr-only"
                multiple
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                aria-label="上传多首音频"
                onChange={(event) => {
                  void uploadTracks(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
              {draft.tracks.length ? (
                <TrackEditor
                  tracks={draft.tracks}
                  onChange={changeTracks}
                  disabled={busy}
                />
              ) : (
                <button
                  className="upload-tracks"
                  type="button"
                  style={{ width: "100%" }}
                  onClick={() => audioInput.current?.click()}
                >
                  <Upload size={24} strokeWidth={1} />
                  <span>Choose the sounds that belong here.</span>
                  <span className="file-help">
                    点击选择多首音频 · MP3、WAV、M4A
                  </span>
                </button>
              )}
            </section>
            {draft.tracks.length > 0 && (
              <section className="editor-section">
                <div className="editor-section-heading">
                  <h3>
                    The album’s sound <span>/ 背景音乐片段</span>
                  </h3>
                </div>
                <p className="clip-intro">
                  Which track should represent this album?
                  <br />
                  选择一首歌曲，圈出想留在展厅里的片段。
                </p>
                <div className="clip-track-choice">
                  <select
                    className="select"
                    aria-label="选择背景音乐歌曲"
                    value={clipTrackId}
                    onChange={(event) => {
                      setClipTrackId(event.target.value);
                      setField("backgroundAudio", undefined);
                      setClipDirty(Boolean(event.target.value));
                    }}
                  >
                    <option value="">
                      不使用背景音乐 / No background audio
                    </option>
                    {draft.tracks.map((track) => (
                      <option key={track.id} value={track.id}>
                        {String(track.trackNumber).padStart(2, "0")} ·{" "}
                        {track.title}
                      </option>
                    ))}
                  </select>
                  <span className="file-help">选区会在展示时循环播放</span>
                </div>
                {waveformTrack && (
                  <AudioClipEditor
                    key={waveformTrack.id}
                    track={waveformTrack}
                    initialClip={
                      draft.backgroundAudio?.trackId === waveformTrack.id
                        ? draft.backgroundAudio
                        : undefined
                    }
                    onConfirm={confirmClip}
                    onDirty={() => setClipDirty(true)}
                    disabled={busy}
                  />
                )}
              </section>
            )}
          </fieldset>
          {uploading && (
            <p className="clip-confirmed" role="status">
              <Loader2 size={15} />
              正在读取上传文件…
            </p>
          )}
          {error && (
            <p
              className="notice error"
              role="alert"
              style={{ whiteSpace: "pre-line" }}
            >
              {error}
            </p>
          )}
          <div className="editor-footer">
            <p className="file-help">
              封面与音频保存在当前浏览器中。
              <br />
              保存后会自动出现在你的唱片馆。
            </p>
            <div className="editor-footer-actions">
              <button
                type="button"
                className="button"
                disabled={saving}
                onClick={onClose}
              >
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                {saving ? <Loader2 size={16} /> : <Check size={16} />}
                {saving ? "Saving…" : "Save album"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
