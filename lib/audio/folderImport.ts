import type { Album, PendingAsset } from "@/types/album";
import { decodeBlob, encodeExcerpt, MAX_SOURCE_BYTES, MAX_SOURCE_SECONDS } from "./localClip";
import { readMp3Metadata } from "./mp3Metadata";
import { probeAudioFile, validateCover } from "./probeFile";

export const AUDIO_FILE_ACCEPT = ".mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.webm,.aif,.aiff";
const AUDIO_EXTENSION = /\.(mp3|wav|m4a|aac|flac|ogg|opus|webm|aif|aiff)$/i;
export type FolderImportStage = "reading" | "encoding" | "uploading";
export interface ExcerptRange { start: number; end: number }
export function isImportableAudio(file: File): boolean {
  return AUDIO_EXTENSION.test(file.name) && !file.name.startsWith("._");
}
export function fileLabel(file: File): string {
  return file.webkitRelativePath || file.name;
}
function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new Error("音频处理已取消。");
}
/** Choose whole sample frames, so the independently encoded clip is exactly 30 seconds. */
export function randomThirtySeconds(buffer: AudioBuffer): ExcerptRange {
  const frames = buffer.sampleRate * 30;
  if (buffer.length < frames) throw new Error("音频不足 30 秒，无法截取完整的 30 秒片段。");
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
  const from = Math.floor(random * (buffer.length - frames + 1));
  return { start: from / buffer.sampleRate, end: (from + frames) / buffer.sampleRate };
}
function siblingCover(audio: File, files: File[]): File | undefined {
  const path = fileLabel(audio), slash = path.lastIndexOf("/");
  const directory = path.slice(0, slash + 1);
  const stem = audio.name.replace(AUDIO_EXTENSION, "").toLowerCase();
  const names = [stem, "cover", "folder", "front", "album"];
  return files.filter(file => /\.(jpe?g|png|webp)$/i.test(file.name)
    && fileLabel(file).slice(0, fileLabel(file).lastIndexOf("/") + 1) === directory)
    .sort((a, b) => names.indexOf(a.name.replace(/\.[^.]+$/, "").toLowerCase())
      - names.indexOf(b.name.replace(/\.[^.]+$/, "").toLowerCase()))
    .find(file => names.includes(file.name.replace(/\.[^.]+$/, "").toLowerCase()));
}
export async function prepareFolderAlbum({ file, files, albumId, trackId, published, signal, onProgress }: {
  file: File;
  files: File[];
  albumId: string;
  trackId: string;
  published: boolean;
  signal: AbortSignal;
  onProgress: (stage: FolderImportStage, range?: ExcerptRange) => void;
}): Promise<{ album: Album; assets: PendingAsset[]; notice?: string }> {
  checkAbort(signal);
  if (!isImportableAudio(file)) throw new Error("不支持此音频格式。");
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error("音频必须非空，且不能超过 30 MB。");
  onProgress("reading");
  const duration = await probeAudioFile(file);
  checkAbort(signal);
  if (duration < 30 || duration > MAX_SOURCE_SECONDS) throw new Error("音频需要为 30 秒至 10 分钟。");
  const metadata = await readMp3Metadata(file);
  checkAbort(signal);
  const assets: PendingAsset[] = [];
  let coverUrl = "", notice = metadata.notice;
  let cover = metadata.cover;
  if (!cover) {
    const sibling = siblingCover(file, files);
    if (sibling) {
      try { await validateCover(sibling); cover = sibling; notice = undefined; }
      catch { notice = "封面无法读取，已使用默认封面，可稍后修改。"; }
    }
  }
  if (cover) {
    const id = crypto.randomUUID();
    assets.push({ id, blob: cover, kind: "cover" });
    coverUrl = `asset:${id}`;
  }
  checkAbort(signal);
  // At most one full song is decoded at a time; only the encoded excerpt is returned.
  const buffer = await decodeBlob(file);
  checkAbort(signal);
  if (buffer.duration > MAX_SOURCE_SECONDS || buffer.numberOfChannels > 2)
    throw new Error("请选择 10 分钟以内的单声道或双声道音频。");
  const range = randomThirtySeconds(buffer);
  onProgress("encoding", range);
  const clip = await encodeExcerpt(buffer, range.start, range.end, signal);
  checkAbort(signal);
  const audioId = crypto.randomUUID();
  assets.push({ id: audioId, blob: clip.blob, duration: clip.duration, kind: "audio" });
  return {
    album: {
      id: albumId, title: metadata.album, artist: metadata.artist, year: metadata.year,
      coverUrl, order: 0, published, backgroundColor: "#141b18",
      tracks: [{ id: trackId, title: metadata.title, trackNumber: 1, audioUrl: `asset:${audioId}`, duration: clip.duration }],
      backgroundAudio: { trackId, start: 0, end: clip.duration },
    },
    assets,
    notice,
  };
}
