import { describe, expect, test, mock, afterEach } from 'bun:test';
import {
  generateFallbackComment,
  resolveFallbacks,
  buildPrompt,
  detectProvider,
} from '../../src/llm/index';
import type { FallbackItem } from '../../src/types';

describe('generateFallbackComment', () => {
  test('generates correct TODO comment format', () => {
    const item: FallbackItem = {
      source: '<input v-focus />',
      reason: 'Custom directive v-focus cannot be auto-converted',
    };
    const comment = generateFallbackComment(item);

    expect(comment).toBe(
      '{/* TODO: vuetsx - Custom directive v-focus cannot be auto-converted */}\n{/* Original: <input v-focus /> */}',
    );
  });

  test('includes line info in reason if present', () => {
    const item: FallbackItem = {
      source: '<div v-custom="data" />',
      reason: 'Unknown directive v-custom',
      line: 10,
      column: 5,
    };
    const comment = generateFallbackComment(item);

    expect(comment).toContain('TODO: vuetsx');
    expect(comment).toContain('Unknown directive v-custom');
    expect(comment).toContain('<div v-custom="data" />');
  });
});

describe('buildPrompt', () => {
  test('includes component name and all fallback items', () => {
    const fallbacks: FallbackItem[] = [
      { source: '<input v-focus />', reason: 'Custom directive v-focus' },
      { source: '<div v-click-outside="handler" />', reason: 'Custom directive v-click-outside' },
    ];
    const prompt = buildPrompt(fallbacks, 'MyForm');

    expect(prompt).toContain('MyForm');
    expect(prompt).toContain('Vue TSX (NOT React)');
    expect(prompt).toContain('<input v-focus />');
    expect(prompt).toContain('Custom directive v-focus');
    expect(prompt).toContain('<div v-click-outside="handler" />');
    expect(prompt).toContain('[1]');
    expect(prompt).toContain('[2]');
  });
});

describe('detectProvider', () => {
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    // Restore original env
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'VUE_TO_TSX_LLM_PROVIDER']) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  function saveAndClearEnv() {
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'VUE_TO_TSX_LLM_PROVIDER']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }

  test('returns null when no API key is set', () => {
    saveAndClearEnv();
    expect(detectProvider()).toBeNull();
  });

  test('detects Anthropic when only ANTHROPIC_API_KEY is set', () => {
    saveAndClearEnv();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(detectProvider()).toBe('anthropic');
  });

  test('detects OpenAI when only OPENAI_API_KEY is set', () => {
    saveAndClearEnv();
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectProvider()).toBe('openai');
  });

  test('prefers Anthropic when both API keys are set', () => {
    saveAndClearEnv();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(detectProvider()).toBe('anthropic');
  });

  test('respects explicit VUE_TO_TSX_LLM_PROVIDER override', () => {
    saveAndClearEnv();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.VUE_TO_TSX_LLM_PROVIDER = 'openai';
    expect(detectProvider()).toBe('openai');
  });
});

describe('resolveFallbacks', () => {
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'VUE_TO_TSX_LLM_PROVIDER']) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  function saveAndClearEnv() {
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'VUE_TO_TSX_LLM_PROVIDER']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }

  test('returns empty map for empty fallbacks array', async () => {
    const result = await resolveFallbacks([], 'MyComponent');
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test('returns empty map and warns when no API key is set', async () => {
    saveAndClearEnv();

    const warnSpy = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnSpy;

    const fallbacks: FallbackItem[] = [
      { source: '<input v-focus />', reason: 'Custom directive' },
    ];
    const result = await resolveFallbacks(fallbacks, 'MyComponent');

    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      'vuetsx: No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable LLM fallback.',
    );

    console.warn = originalWarn;
  });
});
