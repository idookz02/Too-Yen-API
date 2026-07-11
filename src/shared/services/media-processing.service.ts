/**
 * Server-side media compression before storage upload (decision 2026-07-10).
 *
 * Images: sharp — auto-orient, resize the long edge to a per-type preset
 * (never upscale), encode WebP q80. Everything in storage becomes .webp.
 *
 * Videos: transcoded to H.264 720p CRF28 mp4 with the ffmpeg binary BUNDLED
 * via the `ffmpeg-static` npm package (installed by `bun install` — no host
 * setup, nothing delegated to the client). Resolution order: env FFMPEG_PATH
 * override → bundled binary → `ffmpeg` on PATH. If the binary is missing on an
 * exotic platform or a transcode fails (corrupt file, odd codec), the original
 * file is stored unchanged — uploads never fail because of the transcoder.
 *
 * Input caps (checked before compressing): image ≤ 5 MB, video ≤ 50 MB
 * → 400 FILE_TOO_LARGE.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { env } from "../../config/environment";
import { badRequest } from "../utils/errors";

/** env override → ffmpeg-static bundled binary → PATH fallback. */
export const resolveFfmpegPath = (): string =>
  env.FFMPEG_PATH ?? (ffmpegStatic as string | null) ?? "ffmpeg";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const WEBP_QUALITY = 80;

/** Long-edge caps per upload type (decision 2026-07-10). */
export const IMAGE_PRESETS = {
  avatar: 512,
  recipeMedia: 1600,
  stepImage: 1280,
  commentImage: 1280,
} as const;
export type ImagePreset = keyof typeof IMAGE_PRESETS;

const baseName = (file: File, fallback: string) =>
  (file.name || fallback).replace(/\.[^.]+$/, "") || fallback;

export class MediaProcessingService {
  private ffmpegOk: boolean | undefined;

  constructor(private readonly ffmpegPath: string = resolveFfmpegPath()) {}

  /** Resize + WebP-encode an image; enforces the 5 MB input cap. */
  async processImage(file: File, preset: ImagePreset): Promise<File> {
    if (file.size > IMAGE_MAX_BYTES) {
      throw badRequest(
        `Image exceeds the ${IMAGE_MAX_BYTES / 1024 / 1024} MB limit`,
        "FILE_TOO_LARGE",
      );
    }
    const max = IMAGE_PRESETS[preset];
    const input = Buffer.from(await file.arrayBuffer());
    const output = await sharp(input, { animated: true })
      .rotate() // honour EXIF orientation from phone cameras
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    return new File([new Uint8Array(output)], `${baseName(file, "image")}.webp`, {
      type: "image/webp",
    });
  }

  /** Cached probe — is ffmpeg runnable at the configured path? */
  ffmpegAvailable(): boolean {
    if (this.ffmpegOk === undefined) {
      try {
        const probe = Bun.spawnSync([this.ffmpegPath, "-version"], {
          stdout: "ignore",
          stderr: "ignore",
        });
        this.ffmpegOk = probe.exitCode === 0;
      } catch {
        this.ffmpegOk = false;
      }
    }
    return this.ffmpegOk;
  }

  /**
   * Transcode a video to H.264 720p when ffmpeg is available; otherwise (or
   * when transcoding fails / doesn't shrink the file) return the original.
   * Enforces the 50 MB input cap either way.
   */
  async processVideo(file: File): Promise<File> {
    if (file.size > VIDEO_MAX_BYTES) {
      throw badRequest(
        `Video exceeds the ${VIDEO_MAX_BYTES / 1024 / 1024} MB limit`,
        "FILE_TOO_LARGE",
      );
    }
    if (!this.ffmpegAvailable()) return file;

    const dir = await mkdtemp(join(tmpdir(), "too-yen-ffmpeg-"));
    try {
      const ext = file.name?.includes(".") ? file.name.split(".").pop() : "mp4";
      const inPath = join(dir, `in.${ext}`);
      const outPath = join(dir, "out.mp4");
      await writeFile(inPath, new Uint8Array(await file.arrayBuffer()));

      const proc = Bun.spawn(
        [
          this.ffmpegPath,
          "-y",
          "-i", inPath,
          // cap height at 720p, keep aspect ratio, even dimensions; no upscale
          "-vf", "scale=-2:min(720\\,ih)",
          "-c:v", "libx264",
          "-crf", "28",
          "-preset", "veryfast",
          "-c:a", "aac",
          "-b:a", "128k",
          "-movflags", "+faststart",
          outPath,
        ],
        { stdout: "ignore", stderr: "pipe" },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        console.error(`[media] ffmpeg failed (exit ${exitCode}) — storing original:`, stderr.slice(-500));
        return file;
      }

      const output = await readFile(outPath);
      if (output.byteLength >= file.size) return file; // transcode didn't shrink it
      return new File([new Uint8Array(output)], `${baseName(file, "video")}.mp4`, {
        type: "video/mp4",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

export const mediaProcessingService = new MediaProcessingService();
