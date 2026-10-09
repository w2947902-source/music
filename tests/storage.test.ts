import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { albumRepository } from "../lib/storage/albumRepository";
import { assetRepository } from "../lib/storage/assetRepository";
import { openDatabase, transactionDone } from "../lib/storage/database";
import { validateClip } from "../lib/albums/validation";
import type { Album } from "../types/album";

const record = (id: string, coverUrl = ""): Album => ({
  id,
  title: id,
  artist: "Test Artist",
  order: 0,
  coverUrl,
  tracks: [],
});
test("local collection: atomic saves, shared asset ownership, reorder, and permanent empty collection", async () => {
  await albumRepository.initialize();
  assert.equal((await albumRepository.getAll()).length, 3);
  const file = new Blob(["original artwork"], { type: "image/png" });
  await albumRepository.create(record("one", "asset:shared"), [
    { id: "shared", blob: file, kind: "cover" },
  ]);
  assert.equal(
    await (await assetRepository.get("shared"))?.text(),
    "original artwork",
  );
  assert.equal(
    (await albumRepository.getById("one"))?.coverUrl,
    "asset:shared",
  );
  await albumRepository.create(record("two", "asset:shared"));
  await albumRepository.delete("one");
  assert.ok(
    await assetRepository.get("shared"),
    "deleting one record must not delete another record's asset",
  );
  await albumRepository.update(record("two"));
  assert.equal(await assetRepository.get("shared"), undefined);
  await assert.rejects(
    albumRepository.create(record("broken", "asset:missing")),
  );
  assert.equal(
    await albumRepository.getById("broken"),
    undefined,
    "missing assets must abort the whole save",
  );
  const albums = await albumRepository.getAll();
  const ids = albums.map((album) => album.id).reverse();
  await albumRepository.reorder(ids);
  assert.deepEqual(
    (await albumRepository.getAll()).map((album) => album.id),
    ids,
  );
  await assert.rejects(albumRepository.reorder([ids[0], ids[0]]));
  assert.deepEqual(
    (await albumRepository.getAll()).map((album) => album.id),
    ids,
  );
  const tx = (await openDatabase()).transaction(
    ["albums", "assets"],
    "readwrite",
  );
  const completion = transactionDone(tx);
  tx.objectStore("albums").put(record("aborted"));
  tx.objectStore("assets").put({ id: "aborted", blob: file, kind: "cover" });
  tx.abort();
  await assert.rejects(completion);
  assert.equal(await albumRepository.getById("aborted"), undefined);
  assert.equal(await assetRepository.get("aborted"), undefined);
  for (const album of await albumRepository.getAll())
    await albumRepository.delete(album.id);
  await albumRepository.initialize();
  assert.deepEqual(
    await albumRepository.getAll(),
    [],
    "user-deleted demos must never be reseeded",
  );
});
test("audio clip boundaries reject NaN, reversed ranges, missing tracks and out-of-bounds endpoints", () => {
  const tracks = [
    {
      id: "track",
      title: "Track",
      audioUrl: "/test.wav",
      trackNumber: 1,
      duration: 24,
    },
  ];
  for (const clip of [
    { trackId: "track", start: NaN, end: 4 },
    { trackId: "track", start: 4, end: 4 },
    { trackId: "track", start: -1, end: 4 },
    { trackId: "track", start: 4, end: 25 },
    { trackId: "missing", start: 0, end: 4 },
  ])
    assert.ok(validateClip(clip, tracks));
  assert.equal(
    validateClip({ trackId: "track", start: 0, end: 24 }, tracks),
    null,
  );
});
