import { validateCover } from "./probeFile";

export interface Mp3Metadata {
  album: string;
  artist: string;
  title: string;
  year?: number;
  cover?: File;
  notice?: string;
}

function text(value?: string): string {
  return (value ?? "").replace(/\0/g, "").trim().slice(0, 200);
}

async function embeddedCover(data: number[], format: string): Promise<File> {
  const bytes = Uint8Array.from(data);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const mime = jpeg ? "image/jpeg" : png ? "image/png" : webp ? "image/webp" : format;
  const blob = new Blob([bytes], { type: mime });
  if (["image/jpeg", "image/png", "image/webp"].includes(mime) && blob.size <= 5 * 1024 * 1024) {
    const cover = new File([blob], "embedded-cover", { type: mime });
    await validateCover(cover);
    return cover;
  }

  // Convert large or other browser-readable artwork locally before uploading.
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("封面无法转换。");
    context.fillStyle = "#18201b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const converted = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("封面无法转换。")), "image/jpeg", 0.88);
    });
    const cover = new File([converted], "embedded-cover.jpg", { type: "image/jpeg" });
    await validateCover(cover);
    return cover;
  } finally {
    bitmap.close();
  }
}

/** Read only embedded tags in the browser; the original song never leaves the device. */
export async function readMp3Metadata(file: File): Promise<Mp3Metadata> {
  const filename = file.name.replace(/\.mp3$/i, "").replace(/^\d+[\s._-]+/, "");
  const parts = filename.split(/\s+[-–—]\s+/);
  const fallbackTitle = text(parts.length > 1 ? parts.slice(1).join(" - ") : filename) || "未命名歌曲";
  const fallback: Mp3Metadata = {
    title: fallbackTitle,
    album: fallbackTitle,
    artist: parts.length > 1 ? text(parts[0]) || "未知艺术家" : "未知艺术家",
  };
  try {
    const { default: MP3Tag } = await import("mp3tag.js");
    const tags = await MP3Tag.readBlob(file, { mp4: false, aiff: false, aac: false, unsupported: false });
    const result: Mp3Metadata = {
      title: text(tags.title) || fallback.title,
      album: text(tags.album) || text(tags.title) || fallback.album,
      artist: text(tags.v2?.TPE2 ?? tags.v2?.TP2) || text(tags.artist) || fallback.artist,
    };
    const year = Number(text(tags.v2?.TDRC || tags.year).match(/^\d{4}/)?.[0]);
    if (year >= 1000 && year <= 9999) result.year = year;
    const pictures = tags.v2?.APIC ?? tags.v2?.PIC ?? [];
    const picture = pictures.find(item => item.type === 3 && item.data?.length)
      ?? pictures.find(item => item.data?.length);
    if (picture) {
      try {
        result.cover = await embeddedCover(picture.data, picture.format);
      } catch {
        result.notice = "内嵌封面无法读取，可展开“修改识别信息”更换封面。";
      }
    } else {
      result.notice = "文件没有内嵌封面，可展开“修改识别信息”添加。";
    }
    if (!text(tags.album) || !(text(tags.artist) || text(tags.v2?.TPE2 ?? tags.v2?.TP2))) {
      result.notice = [result.notice, "缺少的标签已用文件名补充，可展开修改。"].filter(Boolean).join(" ");
    }
    return result;
  } catch {
    return { ...fallback, notice: "无法读取内嵌信息，已用文件名补充；可展开“修改识别信息”调整。" };
  }
}
