import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import {
  generateFallbackComment,
  resolveFallbacks,
  buildPrompt,
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
      '{/* TODO: vue-to-tsx - Custom directive v-focus cannot be auto-converted */}\n{/* Original: <input v-focus /> */}',
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

    expect(comment).toContain('TODO: vue-to-tsx');
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

describe('resolveFallbacks', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  test('returns empty map for empty fallbacks array', async () => {
    const result = await resolveFallbacks([], 'MyComponent');
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test('returns empty map and warns when no API key is set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const warnSpy = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnSpy;

    const fallbacks: FallbackItem[] = [
      { source: '<input v-focus />', reason: 'Custom directive' },
    ];
    const result = await resolveFallbacks(fallbacks, 'MyComponent');

    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      'vue-to-tsx: ANTHROPIC_API_KEY not set, skipping LLM fallback resolution',
    );

    console.warn = originalWarn;
  });
});
