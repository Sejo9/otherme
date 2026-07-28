"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase/client";

export const BUCKET = "media";

/**
 * Uploads a file and returns its storage path.
 * Images are downscaled in the browser first — phone photos are ~4MB and
 * nobody needs that for a card that renders at 400px.
 */
export async function uploadImage(file: File, prefix: string): Promise<string> {
  const blob = await downscale(file, 1600, 0.82);
  const path = `${prefix}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabaseBrowser()
    .storage.from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });

  if (error) throw error;
  return path;
}

async function downscale(file: File, maxEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      quality
    )
  );
}

const urlCache = new Map<string, { url: string; expires: number }>();

/** Signed URL for a private storage object, cached until shortly before expiry. */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!path) return null;
    const hit = urlCache.get(path);
    return hit && hit.expires > Date.now() ? hit.url : null;
  });

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }

    const hit = urlCache.get(path);
    if (hit && hit.expires > Date.now()) {
      setUrl(hit.url);
      return;
    }

    let cancelled = false;
    supabaseBrowser()
      .storage.from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (cancelled || !data?.signedUrl) return;
        urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 3_000_000 });
        setUrl(data.signedUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}
