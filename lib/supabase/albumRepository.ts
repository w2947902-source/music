import type { Album, PendingAsset } from "@/types/album";
import { validateAlbum } from "@/lib/albums/validation";
import { archiveError, getSupabaseClient } from "./client";
import type { AlbumRow, TrackRow, Json } from "./database.types";

export const MEDIA_BUCKET = "archive-media";
export type ArchiveMode = "public" | "admin";
const sourcePrefix = (mode: ArchiveMode) => `cloud-${mode}:`;
export function cloudSource(path: string | null, mode: ArchiveMode) { return path ? sourcePrefix(mode) + path : ""; }
function storedPath(source: string, paths: Map<string, string>) {
  if (!source) return null;
  if (source.startsWith("asset:")) {
    const path = paths.get(source.slice(6));
    if (!path) throw new Error("素材尚未生成或上传，请重新选择文件。");
    return path;
  }
  if (source.startsWith("cloud-admin:") || source.startsWith("cloud-public:")) return source.slice(source.indexOf(":") + 1);
  throw new Error("请重新上传封面或生成音频片段。旧浏览器文件不会自动发布。");
}
function toAlbum(row: AlbumRow & { tracks: TrackRow[] }, mode: ArchiveMode): Album {
  const tracks = row.tracks.sort((a,b) => a.track_number - b.track_number).map(t => ({
    id: t.id, title: t.title, trackNumber: t.track_number, duration: t.duration ?? undefined, audioUrl: cloudSource(t.audio_path, mode),
  }));
  const featured = tracks.find(t => t.id === row.featured_track_id && t.audioUrl);
  return {
    id: row.id, title: row.title, artist: row.artist, year: row.release_year ?? undefined,
    description: row.description, backgroundColor: row.background_color, coverUrl: cloudSource(row.cover_path, mode),
    tracks, order: row.display_order, published: row.published, updatedAt: row.updated_at,
    backgroundAudio: featured ? { trackId: featured.id, start: 0, end: featured.duration! } : undefined,
  };
}
export const cloudAlbumRepository = {
  async getAll(mode: ArchiveMode = "public"): Promise<Album[]> {
    const client = getSupabaseClient(mode);
    const albums: Album[] = [];
    for (let page = 0; ; page++) {
      let query = client.from("albums").select("*, tracks!tracks_album_id_fkey(*)").order("display_order").order("id").range(page*200,page*200+199);
      if (mode === "public") query = query.eq("published", true);
      const { data, error } = await query;
      if (error) throw archiveError(error, "暂时无法读取档案馆，请检查网络后重试。");
      albums.push(...data.map(row => toAlbum(row, mode)));
      if (data.length < 200) return albums;
    }
  },
  async save(album: Album, pending: PendingAsset[]) {
    const failure = validateAlbum(album);
    if (failure) throw new Error(failure);
    const client = getSupabaseClient("admin");
    const uploaded: string[] = [];
    const paths = new Map<string,string>();
    const referenced = new Set([album.coverUrl, ...album.tracks.map(t => t.audioUrl)]);
    try {
      for (const asset of pending.filter(a => referenced.has(`asset:${a.id}`))) {
        if (asset.kind === "audio") {
          // Only our independently encoded PCM WAV is accepted by this upload path.
          const header = new DataView(await asset.blob.slice(0,44).arrayBuffer());
          if (header.byteLength !== 44 || header.getUint32(0,false) !== 0x52494646 || header.getUint32(8,false) !== 0x57415645
            || header.getUint16(20,true) !== 1 || asset.blob.type !== "audio/wav"
            || !asset.duration || asset.duration < 20 || asset.duration > 60 || asset.blob.size > 12*1024*1024
            || Math.abs(header.getUint32(40,true)/header.getUint32(28,true)-asset.duration) > .001) {
            throw new Error("请先生成有效的 20–60 秒音乐片段。完整原曲不会上传。");
          }
        } else if (!["image/jpeg","image/png","image/webp"].includes(asset.blob.type) || asset.blob.size > 5*1024*1024) {
          throw new Error("封面需要是 5 MB 以内的 JPG、PNG 或 WebP。");
        }
        const id = crypto.randomUUID();
        const stage = await client.rpc("archive_stage_media", {
          p_id:id, p_album_id:album.id, p_kind:asset.kind, p_mime_type:asset.blob.type,
          p_byte_size:asset.blob.size, p_duration:asset.duration ?? null,
        });
        if (stage.error) throw archiveError(stage.error, "无法登记上传素材，请重试。");
        uploaded.push(stage.data);
        const upload = await client.storage.from(MEDIA_BUCKET).upload(stage.data, asset.blob, { contentType:asset.blob.type, upsert:false, cacheControl:"0" });
        if (upload.error) throw archiveError(upload.error, "素材上传失败，专辑尚未保存，请检查网络后重试。");
        paths.set(asset.id,stage.data);
      }
      const payload = {
        id:album.id, title:album.title.trim(), artist:album.artist.trim(), release_year:album.year ?? null,
        cover_path:storedPath(album.coverUrl,paths), description:album.description ?? "", background_color:album.backgroundColor ?? "#141b18",
        published:album.published === true, featured_track_id:album.backgroundAudio?.trackId ?? null,
        tracks:album.tracks.map((t,i) => ({id:t.id,title:t.title.trim(),track_number:i+1,audio_path:storedPath(t.audioUrl,paths),duration:t.audioUrl ? t.duration ?? null : null})),
      } satisfies Json;
      const saved = await client.rpc("archive_save_album", {p_album:payload,p_expected_updated_at:album.updatedAt ?? null});
      if (saved.error) throw archiveError(saved.error,"专辑保存失败，请检查网络后重试。");
    } catch (cause) {
      if (uploaded.length) {
        // This is safe even if a save timed out after committing: the RPC queues
        // only assets that the committed database does not reference.
        try { await client.rpc("archive_abandon_media",{p_paths:uploaded}); } catch { /* Queued again after the staging timeout. */ }
      }
      throw cause;
    }
    return this.cleanup();
  },
  async delete(album: Album) {
    const { error } = await getSupabaseClient("admin").rpc("archive_delete_album",{p_id:album.id,p_expected_updated_at:album.updatedAt!});
    if (error) throw archiveError(error,"删除失败，请重试。");
    return this.cleanup();
  },
  async setPublished(album: Album, published: boolean) {
    const { error } = await getSupabaseClient("admin").rpc("archive_set_published",{p_id:album.id,p_published:published,p_expected_updated_at:album.updatedAt!});
    if (error) throw archiveError(error,"发布状态保存失败，请重试。");
  },
  async reorder(ids: string[]) {
    const { error } = await getSupabaseClient("admin").rpc("archive_reorder_albums",{p_ids:ids});
    if (error) throw archiveError(error,"排序保存失败，请重试。");
  },
  async cleanup(): Promise<string | undefined> {
    try {
      const client = getSupabaseClient("admin");
      const claim = await client.rpc("archive_claim_media_cleanup");
      if (claim.error) throw claim.error;
      if (!claim.data?.length) return;
      const removed = await client.storage.from(MEDIA_BUCKET).remove(claim.data);
      if (removed.error) throw removed.error;
      const finished = await client.rpc("archive_finish_media_cleanup",{p_paths:claim.data});
      if (finished.error) throw finished.error;
    } catch { return "内容已保存；旧素材清理待重试，下次打开后台会自动继续。"; }
  },
};
