import type { Album, Track } from "@/types/album";

export function catalogueName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLocaleLowerCase("en-US");
}
/** A listening catalogue, built from authorized rows. Original admin records stay individually editable. */
export function groupAlbums(records: Album[]): Album[] {
  const groups = new Map<string, Album>();
  const titles = new Map<string, Map<string, number>>();
  for (const record of records) {
    // Draft and published rows remain distinct in authenticated previews.
    const key = JSON.stringify([record.published === true, catalogueName(record.title), catalogueName(record.artist)]);
    let group = groups.get(key);
    if (!group) {
      group = { ...record, id: `collection:${key}`, tracks: [], sourceAlbumIds: [], backgroundAudio: undefined };
      groups.set(key, group); titles.set(key, new Map());
    }
    group.sourceAlbumIds!.push(record.id);
    if (!group.coverUrl && record.coverUrl) group.coverUrl = record.coverUrl;
    const seen = titles.get(key)!;
    for (const track of record.tracks) {
      const title = catalogueName(track.title) || track.id;
      const index = seen.get(title);
      if (index === undefined) {
        seen.set(title, group.tracks.length);
        group.tracks.push({ ...track, trackNumber: group.tracks.length + 1 });
      } else {
        const previous = group.tracks[index];
        // Prefer a playable version, then a deterministic ID so sorting does not change the chosen recording.
        if ((!previous.audioUrl && track.audioUrl) || Boolean(previous.audioUrl) === Boolean(track.audioUrl) && track.id < previous.id)
          group.tracks[index] = { ...track, trackNumber: previous.trackNumber };
      }
    }
  }
  return [...groups.values()];
}

export function playableTracks(album?: Album): Track[] {
  return album?.tracks.filter(track => Boolean(track.audioUrl)) ?? [];
}
export function albumForTrack(album: Album | undefined, track: Track | undefined): Album | undefined {
  if (!album || !track) return album;
  return { ...album, tracks: [track], backgroundAudio: track.duration
    ? { trackId: track.id, start: 0, end: track.duration } : undefined };
}
/** Finish every distinct track, including tracks before a manually chosen starting point. */
export function nextUnplayedTrack(album: Album, currentId: string, completed: ReadonlySet<string>): Track | undefined {
  const tracks = playableTracks(album), current = tracks.findIndex(track => track.id === currentId);
  for (let offset = 1; offset <= tracks.length; offset++) {
    const track = tracks[(current + offset + tracks.length) % tracks.length];
    if (!completed.has(track.id)) return track;
  }
}
export function albumAtRatio(ratio: number, count: number): number {
  return Math.round(Math.max(0, Math.min(1, ratio)) * Math.max(0, count - 1));
}
