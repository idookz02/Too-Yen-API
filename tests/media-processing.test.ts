/**
 * MediaProcessingService tests — real sharp encoding on generated images and a
 * real end-to-end transcode through the bundled ffmpeg-static binary; the
 * pass-through fallback is exercised with a bogus ffmpeg path.
 */
import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  IMAGE_MAX_BYTES,
  MediaProcessingService,
  VIDEO_MAX_BYTES,
  mediaProcessingService,
  resolveFfmpegPath,
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
  it("the bundled ffmpeg-static binary is available by default", () => {
    expect(mediaProcessingService.ffmpegAvailable()).toBe(true);
  });

  it("transcodes a real clip to a smaller H.264 mp4 (end-to-end)", async () => {
    // generate a deliberately bulky 2s test clip with the bundled ffmpeg
    const dir = await mkdtemp(join(tmpdir(), "too-yen-fixture-"));
    try {
      const fixture = join(dir, "fixture.mp4");
      const gen = Bun.spawn(
        [
          resolveFfmpegPath(),
          "-y",
          "-f", "lavfi",
          "-i", "testsrc=duration=2:size=1280x720:rate=30",
          "-c:v", "mpeg4",
          "-q:v", "1", // near-lossless mpeg4 -> big file, lots to shrink
          fixture,
        ],
        { stdout: "ignore", stderr: "ignore" },
      );
      expect(await gen.exited).toBe(0);

      const input = new File(
        [new Uint8Array(await readFile(fixture))],
        "clip.mp4",
        { type: "video/mp4" },
      );
      const out = await mediaProcessingService.processVideo(input);
      expect(out.type).toBe("video/mp4");
      expect(out.name).toBe("clip.mp4");
      expect(out.size).toBeGreaterThan(0);
      expect(out.size).toBeLessThan(input.size); // actually compressed
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("stores the original when the input is corrupt (graceful fallback)", async () => {
    const garbage = new File([new Uint8Array(4096)], "broken.mp4", {
      type: "video/mp4",
    });
    const out = await mediaProcessingService.processVideo(garbage);
    expect(out).toBe(garbage); // ffmpeg fails -> original kept, no throw
  }, 30_000);

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
