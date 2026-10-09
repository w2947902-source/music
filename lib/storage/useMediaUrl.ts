"use client";
import { useEffect, useState } from "react";
import { acquireMediaUrl, releaseMediaUrl } from "./mediaUrls";

export function useMediaUrl(source?: string) {
  const [resolved, setResolved] = useState<{
    source: string;
    url: string;
    error?: string;
  }>();
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let acquired = false;
    acquireMediaUrl(source)
      .then((url) => {
        acquired = true;
        if (cancelled) releaseMediaUrl(source);
        else setResolved({ source, url });
      })
      .catch(() => {
        if (!cancelled) setResolved({ source, url: "", error: "素材不可用" });
      });
    return () => {
      cancelled = true;
      if (acquired) releaseMediaUrl(source);
    };
  }, [source]);
  return resolved && resolved.source === source
    ? resolved
    : {
        source: source ?? "",
        url: source?.startsWith("asset:") ? "" : (source ?? ""),
      };
}
