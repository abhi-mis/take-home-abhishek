/**
 * Provider resolution and request shape.
 *
 * These are the checks that a wrong env var produces a clear fallback rather than a 400
 * from someone's API at 2am. The NIM traps are specifically guarded, because both are
 * hard failures in production and completely invisible in a unit test unless asserted:
 *
 *   - sending `temperature` to a reasoning model (o-series, gpt-5 style), which rejects
 *     it outright, along with `max_tokens` where it wants `max_completion_tokens`;
 *   - sending `reasoning_effort` to a model that does not accept the field.
 *
 * The Anthropic path is asserted on settings rather than on a request body, because its
 * body is built inside `callModel()` by the SDK - there is no shape to get wrong.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeSettings, llmSettings, nimParams, resolveProvider } from "@/lib/llm";

const KEYS = [
  "EXTRACT_PROVIDER",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "NVIDIA_API_KEY",
  "NVIDIA_BASE_URL",
  "NVIDIA_MODEL",
  "NVIDIA_REASONING_EFFORT",
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

/** The NIM-specific keys are attached outside the SDK's published types. */
const raw = (p: unknown) => p as Record<string, unknown>;

describe("provider resolution", () => {
  it("prefers Anthropic when its key is present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.NVIDIA_API_KEY = "nvapi-test";
    expect(resolveProvider()).toBe("anthropic");
    const s = llmSettings();
    expect(s?.model).toBe("claude-sonnet-5");
    expect(s?.baseURL).toBeUndefined(); // the SDK's own default is correct
  });

  it("falls back to NVIDIA when only that key is set", () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    const s = llmSettings();
    expect(s?.provider).toBe("nvidia");
    expect(s?.baseURL).toBe("https://integrate.api.nvidia.com/v1");
    expect(s?.model).toBe("openai/gpt-oss-20b");
  });

  it("lets EXTRACT_PROVIDER override the key that happens to be present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.NVIDIA_API_KEY = "nvapi-test";
    process.env.EXTRACT_PROVIDER = "nvidia";
    expect(llmSettings()?.provider).toBe("nvidia");
  });

  it("returns null - not a throw - when nothing is configured", () => {
    expect(resolveProvider()).toBeNull();
    expect(llmSettings()).toBeNull();
  });

  it("returns null when the forced provider's key is missing", () => {
    process.env.EXTRACT_PROVIDER = "anthropic";
    process.env.NVIDIA_API_KEY = "nvapi-test";
    // Explicit beats convenient: silently answering from the other provider would make
    // the eval report a model that never ran.
    expect(llmSettings()).toBeNull();
  });

  it("honours a custom model and base URL", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
    process.env.ANTHROPIC_BASE_URL = "https://gateway.example";
    const s = llmSettings();
    expect(s?.model).toBe("claude-haiku-4-5-20251001");
    expect(s?.baseURL).toBe("https://gateway.example");
  });

  it("never sends a NIM reasoning setting down the Anthropic path", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.NVIDIA_REASONING_EFFORT = "high";
    expect(llmSettings()?.reasoningEffort).toBeUndefined();
  });
});

describe("the NIM request shape", () => {
  const params = () => raw(nimParams(llmSettings()!, "sys", "user"));

  it("sends temperature 0 and max_tokens for a normal model", () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    const p = params();
    expect(p.temperature).toBe(0);
    expect(p.max_tokens).toBe(900);
    expect(p.reasoning_effort).toBe("low");
    expect(p.max_completion_tokens).toBeUndefined();
  });

  it("omits temperature and uses max_completion_tokens for a reasoning model", () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    process.env.NVIDIA_MODEL = "openai/gpt-5-mini";
    const p = params();
    expect(p.temperature).toBeUndefined();
    expect(p.max_tokens).toBeUndefined();
    expect(p.max_completion_tokens).toBe(900);
  });

  it('drops reasoning_effort entirely when set to "none"', () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    process.env.NVIDIA_REASONING_EFFORT = "none";
    expect(llmSettings()!.reasoningEffort).toBeUndefined();
    expect(params().reasoning_effort).toBeUndefined();
  });

  it("passes the system prompt as a system message", () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    const messages = params().messages as { role: string; content: string }[];
    expect(messages[0]).toEqual({ role: "system", content: "sys" });
    expect(messages[1]).toEqual({ role: "user", content: "user" });
  });
});

describe("describeSettings", () => {
  it("names the provider, the model and the JSON strategy", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const line = describeSettings(llmSettings()!);
    expect(line).toContain("anthropic");
    expect(line).toContain("claude-sonnet-5");
    expect(line).toContain("prefill");
  });
});
