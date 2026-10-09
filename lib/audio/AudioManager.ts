import type { Album, Track } from "@/types/album";
import { acquireMediaUrl, releaseMediaUrl } from "@/lib/storage/mediaUrls";

export interface AudioSnapshot {
  status: "idle" | "loading" | "playing" | "paused" | "unavailable" | "error";
  currentTime: number;
  start: number;
  end: number;
  track?: Track;
  volume: number;
  playingIntent: boolean;
  message?: string;
}
interface Voice {
  audio: HTMLAudioElement;
  source: string;
  track: Track;
  start: number;
  end: number;
  volume: number;
  generation: number;
  ready: boolean;
  gain?: GainNode;
  node?: MediaElementAudioSourceNode;
  cleanup: () => void;
}
const INITIAL: AudioSnapshot = {
  status: "idle",
  currentTime: 0,
  start: 0,
  end: 0,
  volume: 0.7,
  playingIntent: false,
};

/** One manager per listening room; no audio element is owned by an animated view. */
export class AudioManager {
  private state: AudioSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private voices = new Set<Voice>();
  private active?: Voice;
  private generation = 0;
  private frame?: number;
  private desiredPlaying = false;
  private context?: AudioContext;
  private disposed = false;
  private tick?: ReturnType<typeof setInterval>;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  getSnapshot = () => this.state;
  getServerSnapshot = () => INITIAL;
  private publish(update: Partial<AudioSnapshot>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((callback) => callback());
  }
  private setVoiceVolume(voice: Voice, volume: number) {
    voice.volume = Math.max(0, Math.min(1, volume));
    if (voice.gain) voice.gain.gain.value = voice.volume;
    else voice.audio.volume = voice.volume;
  }
  private connect(voice: Voice) {
    if (!this.context || voice.gain) return;
    try {
      voice.node = this.context.createMediaElementSource(voice.audio);
      voice.gain = this.context.createGain();
      voice.audio.volume = 1;
      voice.gain.gain.value = voice.volume;
      voice.node.connect(voice.gain).connect(this.context.destination);
    } catch {
      /* Native volume remains a fallback when Web Audio is unavailable. */
    }
  }
  private release(voice: Voice) {
    if (!this.voices.has(voice)) return;
    voice.cleanup();
    voice.audio.pause();
    voice.audio.removeAttribute("src");
    voice.audio.load();
    voice.node?.disconnect();
    voice.gain?.disconnect();
    releaseMediaUrl(voice.source);
    this.voices.delete(voice);
  }
  private fade(target?: Voice) {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    const originals = new Map(
      [...this.voices].map((voice) => [voice, voice.volume]),
    );
    const started = performance.now();
    const step = () => {
      if (this.disposed) return;
      const progress = Math.min(1, (performance.now() - started) / 1000);
      for (const [voice, from] of originals)
        if (this.voices.has(voice))
          this.setVoiceVolume(
            voice,
            from +
              ((voice === target ? this.state.volume : 0) - from) * progress,
          );
      if (progress < 1) this.frame = requestAnimationFrame(step);
      else {
        this.frame = undefined;
        for (const voice of [...this.voices])
          if (voice !== target) this.release(voice);
      }
    };
    this.frame = requestAnimationFrame(step);
  }
  async select(album?: Album): Promise<void> {
    const generation = ++this.generation;
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    for (const voice of [...this.voices]) if (!voice.ready) this.release(voice);
    const clip = album?.backgroundAudio;
    const track =
      album?.tracks.find((item) => item.id === clip?.trackId) ??
      album?.tracks[0];
    if (!track?.audioUrl) {
      this.active = undefined;
      this.fade();
      this.publish({
        status: "unavailable",
        playingIntent: false,
        track,
        currentTime: 0,
        start: 0,
        end: 0,
        message: "这张唱片还没有声音。",
      });
      return;
    }
    this.publish({
      status: "loading",
      track,
      currentTime: clip?.start ?? 0,
      start: clip?.start ?? 0,
      end: clip?.end ?? track.duration ?? 0,
      message: undefined,
    });
    let voice: Voice | undefined;
    let acquired = false;
    try {
      const url = await acquireMediaUrl(track.audioUrl);
      acquired = true;
      if (generation !== this.generation || this.disposed) {
        releaseMediaUrl(track.audioUrl);
        return;
      }
      const audio = new Audio();
      audio.preload = "auto";
      voice = {
        audio,
        source: track.audioUrl,
        track,
        start: 0,
        end: 0,
        volume: 0,
        generation,
        ready: false,
        cleanup: () => {},
      };
      this.voices.add(voice);
      this.setVoiceVolume(voice, 0);
      this.connect(voice);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => finish(new Error("音频加载超时，请重试。")),
          20000,
        );
        const loaded = () => finish();
        const failed = () =>
          finish(new Error("音频无法播放，请检查文件格式或重新上传。"));
        const finish = (error?: Error) => {
          clearTimeout(timeout);
          audio.removeEventListener("loadedmetadata", loaded);
          audio.removeEventListener("error", failed);
          if (error) reject(error);
          else resolve();
        };
        audio.addEventListener("loadedmetadata", loaded, { once: true });
        audio.addEventListener("error", failed, { once: true });
        voice!.cleanup = () => finish(new Error("cancelled"));
        audio.src = url;
        audio.load();
      });
      if (generation !== this.generation || this.disposed) {
        this.release(voice);
        return;
      }
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error("无法读取歌曲长度。");
      voice.start = Math.min(
        Math.max(0, clip?.start ?? 0),
        Math.max(0, duration - 0.05),
      );
      voice.end = Math.min(clip?.end ?? duration, duration);
      if (voice.end <= voice.start)
        throw new Error("音乐片段无效，请在管理页重新选择。");
      audio.currentTime = voice.start;
      const prepared = voice;
      const loop = () => {
        if (audio.currentTime >= prepared.end || audio.ended) {
          audio.currentTime = prepared.start;
          if (this.desiredPlaying && this.active === prepared)
            void audio.play().catch(() =>
              this.publish({
                status: "error",
                message: "播放被浏览器暂停，请再次点击播放。",
              }),
            );
        }
      };
      const failed = () => {
        if (this.active === prepared) {
          this.desiredPlaying = false;
          this.pause();
          this.publish({
            status: "error",
            message: "音频加载失败，请重新上传或重试。",
          });
        }
      };
      audio.addEventListener("timeupdate", loop);
      audio.addEventListener("ended", loop);
      audio.addEventListener("error", failed);
      voice.cleanup = () => {
        audio.removeEventListener("timeupdate", loop);
        audio.removeEventListener("ended", loop);
        audio.removeEventListener("error", failed);
      };
      if (this.desiredPlaying) {
        try {
          await audio.play();
        } catch (cause) {
          if (this.desiredPlaying) throw cause;
        }
      }
      if (generation !== this.generation || this.disposed) {
        this.release(voice);
        return;
      }
      voice.ready = true;
      this.active = voice;
      if (!this.desiredPlaying) audio.pause();
      this.publish({
        status: this.desiredPlaying ? "playing" : "paused",
        playingIntent: this.desiredPlaying,
        start: voice.start,
        end: voice.end,
        currentTime: voice.start,
      });
      if (this.desiredPlaying) this.fade(voice);
      else {
        for (const old of [...this.voices])
          if (old !== voice) this.release(old);
        this.setVoiceVolume(voice, this.state.volume);
      }
      if (!this.tick)
        this.tick = setInterval(() => {
          if (this.active && this.state.status === "playing")
            this.publish({ currentTime: this.active.audio.currentTime });
        }, 100);
    } catch (cause) {
      if (voice && this.voices.has(voice)) this.release(voice);
      else if (acquired && !voice) releaseMediaUrl(track.audioUrl);
      if (generation !== this.generation || this.disposed) return;
      this.active = undefined;
      this.fade();
      this.desiredPlaying = false;
      this.publish({
        status: "error",
        playingIntent: false,
        message: cause instanceof Error ? cause.message : "音频加载失败。",
      });
    }
  }
  async play() {
    if (!this.active || this.state.status === "loading") return;
    const generation = this.generation;
    const voice = this.active;
    this.desiredPlaying = true;
    this.publish({ playingIntent: true });
    try {
      if (!this.context) {
        try {
          this.context = new AudioContext();
          this.voices.forEach((item) => this.connect(item));
        } catch {
          /* Native Audio fallback. */
        }
      }
      const resume = this.context?.resume();
      const playback = voice.audio.play();
      await Promise.all([resume, playback]);
      if (
        generation !== this.generation ||
        !this.desiredPlaying ||
        this.disposed
      )
        return;
      this.fade(voice);
      this.publish({ status: "playing", message: undefined });
    } catch {
      if (generation !== this.generation || !this.desiredPlaying) return;
      this.desiredPlaying = false;
      voice.audio.pause();
      this.publish({
        status: "paused",
        playingIntent: false,
        message: "请点击 Start Listening 以允许播放。",
      });
    }
  }
  pause() {
    this.desiredPlaying = false;
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    for (const voice of [...this.voices]) {
      voice.audio.pause();
      if (voice !== this.active && voice.ready) this.release(voice);
    }
    this.publish({ playingIntent: false });
    if (this.active) {
      this.setVoiceVolume(this.active, this.state.volume);
      if (this.state.status !== "loading") this.publish({ status: "paused" });
    }
  }
  setVolume(volume: number) {
    this.publish({ volume: Math.max(0, Math.min(1, volume)) });
    if (this.frame === undefined && this.active)
      this.setVoiceVolume(this.active, this.state.volume);
  }
  seek(time: number) {
    if (!this.active || !Number.isFinite(time)) return;
    this.active.audio.currentTime = Math.max(
      this.active.start,
      Math.min(this.active.end - 0.01, time),
    );
    this.publish({ currentTime: this.active.audio.currentTime });
  }
  dispose() {
    this.disposed = true;
    ++this.generation;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    if (this.tick) clearInterval(this.tick);
    for (const voice of [...this.voices]) this.release(voice);
    this.active = undefined;
    void this.context?.close().catch(() => {});
    this.listeners.clear();
  }
}
