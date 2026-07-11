/**
 * MediaProcessingService tests — real sharp encoding on generated images;
 * video paths tested without ffmpeg (pass-through + size caps).
 */
import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import {
  IMAGE_MAX_BYTES,
  MediaProcessingService,
  VIDEO_MAX_BYTES,
} from "../src/shared/services/media-processing.service";
import { AppError } from "../src/shared/utils/errors";

// bogus path -> ffmpegAvailable() = false, deterministic pass-through
const service = new MediaProcessingService("definitely-not-ffmpeg-xyz");

async function makeImage(width: number, height: number): Promise<File> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .png()
    .toBuffer();
  return new File([new Uint8Array(buf)], "photo.png", { type: "image/png" });
}

describe("processImage", () => {
  it("resizes the long edge to the preset and encodes WebP", async () => {
    const input = await makeImage(2000, 1000);
    const out = await service.processImage(input, "avatar"); // preset 512
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("photo.webp");
    const meta = await sharp(Buffer.from(await out.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(256); // aspect ratio kept
  });

  it("never upscales a small image", async () => {
    const input = await makeImage(100, 50);
    const out = await service.processImage(input, "recipeMedia"); // preset 1600
    const meta = await sharp(Buffer.from(await out.arrayBuffer())).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });

  it("shrinks the byte size of a large photo", async () => {
    const input = await makeImage(1920, 1080);
    const out = await service.processImage(input, "stepImage"); // preset 1280
    expect(out.size).toBeLessThan(input.size);
  });

  it("400 FILE_TOO_LARGE above the 5 MB input cap (before decoding)", async () => {
    const big = new File(
      [new Uint8Array(IMAGE_MAX_BYTES + 1)],
      "big.png",
      { type: "image/png" },
    );
    try {
      await service.processImage(big, "avatar");
      throw new Error("expected FILE_TOO_LARGE");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("FILE_TOO_LARGE");
      expect((e as AppError).statusCode).toBe(400);
    }
  });
});

describe("processVideo", () => {
  it("passes the original through when ffmpeg is unavailable", async () => {
    expect(service.ffmpegAvailable()).toBe(false);
    const video = new File([new Uint8Array(1024)], "clip.mp4", { type: "video/mp4" });
    const out = await service.processVideo(video);
    expect(out).toBe(video); // same object, untouched
  });

  it("400 FILE_TOO_LARGE above the 50 MB cap (even without ffmpeg)", async () => {
    const big = new File(
      [new Uint8Array(VIDEO_MAX_BYTES + 1)],
      "big.mp4",
      { type: "video/mp4" },
    );
    try {
      await service.processVideo(big);
      throw new Error("expected FILE_TOO_LARGE");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("FILE_TOO_LARGE");
    }
  });
});
