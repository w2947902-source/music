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
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    throw new Error("请上传 JPG、PNG、WebP 或其他浏览器支持的位图封面。");
  if (file.size > 30 * 1024 * 1024) throw new Error("封面不能超过 30 MB。");
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
