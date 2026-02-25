import { describe, expect, test, mock, afterEach } from "bun:test";
import {
  generateFallbackComment,
  resolveFallbacks,
  buildPrompt,
  detectProvider,
  validateReplacement,
} from "../../src/llm/index";
import type { FallbackItem } from "../../src/types";

describe("generateFallbackComment", () => {
  test("generates correct TODO comment format", () => {
    const item: FallbackItem = {
      source: "<input v-focus />",
      reason: "Custom directive v-focus cannot be auto-converted",
    };
    const comment = generateFallbackComment(item);

    expect(comment).toBe(
      "{/* TODO: vue-to-tsx - Custom directive v-focus cannot be auto-converted */}\n{/* Original: <input v-focus /> */}",
    );
  });

  test("includes line info in reason if present", () => {
    const item: FallbackItem = {
      source: '<div v-custom="data" />',
      reason: "Unknown directive v-custom",
      line: 10,
      column: 5,
    };
    const comment = generateFallbackComment(item);

    expect(comment).toContain("TODO: vue-to-tsx");
    expect(comment).toContain("Unknown directive v-custom");
    expect(comment).toContain('<div v-custom="data" />');
  });
});

describe("buildPrompt", () => {
  test("includes component name and all fallback items", () => {
    const fallbacks: FallbackItem[] = [
      { source: "<input v-focus />", reason: "Custom directive v-focus" },
      { source: '<div v-click-outside="handler" />', reason: "Custom directive v-click-outside" },
    ];
    const prompt = buildPrompt(fallbacks, "MyForm");

    expect(prompt).toContain("MyForm");
    expect(prompt).toContain("Vue TSX (NOT React)");
    expect(prompt).toContain("<input v-focus />");
    expect(prompt).toContain("Custom directive v-focus");
    expect(prompt).toContain('<div v-click-outside="handler" />');
    expect(prompt).toContain("[1]");
    expect(prompt).toContain("[2]");
  });

  test("includes Vue source and generated TSX when provided", () => {
    const fallbacks: FallbackItem[] = [
      { source: "<input v-focus />", reason: "Custom directive v-focus" },
    ];
    const sourceVue = '<template><input v-focus /></template>\n<script setup lang="ts"></script>';
    const generatedTsx = 'export default defineComponent({ setup() { return () => <input />; } })';
    const prompt = buildPrompt(fallbacks, "MyForm", sourceVue, generatedTsx);

    expect(prompt).toContain("## Original Vue SFC");
    expect(prompt).toContain(sourceVue);
    expect(prompt).toContain("## Generated TSX (so far)");
    expect(prompt).toContain(generatedTsx);
  });

  test("omits context sections when not provided", () => {
    const fallbacks: FallbackItem[] = [
      { source: "<input v-focus />", reason: "Custom directive v-focus" },
    ];
    const prompt = buildPrompt(fallbacks, "MyForm");

    expect(prompt).not.toContain("## Original Vue SFC");
    expect(prompt).not.toContain("## Generated TSX");
  });
});

describe("validateReplacement", () => {
  test("accepts valid JSX", () => {
    expect(validateReplacement("<div className={styles.foo} />")).toBe(true);
    expect(validateReplacement("<input ref={focusRef} />")).toBe(true);
    expect(validateReplacement("{bar.value}")).toBe(true);
  });

  test("rejects empty or whitespace-only strings", () => {
    expect(validateReplacement("")).toBe(false);
    expect(validateReplacement("   ")).toBe(false);
  });

  test("rejects Vue template syntax", () => {
    expect(validateReplacement('<div v-if="show">hello</div>')).toBe(false);
    expect(validateReplacement('<div v-for="item in items" />')).toBe(false);
    expect(validateReplacement('<input v-model="name" />')).toBe(false);
    expect(validateReplacement('<div v-show="visible" />')).toBe(false);
    expect(validateReplacement('<button @click="handler">ok</button>')).toBe(false);
    expect(validateReplacement('<div v-html="content" />')).toBe(false);
    expect(validateReplacement('<slot v-slot:header />')).toBe(false);
  });
});

describe("detectProvider", () => {
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    // Restore original env
    for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "VUE_TO_TSX_LLM_PROVIDER"]) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  function saveAndClearEnv() {
    for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "VUE_TO_TSX_LLM_PROVIDER"]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }

  test("returns null when no API key is set", () => {
    saveAndClearEnv();
    expect(detectProvider()).toBeNull();
  });

  test("detects Anthropic when only ANTHROPIC_API_KEY is set", () => {
    saveAndClearEnv();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(detectProvider()).toBe("anthropic");
  });

  test("detects OpenAI when only OPENAI_API_KEY is set", () => {
    saveAndClearEnv();
    process.env.OPENAI_API_KEY = "sk-test";
    expect(detectProvider()).toBe("openai");
  });

  test("prefers Anthropic when both API keys are set", () => {
    saveAndClearEnv();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(detectProvider()).toBe("anthropic");
  });

  test("respects explicit VUE_TO_TSX_LLM_PROVIDER override", () => {
    saveAndClearEnv();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.VUE_TO_TSX_LLM_PROVIDER = "openai";
    expect(detectProvider()).toBe("openai");
  });
});

describe("resolveFallbacks", () => {
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "VUE_TO_TSX_LLM_PROVIDER"]) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  function saveAndClearEnv() {
    for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "VUE_TO_TSX_LLM_PROVIDER"]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }

  test("returns empty map for empty fallbacks array", async () => {
    const result = await resolveFallbacks([], "MyComponent");
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test("returns empty map and warns when no API key is set", async () => {
    saveAndClearEnv();

    const warnSpy = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnSpy;

    const fallbacks: FallbackItem[] = [{ source: "<input v-focus />", reason: "Custom directive" }];
    const result = await resolveFallbacks(fallbacks, "MyComponent");

    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      "vue-to-tsx: No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable LLM fallback.",
    );

    console.warn = originalWarn;
  });
});
