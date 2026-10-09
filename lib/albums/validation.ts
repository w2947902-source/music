import type { Album, AudioClip, Track } from "@/types/album";

export function validateClip(clip: AudioClip, tracks: Track[]): string | null {
  const track = tracks.find((item) => item.id === clip.trackId);
  if (!track) return "请选择专辑中的一首歌曲。";
  if (
    !Number.isFinite(clip.start) ||
    !Number.isFinite(clip.end) ||
    clip.start < 0 ||
    clip.start >= clip.end
  )
    return "片段起点必须大于等于 0，并且早于终点。";
  if (track.duration !== undefined && clip.end > track.duration + 0.01)
    return "片段不能超出歌曲长度。";
  return null;
}
export function validateAlbum(album: Album): string | null {
  if (album.title.length > 200 || album.artist.length > 200) return "专辑名称和艺术家各不能超过 200 字。";
  if (album.tracks.length > 100) return "每张专辑最多添加 100 首歌曲。";
  if ((album.description?.length ?? 0) > 5000) return "简介不能超过 5000 字。";
  if (!album.title.trim()) return "请输入专辑名称。";
  if (!album.artist.trim()) return "请输入艺术家名称。";
  if (
    album.year !== undefined &&
    (!Number.isInteger(album.year) || album.year < 1000 || album.year > 9999)
  )
    return "年份需要是四位数字。";
  if (album.tracks.some((track) => !track.title.trim()))
    return "每首歌曲都需要名称。";
  if (album.tracks.some((track) => track.title.length > 200))
    return "歌曲名称不能超过 200 字。";
  if (
    new Set(album.tracks.map((track) => track.id)).size !== album.tracks.length
  )
    return "歌曲标识重复。";
  if (album.backgroundAudio)
    return validateClip(album.backgroundAudio, album.tracks);
  return null;
}
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
export function assetKeys(album: Album): string[] {
  return [album.coverUrl, ...album.tracks.map((track) => track.audioUrl)]
    .filter((url) => url.startsWith("asset:"))
    .map((url) => url.slice(6));
}
