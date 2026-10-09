import assert from "node:assert/strict";
import { test } from "node:test";
import { AudioManager } from "../lib/audio/AudioManager";
import type { Album } from "../types/album";

class FakeAudio extends EventTarget {
  static all: FakeAudio[] = [];
  src = "";
  volume = 1;
  preload = "";
  currentTime = 0;
  duration = 24;
  ended = false;
  paused = true;
  constructor() {
    super();
    FakeAudio.all.push(this);
  }
  load() {
    if (this.src)
      setTimeout(
        () => this.dispatchEvent(new Event("loadedmetadata")),
        this.src.includes("delayed") ? 40 : 1,
      );
  }
  async play() {
    this.paused = false;
    if (this.src.includes("pending-play")) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (this.paused) throw new Error("AbortError: play was interrupted by pause");
    }
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = "";
  }
}
Object.defineProperty(globalThis, "Audio", {
  value: FakeAudio,
  configurable: true,
});
Object.defineProperty(globalThis, "requestAnimationFrame", {
  value: (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 5),
  configurable: true,
});
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  value: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  configurable: true,
});
const album = (id: string, delayed = false): Album => ({
  id,
  title: id,
  artist: "Test",
  order: 0,
  coverUrl: "",
  tracks: [
    {
      id,
      title: id,
      audioUrl: delayed ? "/delayed.wav" : `/${id}.wav`,
      trackNumber: 1,
      duration: 24,
    },
  ],
  backgroundAudio: { trackId: id, start: 2, end: 24 },
});
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
test("crossfade keeps only the latest selection, pause survives loading, loops at EOF, and dispose releases voices", async () => {
  const manager = new AudioManager();
  try {
    await manager.select(album("a"));
    assert.equal(manager.getSnapshot().status, "paused");
    await manager.play();
    const b = manager.select(album("b", true));
    const c = manager.select(album("c"));
    await Promise.all([b, c]);
    await wait(1100);
    assert.equal(manager.getSnapshot().track?.id, "c");
    assert.equal(manager.getSnapshot().status, "playing");
    assert.equal(FakeAudio.all.filter((audio) => !audio.paused).length, 1);
    const final = FakeAudio.all.find((audio) => audio.src === "/c.wav")!;
    assert.ok(Math.abs(final.volume - 0.7) < 0.01);
    final.currentTime = 24;
    final.ended = true;
    final.dispatchEvent(new Event("ended"));
    assert.equal(final.currentTime, 2);
    const pendingPlay = manager.select(album("pending-play"));
    await wait(5);
    manager.pause();
    await pendingPlay;
    assert.equal(manager.getSnapshot().status, "paused");
    assert.equal(manager.getSnapshot().message, undefined);
    await manager.play();
    const delayed = manager.select(album("delayed", true));
    await wait(5);
    manager.pause();
    await delayed;
    assert.equal(manager.getSnapshot().status, "paused");
    assert.equal(FakeAudio.all.filter((audio) => !audio.paused).length, 0);
    manager.dispose();
    assert.ok(FakeAudio.all.every((audio) => audio.paused && audio.src === ""));
  } finally {
    manager.dispose();
  }
});
