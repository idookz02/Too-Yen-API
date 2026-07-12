/**
 * Food-photo analysis via OpenAI GPT-4o-mini (decision 2026-07-10 — the user
 * chose GPT-4o-mini over Claude for cost). Raw fetch, no SDK dependency.
 *
 * The feature degrades gracefully: without OPENAI_API_KEY the endpoint
 * returns 503 FEATURE_DISABLED — nothing else in the app depends on it.
 */
import { env } from "../../config/environment";
import { AppError } from "../utils/errors";

/** Dish + ingredient names in both languages so DB matching can try each. */
export type DishAnalysis = {
  dish: { th: string; en: string } | null;
  ingredients: { th: string; en: string }[];
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You identify food in photos for a Thai recipe-sharing app.
Reply with ONLY a JSON object in this exact shape:
{"dish": {"th": "ชื่อเมนูภาษาไทย", "en": "Dish name in English"} | null,
 "ingredients": [{"th": "ชื่อวัตถุดิบไทย", "en": "Ingredient in English"}]}
Rules:
- "dish" is null when no recognizable prepared dish is visible (e.g. a photo of raw ingredients only).
- "ingredients": every ingredient clearly visible in the photo, plus the core ingredients the dish is known to contain. Base/common items (water, salt) excluded. Max 12.
- Use the most common name in each language.`;

/** Plain signature (not `typeof fetch`) so tests can inject a simple mock. */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class VisionService {
  constructor(private readonly fetchFn: FetchLike = fetch) {}

  available(): boolean {
    return Boolean(env.OPENAI_API_KEY);
  }

  /** Analyze a (pre-compressed) food photo. Throws AppError on config/API errors. */
  async analyzeFood(image: File): Promise<DishAnalysis> {
    if (!this.available()) {
      throw new AppError(
        503,
        "Image search is not configured on this server (missing OPENAI_API_KEY)",
        "FEATURE_DISABLED",
      );
    }

    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const res = await this.fetchFn(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify the dish and its ingredients." },
              {
                type: "image_url",
                image_url: { url: `data:${image.type};base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[vision] OpenAI error ${res.status}:`, detail.slice(0, 300));
      throw new AppError(502, "Image analysis failed — try again later", "VISION_API_ERROR");
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) throw new AppError(502, "Image analysis returned no content", "VISION_API_ERROR");

    let parsed: { dish?: unknown; ingredients?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError(502, "Image analysis returned malformed data", "VISION_API_ERROR");
    }

    const dish =
      parsed.dish && typeof parsed.dish === "object"
        ? {
            th: String((parsed.dish as Record<string, unknown>).th ?? ""),
            en: String((parsed.dish as Record<string, unknown>).en ?? ""),
          }
        : null;
    const ingredients = Array.isArray(parsed.ingredients)
      ? parsed.ingredients
          .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
          .map((i) => ({ th: String(i.th ?? ""), en: String(i.en ?? "") }))
          .filter((i) => i.th || i.en)
          .slice(0, 12)
      : [];

    return { dish: dish && (dish.th || dish.en) ? dish : null, ingredients };
  }
}

export const visionService = new VisionService();
