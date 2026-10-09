"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, ImagePlus, Loader2, Upload, X } from "lucide-react";
import type { Album, AudioClip, PendingAsset } from "@/types/album";
import { validateAlbum } from "@/lib/albums/validation";
import { cloudAlbumRepository as albumRepository } from "@/lib/supabase/albumRepository";
import { validateCover } from "@/lib/audio/probeFile";
import { decodeMp3, decodeBlob, encodeExcerpt, type DecodedSource } from "@/lib/audio/localClip";
import { readMp3Metadata } from "@/lib/audio/mp3Metadata";
import { acquireMediaUrl, releaseMediaUrl } from "@/lib/storage/mediaUrls";
import { AlbumCover } from "@/components/album/AlbumCover";
import { AudioClipEditor } from "@/components/audio/AudioClipEditor";
import { useDialog } from "@/components/ui/useDialog";

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
  onSaved: (warning?: string) => Promise<void>;
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
          published: false,
        },
  );
  const [coverPreview, setCoverPreview] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [importNotice, setImportNotice] = useState<string>();
  const [importedFile, setImportedFile] = useState<string>();
  const [clipTrackId, setClipTrackId] = useState(
    album?.backgroundAudio?.trackId ?? album?.tracks[0]?.id ?? "",
  );
  const [clipDirty, setClipDirty] = useState(false);
  const pending = useRef<PendingAsset[]>([]);
  const [sources, setSources] = useState<Map<string, DecodedSource>>(() => new Map());
  const clipSelection = useRef<AudioClip | undefined>(undefined);
  const saveInFlight = useRef(false);
  const encoder = useRef<AbortController | null>(null);
  const objectUrls = useRef<string[]>([]);
  const audioInput = useRef<HTMLInputElement>(null);
  const metadataSettings = useRef<HTMLDetailsElement>(null);
  const closed = useRef(false);
  const busy = uploading || saving;
  const panel = useDialog(onClose);
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
      encoder.current?.abort();
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
    };
  }, []);
  const setField = <K extends keyof Album>(field: K, value: Album[K]) =>
    setDraft((previous) => ({ ...previous, [field]: value }));
  function stageCover(file: File): string {
    const id = crypto.randomUUID();
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    pending.current = [
      ...pending.current.filter((asset) => asset.kind !== "cover"),
      { id, blob: file, kind: "cover" },
    ];
    setCoverPreview(url);
    return `asset:${id}`;
  }
  async function uploadCover(file?: File) {
    if (!file) return;
    setError(undefined);
    setUploading(true);
    try {
      if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5*1024*1024) throw new Error("请选择 5 MB 以内的 JPG、PNG 或 WebP 封面。");
      await validateCover(file);
      if (closed.current) return;
      setField("coverUrl", stageCover(file));
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
    setImportNotice(undefined);
    try {
      const file = files[0];
      const decoded = await decodeMp3(file);
      if (closed.current) { URL.revokeObjectURL(decoded.url); return; }
      objectUrls.current.push(decoded.url);
      const metadata = await readMp3Metadata(file);
      if (closed.current) return;
      const coverUrl = metadata.cover && (!album || !draft.coverUrl) ? stageCover(metadata.cover) : undefined;
      const trackId = draft.tracks[0]?.id ?? crypto.randomUUID();
      for (const source of sources.values()) {
        URL.revokeObjectURL(source.url);
        objectUrls.current = objectUrls.current.filter(url => url !== source.url);
      }
      for (const url of Object.values(previewUrls)) {
        URL.revokeObjectURL(url);
        objectUrls.current = objectUrls.current.filter(item => item !== url);
      }
      pending.current = pending.current.filter(asset => asset.kind === "cover");
      setPreviewUrls({});
      setSources(new Map([[trackId, decoded]]));
      setDraft(previous => ({...previous,
        title: album && previous.title.trim() ? previous.title : metadata.album,
        artist: album && previous.artist.trim() ? previous.artist : metadata.artist,
        year: album ? previous.year ?? metadata.year : metadata.year,
        coverUrl: coverUrl || previous.coverUrl,
        tracks: [{id:trackId,title:metadata.title,audioUrl:"",trackNumber:1}],
        backgroundAudio: undefined,
      }));
      clipSelection.current = { trackId, start: 0, end: Math.min(30, decoded.buffer.duration) };
      setImportedFile(file.name);
      setImportNotice(metadata.notice);
      setClipTrackId(trackId);
      setClipDirty(true);
    } catch (cause) { if (!closed.current) setError(cause instanceof Error ? cause.message : "MP3 读取失败，请重试。"); }
    finally { if (!closed.current) setUploading(false); }
  }
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const selectedTrack = draft.tracks.find((track) => track.id === clipTrackId);
  const selectedSource = selectedTrack ? sources.get(selectedTrack.id) : undefined;
  const waveformTrack = selectedTrack && (selectedSource || selectedTrack.audioUrl)
    ? {
        ...selectedTrack,
        audioUrl: selectedSource?.url ?? previewUrls[selectedTrack.id] ?? selectedTrack.audioUrl,
        duration: selectedSource?.buffer.duration ?? selectedTrack.duration,
      }
    : undefined;
  async function save(event: React.FormEvent, published = false) {
    event.preventDefault();
    if (busy || saveInFlight.current) return;
    const failure = validateAlbum(draft);
    if (failure) {
      if (metadataSettings.current) metadataSettings.current.open = true;
      setError(failure);
      return;
    }
    if (!waveformTrack) {
      setError("请先添加 MP3 文件。");
      return;
    }
    saveInFlight.current = true;
    setSaving(true);
    setError(undefined);
    try {
      // Save the freshly encoded result without waiting for React state to update.
      const readyAlbum = clipDirty || !selectedTrack?.audioUrl
        ? await confirmClip(clipSelection.current ?? {
            trackId: waveformTrack.id, start: 0, end: Math.min(30, waveformTrack.duration ?? 30),
          })
        : draft;
      const sanitized = {
        ...readyAlbum,
        published,
        title: readyAlbum.title.trim(),
        artist: readyAlbum.artist.trim(),
        tracks: readyAlbum.tracks.map((track) => ({
          ...track,
          title: track.title.trim(),
        })),
      };
      const warning = await albumRepository.save(sanitized, pending.current);
      await onSaved(warning);
      onClose();
    } catch (cause) {
      if (!closed.current)
        setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      saveInFlight.current = false;
      if (!closed.current) setSaving(false);
    }
  }
  const confirmClip = async (clip: AudioClip): Promise<Album> => {
    if (!waveformTrack) throw new Error("请选择音频。");
    setUploading(true); setError(undefined);
    encoder.current = new AbortController();
    let acquired: string | undefined;
    try {
      let buffer = selectedSource?.buffer;
      if (!buffer) {
        acquired = waveformTrack.audioUrl;
        const url = await acquireMediaUrl(acquired);
        const response = await fetch(url);
        if (!response.ok) throw new Error("无法读取已上传片段，请检查网络。");
        buffer = await decodeBlob(await response.blob());
      }
      const result = await encodeExcerpt(buffer,clip.start,clip.end,encoder.current.signal);
      if (closed.current) throw new Error("音频处理已取消。");
      const id = crypto.randomUUID();
      const previous = draft.tracks.find(t => t.id === clip.trackId)?.audioUrl;
      pending.current = pending.current.filter(a => `asset:${a.id}` !== previous);
      pending.current.push({id,blob:result.blob,kind:"audio",duration:result.duration});
      const url = URL.createObjectURL(result.blob);
      objectUrls.current.push(url);
      const oldPreview = previewUrls[clip.trackId];
      if (oldPreview) { URL.revokeObjectURL(oldPreview); objectUrls.current = objectUrls.current.filter(item => item !== oldPreview); }
      setPreviewUrls(previous => ({...previous,[clip.trackId]:url}));
      // Retain the original waveform locally so later edits can use the full song.
      const nextAlbum = {...draft,
        tracks:draft.tracks.map(t => t.id === clip.trackId ? {...t,audioUrl:`asset:${id}`,duration:result.duration} : t),
        backgroundAudio:{trackId:clip.trackId,start:0,end:result.duration},
      };
      setDraft(nextAlbum);
      setClipDirty(false);
      return nextAlbum;
    } finally {
      if (acquired) releaseMediaUrl(acquired);
      if (!closed.current) setUploading(false);
    }
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
        <form onSubmit={save} noValidate>
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
            <button
              className="upload-tracks mp3-import"
              type="button"
              disabled={busy}
              onClick={() => audioInput.current?.click()}
            >
              <Upload size={26} strokeWidth={1} />
              <strong>{uploading ? "正在处理…" : draft.tracks.length ? "更换 MP3 文件" : "添加 MP3 文件"}</strong>
              <span className="file-help">自动提取封面、专辑名、歌手和歌名</span>
            </button>
            <input
              ref={audioInput}
              type="file"
              className="sr-only"
              accept="audio/mpeg,.mp3"
              aria-label="添加 MP3 文件"
              onChange={(event) => {
                void uploadTracks(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            {(draft.title || draft.tracks.length > 0) && (
              <div className="imported-record" aria-live="polite">
                <div className="imported-record-cover">
                  <AlbumCover source={coverPreview ?? draft.coverUrl} title={draft.title || "专辑封面"} />
                </div>
                <div className="imported-record-info">
                  <span className="eyebrow">{importedFile ? "已自动填写" : "ALBUM"}</span>
                  <h3>{draft.title}</h3>
                  <p>{draft.artist}{draft.year ? ` · ${draft.year}` : ""}</p>
                  <p className="imported-record-song">{selectedTrack?.title ?? draft.tracks[0]?.title}</p>
                  {importNotice && <p className="file-help">{importNotice}</p>}
                </div>
              </div>
            )}
            <details className="metadata-details" ref={metadataSettings}>
              <summary>修改识别信息 / 更多设置</summary>
            <div className="editor-body">
              <div className="cover-upload">
                <span className="eyebrow">ALBUM ARTWORK</span>
                <label className="cover-upload-label">
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
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
                  JPG、PNG、WebP · 5 MB 以内 · 建议正方形
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
            {selectedTrack && <div className="field" style={{marginTop:20}}>
              <label htmlFor="song-title">歌曲名称</label>
              <input id="song-title" className="input" maxLength={200} value={selectedTrack.title}
                onChange={event => setField("tracks", [{...selectedTrack, title:event.target.value}])} />
            </div>}
            </details>
            {draft.tracks.length > 0 && (
              <section className="editor-section">
                <div className="editor-section-heading">
                  <h3>
                    The album’s sound <span>/ 本地截取音乐片段</span>
                  </h3>
                </div>
                <p className="clip-intro">
                  默认选取前 30 秒，也可拖动波形两端选择 20–60 秒。保存时自动生成并上传片段。
                </p>
                {waveformTrack && (
                  <AudioClipEditor
                    key={`${waveformTrack.id}:${waveformTrack.audioUrl}`}
                    track={waveformTrack}
                    initialClip={
                      selectedSource ? undefined : {trackId:waveformTrack.id,start:0,end:waveformTrack.duration!}
                    }
                    onConfirm={async clip => { await confirmClip(clip); }}
                    onRangeChange={clip => { clipSelection.current = clip; }}
                    onDirty={() => setClipDirty(true)}
                    disabled={busy}
                    peaks={selectedSource?.peaks}
                  />
                )}
              </section>
            )}
          </fieldset>
          {uploading && (
            <p className="clip-confirmed" role="status">
              <Loader2 size={15} />
              正在本地处理音频，请稍候…
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
              保存草稿仅你可见，发布后所有访客可浏览。
              <br />
              {album?.published ? "保存草稿会暂时取消此专辑的发布。" : "只上传独立片段，不上传完整原曲。"}
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
                {saving ? "保存中…" : "保存草稿"}
              </button>
              <button type="button" className="button primary" disabled={busy} onClick={event => void save(event,true)}>保存并发布</button>
            </div>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
