export async function probeAudioFile(file: File): Promise<number> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (
    !file.type.startsWith("audio/") &&
    !["mp3", "wav", "m4a", "aac", "ogg", "flac", "webm", "aiff"].includes(
      extension,
    )
  )
    throw new Error(`“${file.name}” 不是支持的音频文件。`);
  if (!file.size) throw new Error(`“${file.name}” 是空文件。`);
  const url = URL.createObjectURL(file);
  const audio = new Audio();
  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => finish(undefined, "无法读取音频，请检查编码格式。"),
        15000,
      );
      const finish = (duration?: number, message?: string) => {
        clearTimeout(timer);
        audio.onloadedmetadata = null;
        audio.onerror = null;
        if (message) reject(new Error(`“${file.name}”：${message}`));
        else resolve(duration!);
      };
      audio.onloadedmetadata = () =>
        Number.isFinite(audio.duration) && audio.duration > 0
          ? finish(audio.duration)
          : finish(undefined, "无法读取歌曲长度。");
      audio.onerror = () =>
        finish(undefined, "浏览器无法播放此音频，请转换为 MP3 或 WAV。");
      audio.preload = "metadata";
      audio.src = url;
      audio.load();
    });
  } finally {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
}
export async function validateCover(file: File): Promise<void> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("请上传 JPG、PNG 或 WebP 封面。");
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("封面必须非空且不能超过 5 MB。");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(file.type === "image/jpeg" ? jpeg : file.type === "image/png" ? png : webp))
    throw new Error("封面内容与文件格式不一致，请使用真正的 JPG、PNG 或 WebP 图片。");
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        reject(new Error("封面加载超时。"));
      }, 10000);
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error("这张封面无法读取。"));
      };
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
