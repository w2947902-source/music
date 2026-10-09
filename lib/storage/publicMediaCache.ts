/** Persistent copies of published media only; authorization still comes from a fresh catalogue. */
const PROJECT = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CACHE_NAME = `music-archive-public-media-v1:${encodeURIComponent(PROJECT)}`;
const MAX_BYTES = 160 * 1024 * 1024;
const MAX_ENTRIES = 80;
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const CREATED_HEADER = "x-archive-cache-created";
const SIZE_HEADER = "x-archive-cache-size";
let allowedSources = new Set<string>();
let mutations: Promise<void> = Promise.resolve();

function isPublicSource(source: string): boolean {
  return source.startsWith("cloud-public:") && source.length > "cloud-public:".length;
}

function isAllowed(source: string): boolean {
  return Boolean(PROJECT) && isPublicSource(source) && allowedSources.has(source);
}

async function openCache(): Promise<Cache | undefined> {
  if (typeof window === "undefined" || typeof caches === "undefined" || !PROJECT) return;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    // Storage may be unavailable in private windows or under browser quota policies.
    return;
  }
}

function requestFor(source: string): Request {
  const url = new URL("/__archive_media_cache__/v1", window.location.origin);
  url.searchParams.set("project", PROJECT);
  url.searchParams.set("source", source);
  // This URL is only an internal Cache Storage key; it is never fetched.
  return new Request(url.href);
}

function sourceFor(request: Request): string | undefined {
  const url = new URL(request.url);
  if (url.pathname !== "/__archive_media_cache__/v1" || url.searchParams.get("project") !== PROJECT) return;
  return url.searchParams.get("source") ?? undefined;
}

function serialize(work: () => Promise<void>): Promise<void> {
  const job = mutations.then(work).catch(() => {
    // Caching must never prevent media playback or catalogue refresh.
  });
  mutations = job;
  return job;
}

async function prune(cache: Cache): Promise<void> {
  const requests = await cache.keys();
  const entries = await Promise.all(requests.map(async (request) => {
    const response = await cache.match(request);
    return {
      request,
      source: sourceFor(request),
      created: Number(response?.headers.get(CREATED_HEADER)),
      size: Number(response?.headers.get(SIZE_HEADER)),
    };
  }));
  const retained: typeof entries = [];
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.source || !isAllowed(entry.source) || !Number.isFinite(entry.created)
      || entry.created <= 0 || now - entry.created > MAX_AGE
      || !Number.isFinite(entry.size) || entry.size <= 0 || entry.size > MAX_BYTES) {
      await cache.delete(entry.request);
    } else {
      retained.push(entry);
    }
  }
  retained.sort((left, right) => left.created - right.created);
  let bytes = retained.reduce((total, entry) => total + entry.size, 0);
  let count = retained.length;
  for (const entry of retained) {
    // The catalogue can change while storage operations are pending.
    if (!isAllowed(entry.source!) || bytes > MAX_BYTES || count > MAX_ENTRIES) {
      await cache.delete(entry.request);
      bytes -= entry.size;
      count -= 1;
    }
  }
}

/** Call only after the anonymous client successfully reads the current published albums. */
export function syncPublicMediaSources(sources: Iterable<string>): void {
  allowedSources = new Set([...sources].filter(isPublicSource));
  void serialize(async () => {
    const cache = await openCache();
    if (cache) await prune(cache);
  });
}

export async function readPublicMedia(source: string): Promise<Blob | undefined> {
  if (!isAllowed(source)) return;
  try {
    const cache = await openCache();
    if (!cache || !isAllowed(source)) return;
    const response = await cache.match(requestFor(source));
    if (!response || !isAllowed(source)) return;
    const created = Number(response.headers.get(CREATED_HEADER));
    if (!Number.isFinite(created) || created <= 0 || Date.now() - created > MAX_AGE) {
      void serialize(() => prune(cache));
      return;
    }
    const blob = await response.blob();
    if (!isAllowed(source) || blob.size <= 0 || blob.size > MAX_BYTES) return;
    return blob;
  } catch {
    return;
  }
}

/** The caller should fire this in the background after a successful anonymous download. */
export function writePublicMedia(source: string, blob: Blob): Promise<void> {
  if (!isAllowed(source) || blob.size <= 0 || blob.size > MAX_BYTES) return Promise.resolve();
  return serialize(async () => {
    if (!isAllowed(source)) return;
    const cache = await openCache();
    if (!cache || !isAllowed(source)) return;
    await prune(cache);
    if (!isAllowed(source)) return;
    const request = requestFor(source);
    await cache.put(request, new Response(blob, {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        [CREATED_HEADER]: String(Date.now()),
        [SIZE_HEADER]: String(blob.size),
      },
    }));
    if (!isAllowed(source)) await cache.delete(request);
    await prune(cache);
  });
}
