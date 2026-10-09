import { assetRepository } from "./assetRepository";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Reference-counted leases keep active media URLs alive across album reloads. */
const leases = new Map<string, { url: string; count: number }>();
const pending = new Map<string, Promise<string>>();
export async function acquireMediaUrl(source: string): Promise<string> {
  const cloud = source.startsWith("cloud-public:") || source.startsWith("cloud-admin:");
  if (!source.startsWith("asset:") && !cloud) return source;
  let entry = leases.get(source);
  if (!entry) {
    let creating = pending.get(source);
    if (!creating) {
      const fetchBlob = cloud ? (async () => {
        const mode = source.startsWith("cloud-admin:") ? "admin" : "public";
        const path = source.slice(source.indexOf(":") + 1);
        const { data, error } = await getSupabaseClient(mode).storage.from("archive-media").download(path);
        if (error || !data) throw new Error("素材无法读取，可能已取消发布或网络连接失败。");
        return data;
      })() : assetRepository.get(source);
      creating = fetchBlob
        .then((blob) => {
          if (!blob) throw new Error("找不到上传的素材，请重新上传。");
          const url = URL.createObjectURL(blob);
          leases.set(source, { url, count: 0 });
          return url;
        })
        .finally(() => pending.delete(source));
      pending.set(source, creating);
    }
    await creating;
    entry = leases.get(source)!;
  }
  entry.count += 1;
  return entry.url;
}
export function releaseMediaUrl(source: string): void {
  const entry = leases.get(source);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count <= 0) {
    URL.revokeObjectURL(entry.url);
    leases.delete(source);
  }
}
