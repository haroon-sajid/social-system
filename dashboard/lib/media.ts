"use client";
import { createClient } from "@/lib/supabase/client";
import { addMedia, prepareUpload } from "@/app/actions";
import type { Media } from "@/lib/platforms";

const MAX_SIDE = 2160;
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

// Instagram only accepts JPEG, so every image is converted to JPEG in the browser.
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image convert failed"))), "image/jpeg", 0.9));
}

// 1. the server makes a one-time upload link, 2. the browser sends the file to Storage,
// 3. the server saves the media row. Works with or without the login screen.
export async function uploadMedia(postId: string, file: File, sortOrder: number): Promise<Media> {
  const isVideo = file.type.startsWith("video/");
  if (isVideo && !VIDEO_TYPES.includes(file.type)) throw new Error(`${file.name}: use MP4 or MOV video`);
  if (isVideo && file.size > 100 * 1024 * 1024) throw new Error(`${file.name}: video must be under 100 MB`);
  if (!isVideo && !file.type.startsWith("image/")) throw new Error(`${file.name}: not an image or video`);

  const blob = isVideo ? file : await toJpeg(file);
  const mime = isVideo ? file.type : "image/jpeg";
  const ext = isVideo ? (file.type === "video/mp4" ? "mp4" : "mov") : "jpg";

  const prep = await prepareUpload(postId, ext);
  if (!prep.ok) throw new Error(prep.error);
  const { error: upErr } = await createClient().storage.from("post-media")
    .uploadToSignedUrl(prep.path, prep.token, blob, { contentType: mime });
  if (upErr) throw new Error(`${file.name}: ${upErr.message}`);

  const saved = await addMedia(postId, prep.path, sortOrder);
  if (!saved.ok) throw new Error(saved.error);
  return saved.media;
}
