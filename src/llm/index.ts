import type { FallbackItem } from '../types';

/**
 * Generate a TODO comment for a fallback item.
 */
export function generateFallbackComment(item: FallbackItem): string {
  return `{/* TODO: vue-to-tsx - ${item.reason} */}\n{/* Original: ${item.source} */}`;
}

/**
 * Resolve fallback items using LLM.
 * Batches all items into a single prompt and returns a map of source → JSX replacement.
 * Returns empty map if no API key is set or no fallbacks provided.
 */
export async function resolveFallbacks(
  fallbacks: FallbackItem[],
  componentName: string,
  options?: { model?: string },
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  if (fallbacks.length === 0) return result;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      'vue-to-tsx: ANTHROPIC_API_KEY not set, skipping LLM fallback resolution',
    );
    return result;
  }

  const model = options?.model ?? 'claude-sonnet-4-5';

  const { generateText } = await import('ai');
  const { anthropic } = await import('@ai-sdk/anthropic');

  const prompt = buildPrompt(fallbacks, componentName);

  try {
    const { text } = await generateText({
      model: anthropic(model),
      prompt,
    });

    return parseResponse(text, fallbacks);
  } catch (error) {
    console.warn('vue-to-tsx: LLM fallback resolution failed:', error);
    return result;
  }
}

/**
 * Build the prompt for the LLM with all fallback items.
 */
export function buildPrompt(
  fallbacks: FallbackItem[],
  componentName: string,
): string {
  const items = fallbacks
    .map(
      (f, i) =>
        `[${i + 1}] Reason: ${f.reason}\n    Source: ${f.source}`,
    )
    .join('\n\n');

  return `You are converting Vue Single File Components to Vue TSX (NOT React).
Keep Vue's reactive model (ref, computed, etc.). The component is "${componentName}".

Convert each of these Vue template snippets to valid Vue JSX syntax.
Return ONLY a JSON array where each element is the JSX string replacement for the corresponding item.

${items}

Respond with a JSON array of strings, one per item. Example: ["<div className={styles.foo} />", "<span>{bar.value}</span>"]`;
}

/**
 * Parse the LLM response text into a map of source → JSX.
 */
function parseResponse(
  text: string,
  fallbacks: FallbackItem[],
): Map<string, string> {
  const result = new Map<string, string>();

  try {
    // Extract JSON array from response (may have surrounding text)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return result;

    const replacements: string[] = JSON.parse(jsonMatch[0]);

    for (let i = 0; i < Math.min(replacements.length, fallbacks.length); i++) {
      if (typeof replacements[i] === 'string' && replacements[i].trim()) {
        result.set(fallbacks[i].source, replacements[i]);
      }
    }
  } catch {
    // If parsing fails, return empty map
  }

  return result;
}
