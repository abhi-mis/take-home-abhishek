/**
 * The model boundary: Gemini 3 Flash, temperature 0, and no way to change either.
 *
 * That is a promise the feature makes rather than a preference - the same spoken reply has
 * to fill the same fields every time or a voice-filled intake cannot be audited - so it is
 * tested as a promise. The env vars asserted against here (`GEMINI_MODEL`,
 * `GEMINI_TEMPERATURE`) are ones a reader would reasonably expect to work, and they do not:
 * a deployment that quietly ran a different model on a patient's words would look exactly
 * like a deployment that did not.
 *
 * The other half is the error classification. A revoked key must not be reported as a
 * hiccup, because "try again" is advice that can never come good - that was a real bug,
 * found when the previous provider's key expired mid-session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LlmHttpError,
  MODEL,
  TEMPERATURE,
  callModel,
  describeSettings,
  isConfigError,
  llmSettings,
  providerDetail,
  NO_PROVIDER_MESSAGE,
} from "@/lib/llm";

const KEYS = ["GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_TEMPERATURE"] as const;
let saved: Record<string, string | undefined> = {};

/** One captured request, so the assertions are about what went on the wire. */
let sent: { url: string; init: RequestInit } | null = null;

function stubFetch(
  status: number,
  body: unknown,
  text = JSON.stringify(body),
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string | URL, init: RequestInit) => {
    sent = { url: String(url), init };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => text,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn as unknown as ReturnType<typeof vi.fn>;
}

const reply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

beforeEach(() => {
  sent = null;
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("the pinned model", () => {
  it("is Gemini 3 Flash at temperature 0", () => {
    expect(MODEL).toBe("gemini-3-flash-preview");
    expect(TEMPERATURE).toBe(0);
  });

  it("sends that model, that temperature, and one user turn", async () => {
    stubFetch(200, reply('{"smoking":true}'));
    const out = await callModel({ apiKey: "test-key" }, "system", "user");

    expect(out).toBe('{"smoking":true}');
    expect(sent?.url).toContain("gemini-3-flash-preview:generateContent");

    const body = JSON.parse(String(sent?.init.body)) as Record<string, never>;
    expect(body.generationConfig).toMatchObject({
      temperature: 0,
      responseMimeType: "application/json",
    });
    expect(body.system_instruction).toEqual({ parts: [{ text: "system" }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "user" }] }]);
  });

  it("carries the key in a header, never in the query string", async () => {
    // A URL ends up in access logs and proxy caches, and this one is a credential.
    stubFetch(200, reply("{}"));
    await callModel({ apiKey: "test-key" }, "system", "user");
    expect(sent?.url).not.toContain("test-key");
    expect(
      (sent?.init.headers as Record<string, string>)["x-goog-api-key"],
    ).toBe("test-key");
  });

  it("cannot be switched by an environment variable", async () => {
    process.env.GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
    process.env.GEMINI_TEMPERATURE = "0.9";
    process.env.GEMINI_API_KEY = "test-key";

    // The key is the only thing settings carry: nothing else is configurable.
    expect(llmSettings()).toEqual({ apiKey: "test-key" });

    stubFetch(200, reply("{}"));
    await callModel({ apiKey: "test-key" }, "system", "user");
    expect(sent?.url).toContain("gemini-3-flash-preview");
    expect(JSON.parse(String(sent?.init.body)).generationConfig.temperature).toBe(0);
  });

  it("joins every part, because a thinking model can return more than one", async () => {
    /*
      Taking `parts[0].text` would silently truncate a JSON object at whatever boundary the
      model happened to use - and a truncated object parses as nothing, so the patient sees
      "nothing matched" for a reply that was understood perfectly.
    */
    stubFetch(200, {
      candidates: [{ content: { parts: [{ text: '{"smoking":' }, { text: "true}" }] } }],
    });
    expect(await callModel({ apiKey: "test-key" }, "s", "u")).toBe('{"smoking":true}');
  });

  it("survives a response with no candidates at all", async () => {
    stubFetch(200, { candidates: [] });
    expect(await callModel({ apiKey: "test-key" }, "s", "u")).toBe("");
  });
});

describe("classifying a failure", () => {
  it("throws with the status kept, so the route can tell the two apart", async () => {
    stubFetch(401, { error: { message: "API key not valid" } });
    await expect(callModel({ apiKey: "dead-key" }, "s", "u")).rejects.toBeInstanceOf(
      LlmHttpError,
    );
  });

  it.each([400, 401, 403, 404])("treats %i as a configuration problem", (status) => {
    // None of these come right by retrying: a revoked key, a key without access to this
    // model, a model id that no longer exists. Offering "try again" is advice that cannot
    // come good, which is exactly the bug an expired key produced.
    expect(isConfigError(new LlmHttpError(status, "nope"))).toBe(true);
  });

  it.each([429, 500, 503, 504])("treats %i as worth another try", (status) => {
    expect(isConfigError(new LlmHttpError(status, "nope"))).toBe(false);
  });

  it("is not fooled by an ordinary error", () => {
    expect(isConfigError(new Error("network down"))).toBe(false);
    expect(isConfigError("401")).toBe(false);
  });

  it("keeps the provider's own words for the log, capped", () => {
    expect(providerDetail(new LlmHttpError(404, "model not found"))).toContain("404");
    expect(providerDetail(new Error("x".repeat(600))).length).toBeLessThanOrEqual(300);
  });
});

describe("a missing key", () => {
  it("returns null - not a throw - so the route can answer 503 and the patient can tap", () => {
    expect(llmSettings()).toBeNull();
  });

  it("names the variable someone actually has to set", () => {
    expect(NO_PROVIDER_MESSAGE).toContain("GEMINI_API_KEY");
    // ...and says what still works, because this is not a patient's problem to solve.
    expect(NO_PROVIDER_MESSAGE.toLowerCase()).toContain("tap");
  });
});

describe("describeSettings", () => {
  it("names the provider, the model and the sampling, for the eval banner", () => {
    const line = describeSettings({ apiKey: "test-key" });
    expect(line).toContain("google");
    expect(line).toContain("gemini-3-flash-preview");
    expect(line).toContain("temp 0");
  });
});
