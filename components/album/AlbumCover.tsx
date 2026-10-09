"use client";
import { useState } from "react";
import { Disc3 } from "lucide-react";
import { useMediaUrl } from "@/lib/storage/useMediaUrl";
export function AlbumCover({
  source,
  title,
  className = "",
}: {
  source: string;
  title: string;
  className?: string;
}) {
  const media = useMediaUrl(source);
  const [failedSource, setFailedSource] = useState<string>();
  const hasCover = media.url && !media.error && failedSource !== media.url;
  return (
    <div className={`album-cover ${className}`}>
      {hasCover ? (
        <img
          src={media.url}
          alt={`${title} 专辑封面`}
          draggable={false}
          onError={() => setFailedSource(media.url)}
        />
      ) : (
        <div className="cover-fallback">
          <Disc3 strokeWidth={0.8} />
          <span>{title}</span>
        </div>
      )}
    </div>
  );
}
