import type { PendingAsset } from "@/types/album";
import { openDatabase, requestValue, transactionDone } from "./database";

export const assetRepository = {
  async save(
    blob: Blob,
    kind: PendingAsset["kind"] = "audio",
  ): Promise<string> {
    const id = crypto.randomUUID();
    const db = await openDatabase();
    const tx = db.transaction("assets", "readwrite");
    const done = transactionDone(tx);
    tx.objectStore("assets").put({ id, blob, kind });
    await done;
    return `asset:${id}`;
  },
  async get(id: string): Promise<Blob | undefined> {
    const db = await openDatabase();
    const asset = (await requestValue(
      db
        .transaction("assets")
        .objectStore("assets")
        .get(id.replace(/^asset:/, "")),
    )) as PendingAsset | undefined;
    return asset?.blob;
  },
  async delete(id: string): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(["assets", "albums"], "readwrite");
    const done = transactionDone(tx);
    const key = id.replace(/^asset:/, "");
    const request = tx.objectStore("albums").getAll();
    request.onsuccess = () => {
      const referenced = request.result.some(
        (album: { coverUrl: string; tracks: { audioUrl: string }[] }) =>
          album.coverUrl === `asset:${key}` ||
          album.tracks.some((track) => track.audioUrl === `asset:${key}`),
      );
      if (!referenced) tx.objectStore("assets").delete(key);
    };
    await done;
  },
};
export const audioRepository = assetRepository;
