import { encodePcmWav } from "./wav-encoder.js";
self.onmessage = (event) => {
  try {
    const { channels, sampleRate } = event.data;
    const result = encodePcmWav(channels.map(buffer => new Float32Array(buffer)),sampleRate);
    self.postMessage({ buffer: result }, [result]);
  } catch(error) { self.postMessage({ error: error instanceof Error ? error.message : "片段编码失败。" }); }
};
