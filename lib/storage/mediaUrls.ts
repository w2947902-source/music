import { assetRepository } from "./assetRepository";

/** Reference-counted leases keep active media URLs alive across album reloads. */
const leases = new Map<string, { url: string; count: number }>();
const pending = new Map<string, Promise<string>>();
export async function acquireMediaUrl(source: string): Promise<string> {
  if (!source.startsWith("asset:")) return source;
  let entry = leases.get(source);
  if (!entry) {
    let creating = pending.get(source);
    if (!creating) {
      creating = assetRepository
        .get(source)
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
