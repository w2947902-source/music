import type { Album, PendingAsset } from "@/types/album";
import { demoAlbums } from "@/lib/albums/demo";
import { assetKeys, validateAlbum } from "@/lib/albums/validation";
import { openDatabase, requestValue, transactionDone } from "./database";

async function write(
  album: Album,
  uploads: PendingAsset[] = [],
  creating = false,
): Promise<void> {
  const error = validateAlbum(album);
  if (error) throw new Error(error);
  const db = await openDatabase();
  const tx = db.transaction(["albums", "assets"], "readwrite");
  const done = transactionDone(tx);
  const store = tx.objectStore("albums");
  const request = store.getAll();
  request.onsuccess = () => {
    const existing = request.result as Album[];
    const previous = existing.find((item) => item.id === album.id);
    if ((creating && previous) || (!creating && !previous)) {
      tx.abort();
      return;
    }
    const saved = {
      ...album,
      order: creating
        ? Math.max(-1, ...existing.map((item) => item.order)) + 1
        : previous!.order,
    };
    const uploadedKeys = new Set(uploads.map((asset) => asset.id));
    for (const key of assetKeys(saved)) {
      if (uploadedKeys.has(key)) continue;
      const lookup = tx.objectStore("assets").getKey(key);
      lookup.onsuccess = () => {
        if (lookup.result === undefined) tx.abort();
      };
    }
    const referenced = new Set(
      existing
        .filter((item) => item.id !== album.id)
        .flatMap(assetKeys)
        .concat(assetKeys(saved)),
    );
    for (const key of previous ? assetKeys(previous) : [])
      if (!referenced.has(key)) tx.objectStore("assets").delete(key);
    for (const asset of uploads)
      if (referenced.has(asset.id)) tx.objectStore("assets").put(asset);
    store.put(saved);
  };
  await done;
}
export const albumRepository = {
  async initialize(): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(["albums", "settings"], "readwrite");
    const done = transactionDone(tx);
    const settings = tx.objectStore("settings");
    const request = settings.get("initialized");
    request.onsuccess = () => {
      if (request.result) return;
      demoAlbums.forEach((album) => tx.objectStore("albums").put(album));
      settings.put(true, "initialized");
    };
    await done;
  },
  async getAll(): Promise<Album[]> {
    const db = await openDatabase();
    const albums = (await requestValue(
      db.transaction("albums").objectStore("albums").getAll(),
    )) as Album[];
    return albums.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  },
  async getById(id: string): Promise<Album | undefined> {
    const db = await openDatabase();
    return requestValue(db.transaction("albums").objectStore("albums").get(id));
  },
  create: (album: Album, uploads?: PendingAsset[]) =>
    write(album, uploads, true),
  update: (album: Album, uploads?: PendingAsset[]) => write(album, uploads),
  async delete(id: string): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(["albums", "assets"], "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore("albums");
    const request = store.getAll();
    request.onsuccess = () => {
      const albums = request.result as Album[];
      const target = albums.find((item) => item.id === id);
      const others = albums.filter((item) => item.id !== id);
      const referenced = new Set(others.flatMap(assetKeys));
      if (target)
        for (const key of assetKeys(target))
          if (!referenced.has(key)) tx.objectStore("assets").delete(key);
      store.delete(id);
      others
        .sort((a, b) => a.order - b.order)
        .forEach((album, order) => store.put({ ...album, order }));
    };
    await done;
  },
  async reorder(ids: string[]): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction("albums", "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore("albums");
    const request = store.getAll();
    request.onsuccess = () => {
      const albums = request.result as Album[];
      if (
        ids.length !== albums.length ||
        new Set(ids).size !== ids.length ||
        albums.some((album) => !ids.includes(album.id))
      ) {
        tx.abort();
        return;
      }
      albums.forEach((album) =>
        store.put({ ...album, order: ids.indexOf(album.id) }),
      );
    };
    await done;
  },
};
