/**
 * Anthropic settings and request configuration.
 *
 * These checks exist because a wrong env var must produce a clean fallback rather than a
 * 502 in front of a patient - which is exactly what happened once: the request carried
 * `temperature: 0`, the newer models answer `400 temperature is deprecated for this
 * model`, and the route reported "Auto-fill failed". Hence the assertions on the default
 * model, on a junk temperature being dropped rather than sent as NaN, and on the
 * no-key message naming the variable someone actually has to set.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeSettings, llmSettings, NO_PROVIDER_MESSAGE } from "@/lib/llm";

const KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_TEMPERATURE",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Anthropic settings", () => {
  it("defaults to the model that was measured fastest and still accepts temperature", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const s = llmSettings();
    expect(s?.model).toBe("claude-haiku-4-5-20251001");
    expect(s?.temperature).toBe(0); // reproducible: same reply, same fields, every time
    expect(s?.baseURL).toBeUndefined(); // the SDK's own default is correct
  });

  it("returns null - not a throw - when nothing is configured", () => {
    expect(llmSettings()).toBeNull();
  });

  it("honours a custom model and base URL", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5";
    process.env.ANTHROPIC_BASE_URL = "https://gateway.example";
    const s = llmSettings();
    expect(s?.model).toBe("claude-sonnet-5");
    expect(s?.baseURL).toBe("https://gateway.example");
  });

  it("ignores a junk temperature rather than sending NaN", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.ANTHROPIC_TEMPERATURE = "warm";
    // NaN is a 400, and a typo in an env var must not take extraction down.
    expect(llmSettings()?.temperature).toBeUndefined();
  });

  it("lets temperature be overridden", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.ANTHROPIC_TEMPERATURE = "0.3";
    expect(llmSettings()?.temperature).toBe(0.3);
  });
});

describe("describeSettings", () => {
  it("names the provider, the model and the sampling actually used", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const line = describeSettings(llmSettings()!);
    expect(line).toContain("anthropic");
    expect(line).toContain("claude-haiku-4-5-20251001");
    expect(line).toContain("temp 0");
  });
});

describe("missing-provider message", () => {
  it("directs the user to Anthropic configuration", () => {
    expect(NO_PROVIDER_MESSAGE).toContain("ANTHROPIC_API_KEY");
  });
});
