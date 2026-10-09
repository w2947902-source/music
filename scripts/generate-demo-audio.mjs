import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const directory = fileURLToPath(new URL("../public/audio/", import.meta.url));
await mkdir(directory, { recursive: true });
const rate = 22050;
const seconds = 24;
const chords = [
  ["first-light", [130.81, 164.81, 196, 261.63]],
  ["night-window", [110, 130.81, 164.81, 220]],
  ["slow-return", [146.83, 174.61, 220, 293.66]],
];
for (const [name, frequencies] of chords) {
  const samples = rate * seconds;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const envelope =
      Math.min(1, t / 2, (seconds - t) / 2) *
      (0.8 + 0.2 * Math.sin((t * Math.PI) / 6));
    let value = 0;
    frequencies.forEach((frequency, index) => {
      value +=
        Math.sin(
          2 * Math.PI * frequency * t + Math.sin(t * 0.3 + index) * 0.2,
        ) *
        (0.13 / (index + 1));
    });
    buffer.writeInt16LE(Math.round(value * envelope * 32767), 44 + i * 2);
  }
  await writeFile(`${directory}/${name}.wav`, buffer);
  console.log(`Generated original ambient tone: ${name}.wav`);
}
