import type { Album } from "@/types/album";

/** Original fictional records and locally synthesized, copyright-free audio. */
export const demoAlbums: Album[] = [
  {
    id: "still-somewhere",
    title: "Still, Somewhere",
    artist: "The Quiet Hours",
    year: 2024,
    coverUrl: "/covers/still-somewhere.png",
    order: 0,
    backgroundColor: "#141b18",
    isDemo: true,
    description:
      "A place between silence and sound.\nThree reflections on the art of slowing down.",
    tracks: [
      {
        id: "first-light",
        title: "First Light",
        trackNumber: 1,
        audioUrl: "/audio/first-light.wav",
        duration: 24,
      },
      {
        id: "a-distant-shore",
        title: "A Distant Shore",
        trackNumber: 2,
        audioUrl: "/audio/first-light.wav",
        duration: 24,
      },
      {
        id: "things-left-unsaid",
        title: "Things Left Unsaid",
        trackNumber: 3,
        audioUrl: "/audio/first-light.wav",
        duration: 24,
      },
    ],
    backgroundAudio: { trackId: "first-light", start: 2, end: 22 },
  },
  {
    id: "blue-after-dark",
    title: "Blue After Dark",
    artist: "Elian Voss",
    year: 2023,
    coverUrl: "/covers/blue-after-dark.png",
    order: 1,
    backgroundColor: "#101a25",
    isDemo: true,
    description:
      "Fragments of a city after midnight.\nA quiet conversation with the dark.",
    tracks: [
      {
        id: "night-window",
        title: "Night Window",
        trackNumber: 1,
        audioUrl: "/audio/night-window.wav",
        duration: 24,
      },
      {
        id: "blue-hour",
        title: "Blue Hour",
        trackNumber: 2,
        audioUrl: "/audio/night-window.wav",
        duration: 24,
      },
    ],
    backgroundAudio: { trackId: "night-window", start: 1, end: 23 },
  },
  {
    id: "shape-of-memory",
    title: "The Shape of Memory",
    artist: "June Meridian",
    year: 2025,
    coverUrl: "/covers/shape-of-memory.png",
    order: 2,
    backgroundColor: "#281c16",
    isDemo: true,
    description:
      "Somewhere the light still lingers.\nSmall songs for the things we carry.",
    tracks: [
      {
        id: "slow-return",
        title: "Slow Return",
        trackNumber: 1,
        audioUrl: "/audio/slow-return.wav",
        duration: 24,
      },
      {
        id: "familiar-places",
        title: "Familiar Places",
        trackNumber: 2,
        audioUrl: "/audio/slow-return.wav",
        duration: 24,
      },
    ],
    backgroundAudio: { trackId: "slow-return", start: 2, end: 22 },
  },
];
