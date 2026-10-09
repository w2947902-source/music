export interface Track {
  id: string;
  title: string;
  /** Stable public path or asset:<IndexedDB key>, never a persisted object URL. */
  audioUrl: string;
  trackNumber: number;
  duration?: number;
}
export interface AudioClip {
  trackId: string;
  start: number;
  end: number;
}
export interface Album {
  id: string;
  title: string;
  artist: string;
  year?: number;
  coverUrl: string;
  tracks: Track[];
  backgroundAudio?: AudioClip;
  order: number;
  backgroundColor?: string;
  description?: string;
  isDemo?: boolean;
}
export interface PendingAsset {
  id: string;
  blob: Blob;
  kind: "cover" | "audio";
}
