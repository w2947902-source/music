export interface DecodedSource {
  buffer: AudioBuffer;
  peaks: number[][];
  url: string;
}
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const MAX_SOURCE_SECONDS = 600;
export async function decodeMp3(file: File): Promise<DecodedSource> {
  if (!/\.mp3$/i.test(file.name) || (file.type && !["audio/mpeg","audio/mp3","audio/x-mp3"].includes(file.type))) throw new Error("请选择 MP3 文件。");
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error("MP3 必须非空，且不能超过 30 MB。");
  const header = new Uint8Array(await file.slice(0,128).arrayBuffer());
  const id3 = header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33;
  const frame = header[0] === 0xff && (header[1] & 0xe0) === 0xe0;
  if (!id3 && !frame) throw new Error("文件内容不是可识别的 MP3，请不要仅修改扩展名。");
  // Check metadata first, before allocating a complete decoded PCM buffer.
  const { probeAudioFile } = await import("./probeFile");
  const duration = await probeAudioFile(file);
  if (duration < 20 || duration > MAX_SOURCE_SECONDS) throw new Error("原始 MP3 需要为 20 秒至 10 分钟；更长文件请先在本地缩短。");
  const buffer = await decodeBlob(file);
  if (buffer.duration < 20 || buffer.duration > MAX_SOURCE_SECONDS || buffer.numberOfChannels > 2) throw new Error("请选择 20 秒至 10 分钟的单声道或双声道 MP3。");
  return { buffer, peaks: waveformPeaks(buffer), url: URL.createObjectURL(file) };
}
export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  if (typeof AudioContext === "undefined") throw new Error("浏览器不支持本地音频处理，请使用最新版 Chrome、Edge、Firefox 或 Safari。");
  const context = new AudioContext({ sampleRate: 44100 });
  try { return await context.decodeAudioData(await blob.arrayBuffer()); }
  catch { throw new Error("音频解码失败。文件可能损坏、编码不受支持或设备内存不足，请换一个较小的 MP3。"); }
  finally { await context.close(); }
}
export function waveformPeaks(buffer: AudioBuffer): number[][] {
  const samples = buffer.getChannelData(0);
  const bins = Math.min(1800,samples.length);
  const block = Math.max(1,Math.floor(samples.length / bins));
  const peaks = [];
  for(let i=0;i<bins;i++) {
    let peak=0;
    for(let j=i*block;j<Math.min((i+1)*block,samples.length);j+=16) peak=Math.max(peak,Math.abs(samples[j]));
    peaks.push(peak);
  }
  return [peaks];
}
export async function encodeExcerpt(buffer: AudioBuffer, start: number, end: number, signal?: AbortSignal): Promise<{blob:Blob;duration:number}> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > buffer.duration + .00001 || end-start < 20 || end-start > 60) throw new Error("请选择原曲范围内的 20–60 秒片段。");
  if (signal?.aborted) throw new Error("音频处理已取消。");
  const from = Math.round(start * buffer.sampleRate);
  const to = Math.min(buffer.length,Math.round(end * buffer.sampleRate));
  const duration = (to-from)/buffer.sampleRate;
  const channels = Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i) => buffer.getChannelData(i).slice(from,to).buffer);
  const encoded = await new Promise<ArrayBuffer>((resolve,reject) => {
    const worker = new Worker("/workers/pcm-encoder.js",{type:"module"});
    const finish = (result?:ArrayBuffer, error?:string) => {
      clearTimeout(timeout); signal?.removeEventListener("abort",abort); worker.terminate();
      if (error) reject(new Error(error)); else resolve(result!);
    };
    const abort = () => finish(undefined,"音频处理已取消。");
    const timeout = setTimeout(() => finish(undefined,"片段生成超时，请选择较小文件或换一个浏览器。"),60000);
    signal?.addEventListener("abort",abort,{once:true});
    worker.onmessage = event => finish(event.data.buffer,event.data.error);
    worker.onerror = () => finish(undefined,"音频编码失败，请重新选择文件。浏览器需要支持 module Worker。");
    worker.postMessage({channels,sampleRate:buffer.sampleRate},channels);
  });
  return {blob:new Blob([encoded],{type:"audio/wav"}),duration};
}
