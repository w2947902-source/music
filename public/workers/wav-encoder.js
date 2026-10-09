/** Encode independently playable 16-bit PCM WAV, using only the supplied excerpt.
 * @param {Float32Array[]} channels
 * @param {number} sampleRate
 * @returns {ArrayBuffer}
 */
export function encodePcmWav(channels, sampleRate) {
  if (!channels.length || channels.length > 2 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new Error("无效的音频参数。");
  const frames = channels[0].length;
  const duration = frames / sampleRate;
  if (duration < 20 || duration > 60 || channels.some(channel => channel.length !== frames)) throw new Error("音乐片段必须为 20–60 秒。");
  const blockAlign = channels.length * 2;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  function label(offset, value) { for (let i=0;i<value.length;i++) view.setUint8(offset+i,value.charCodeAt(i)); }
  label(0,"RIFF"); view.setUint32(4,36+dataSize,true); label(8,"WAVE"); label(12,"fmt ");
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,channels.length,true);
  view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*blockAlign,true);
  view.setUint16(32,blockAlign,true); view.setUint16(34,16,true); label(36,"data"); view.setUint32(40,dataSize,true);
  for(let frame=0,offset=44;frame<frames;frame++) for(const channel of channels) {
    const sample = Number.isFinite(channel[frame]) ? Math.max(-1,Math.min(1,channel[frame])) : 0;
    view.setInt16(offset,Math.round(sample < 0 ? sample*32768 : sample*32767),true); offset+=2;
  }
  return buffer;
}
