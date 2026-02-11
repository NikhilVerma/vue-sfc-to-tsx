import type { StyleBlock, StyleResult, ClassMap } from "../types";

/**
 * Process Vue-specific CSS pseudo-selectors into standard CSS.
 * Removes Vue-specific scoping pseudo-selectors.
 */
function processVuePseudoSelectors(css: string): string {
  let result = css;

  // :deep(selector) → selector
  result = result.replace(/:deep\(([^)]+)\)/g, "$1");

  // ::v-deep selector (space-separated form)
  result = result.replace(/::v-deep\s+/g, "");

  // :slotted(selector) → selector
  result = result.replace(/:slotted\(([^)]+)\)/g, "$1");

  // ::v-slotted(selector) → selector
  result = result.replace(/::v-slotted\(([^)]+)\)/g, "$1");

  // :global(selector) → selector
  result = result.replace(/:global\(([^)]+)\)/g, "$1");

  return result;
}

/**
 * Extract and process styles from Vue SFC style blocks.
 * Returns null if there are no style blocks at all.
 * Outputs plain CSS/SCSS files (no CSS modules).
 * SCSS/Less content is kept as-is — the bundler (Vite) handles compilation.
 */
export function extractStyles(styles: StyleBlock[], _componentName: string): StyleResult | null {
  if (styles.length === 0) return null;

  const warnings: string[] = [];

  // Detect if any blocks are scoped
  const hasScoped = styles.some((s) => s.scoped);
  if (hasScoped) {
    warnings.push(
      "Scoped styles detected. The output uses plain CSS (no scoping). " +
        "Review class usage to ensure styles are applied correctly — LLM review recommended.",
    );
  }

  // Detect preprocessor lang (use first non-undefined lang found)
  const lang = styles.find((s) => s.lang)?.lang;

  // Combine all style content (both scoped and non-scoped)
  const rawCss = styles.map((s) => s.content.trim()).join("\n\n");

  // Process Vue pseudo-selectors (works on any CSS-like syntax)
  const css = processVuePseudoSelectors(rawCss);

  // No CSS modules — classMap is always empty
  const classMap: ClassMap = new Map();

  return { css, classMap, lang, warnings };
}

/**
 * Get the style filename for a component.
 * Respects the preprocessor lang (scss → .scss, less → .less).
 */
export function getStyleFilename(componentName: string, lang?: string): string {
  const ext = lang ?? "css";
  return `${componentName}.${ext}`;
}
