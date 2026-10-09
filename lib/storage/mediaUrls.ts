import { assetRepository } from "./assetRepository";
import { getSupabaseClient } from "@/lib/supabase/client";
import { readPublicMedia, writePublicMedia, syncPublicMediaSources } from "./publicMediaCache";

/** Reference-counted leases keep active media URLs alive across album reloads. */
const leases = new Map<string, { url: string; count: number; size: number; lastUsed: number }>();
const pending = new Map<string, Promise<string>>();
let publicSources: Set<string> | undefined;
const IDLE_BYTES = 64 * 1024 * 1024;
const IDLE_ENTRIES = 24;
function revoke(source: string) {
  const entry = leases.get(source);
  if (!entry) return;
  URL.revokeObjectURL(entry.url);
  leases.delete(source);
}
function pruneIdleUrls() {
  const idle = [...leases.entries()].filter(([, entry]) => entry.count === 0)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  let bytes = idle.reduce((sum, [, entry]) => sum + entry.size, 0);
  let count = idle.length;
  for (const [source, entry] of idle) {
    if (bytes <= IDLE_BYTES && count <= IDLE_ENTRIES) break;
    revoke(source); bytes -= entry.size; count--;
  }
}
/** Only a freshly fetched anonymous catalogue permits reuse of public blobs. */
export function synchronizePublicMedia(sources: Iterable<string>) {
  publicSources = new Set(sources);
  syncPublicMediaSources(publicSources);
  for (const [source, entry] of leases)
    if (source.startsWith("cloud-public:") && !publicSources.has(source) && entry.count === 0) revoke(source);
}
export async function acquireMediaUrl(source: string): Promise<string> {
  const cloud = source.startsWith("cloud-public:") || source.startsWith("cloud-admin:");
  if (!source.startsWith("asset:") && !cloud) return source;
  if (source.startsWith("cloud-public:") && publicSources && !publicSources.has(source))
    throw new Error("这份素材已取消发布。");
  let entry = leases.get(source);
  if (!entry) {
    let creating = pending.get(source);
    if (!creating) {
      const fetchBlob = cloud ? (async () => {
        const mode = source.startsWith("cloud-admin:") ? "admin" : "public";
        if (mode === "public") {
          const cached = await readPublicMedia(source);
          if (cached) return cached;
        }
        const path = source.slice(source.indexOf(":") + 1);
        const { data, error } = await getSupabaseClient(mode).storage.from("archive-media").download(path);
        if (error || !data) throw new Error("素材无法读取，可能已取消发布或网络连接失败。");
        if (mode === "public") void writePublicMedia(source, data);
        return data;
      })() : assetRepository.get(source);
      creating = fetchBlob
        .then((blob) => {
          if (!blob) throw new Error("找不到上传的素材，请重新上传。");
          if (source.startsWith("cloud-public:") && publicSources && !publicSources.has(source))
            throw new Error("这份素材已取消发布。");
          const url = URL.createObjectURL(blob);
          leases.set(source, { url, count: 0, size: blob.size, lastUsed: Date.now() });
          return url;
        })
        .finally(() => pending.delete(source));
      pending.set(source, creating);
    }
    await creating;
    if (source.startsWith("cloud-public:") && publicSources && !publicSources.has(source))
      throw new Error("这份素材已取消发布。");
    entry = leases.get(source);
    if (!entry) return acquireMediaUrl(source);
  }
  entry.count += 1;
  entry.lastUsed = Date.now();
  pruneIdleUrls();
  return entry.url;
}
export function releaseMediaUrl(source: string): void {
  const entry = leases.get(source);
  if (!entry) return;
  entry.count = Math.max(0, entry.count - 1);
  entry.lastUsed = Date.now();
  if (entry.count <= 0) {
    if (source.startsWith("cloud-public:") && publicSources?.has(source)) pruneIdleUrls();
    else revoke(source);
  }
}
