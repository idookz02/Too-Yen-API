/**
 * VisionService tests — mocked fetch (no real OpenAI calls, no key needed).
 */
import { afterEach, describe, expect, it } from "bun:test";
import { VisionService } from "../src/shared/services/vision.service";
import { AppError } from "../src/shared/utils/errors";

const png = () => new File(["x"], "food.png", { type: "image/png" });

const openAiReply = (content: unknown) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200 },
  );

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("VisionService", () => {
  it("503 FEATURE_DISABLED when OPENAI_API_KEY is absent", async () => {
    const service = new VisionService();
    try {
      await service.analyzeFood(png());
      throw new Error("expected FEATURE_DISABLED");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).statusCode).toBe(503);
      expect((e as AppError).code).toBe("FEATURE_DISABLED");
    }
  });

  it("parses dish + ingredients from the OpenAI response", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const service = new VisionService(async () =>
      openAiReply({
        dish: { th: "ต้มยำกุ้ง", en: "Tom Yum Goong" },
        ingredients: [
          { th: "กุ้ง", en: "Shrimp" },
          { th: "ตะไคร้", en: "Lemongrass" },
        ],
      }),
    );
    const res = await service.analyzeFood(png());
    expect(res.dish).toEqual({ th: "ต้มยำกุ้ง", en: "Tom Yum Goong" });
    expect(res.ingredients).toHaveLength(2);
    expect(res.ingredients[0]).toEqual({ th: "กุ้ง", en: "Shrimp" });
  });

  it("handles a null dish (raw-ingredients photo) and caps at 12 ingredients", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const many = Array.from({ length: 20 }, (_, i) => ({ th: `วัตถุดิบ${i}`, en: `Ing${i}` }));
    const service = new VisionService(async () => openAiReply({ dish: null, ingredients: many }));
    const res = await service.analyzeFood(png());
    expect(res.dish).toBeNull();
    expect(res.ingredients).toHaveLength(12);
    expect(res.equipment).toEqual([]); // absent in the reply -> empty, not crash
  });

  it("parses equipment and caps it at 6", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const many = Array.from({ length: 10 }, (_, i) => ({ th: `อุปกรณ์${i}`, en: `Eq${i}` }));
    const service = new VisionService(async () =>
      openAiReply({
        dish: null,
        ingredients: [],
        equipment: [{ th: "หม้อ", en: "Pot" }, ...many],
      }),
    );
    const res = await service.analyzeFood(png());
    expect(res.equipment[0]).toEqual({ th: "หม้อ", en: "Pot" });
    expect(res.equipment).toHaveLength(6);
  });

  it("502 VISION_API_ERROR on an upstream failure", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const service = new VisionService(async () => new Response("quota exceeded", { status: 429 }));
    try {
      await service.analyzeFood(png());
      throw new Error("expected VISION_API_ERROR");
    } catch (e) {
      expect((e as AppError).statusCode).toBe(502);
      expect((e as AppError).code).toBe("VISION_API_ERROR");
    }
  });

  it("502 on malformed JSON content", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const service = new VisionService(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{not json" } }] }), {
        status: 200,
      }),
    );
    try {
      await service.analyzeFood(png());
      throw new Error("expected VISION_API_ERROR");
    } catch (e) {
      expect((e as AppError).code).toBe("VISION_API_ERROR");
    }
  });

  it("sends the model, JSON mode, and the image as a data URL", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    let captured: Record<string, unknown> = {};
    const service = new VisionService(async (_url, init) => {
      captured = JSON.parse(String(init?.body));
      return openAiReply({ dish: null, ingredients: [] });
    });
    await service.analyzeFood(png());
    expect(captured.model).toBe("gpt-4o-mini");
    expect(captured.response_format).toEqual({ type: "json_object" });
    const content = (captured.messages as { content: unknown }[])[1]!.content as {
      type: string;
      image_url?: { url: string };
    }[];
    expect(content[1]!.image_url!.url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
