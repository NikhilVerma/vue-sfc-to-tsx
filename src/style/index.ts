import type { StyleBlock, StyleResult, ClassMap } from '../types';

/**
 * Process Vue-specific CSS pseudo-selectors into standard CSS.
 * Removes scoping pseudo-selectors since CSS modules handle scoping.
 */
function processVuePseudoSelectors(css: string): string {
  let result = css;

  // :deep(selector) → selector
  result = result.replace(/:deep\(([^)]+)\)/g, '$1');

  // ::v-deep selector (space-separated form)
  result = result.replace(/::v-deep\s+/g, '');

  // :slotted(selector) → selector
  result = result.replace(/:slotted\(([^)]+)\)/g, '$1');

  // ::v-slotted(selector) → selector
  result = result.replace(/::v-slotted\(([^)]+)\)/g, '$1');

  // :global(selector) → selector
  result = result.replace(/:global\(([^)]+)\)/g, '$1');

  return result;
}

/**
 * Scan CSS content for class selectors and build a map
 * from class name to CSS module access expression.
 */
function buildClassMap(css: string): ClassMap {
  const classMap: ClassMap = new Map();

  // Match class selectors: .className (word chars and hyphens)
  const classRegex = /\.([a-zA-Z_][\w-]*)/g;
  let match: RegExpExecArray | null;

  while ((match = classRegex.exec(css)) !== null) {
    const className = match[1];
    if (classMap.has(className)) continue;

    // Use bracket notation for hyphenated names, dot notation for simple
    if (className.includes('-')) {
      classMap.set(className, `styles["${className}"]`);
    } else {
      classMap.set(className, `styles.${className}`);
    }
  }

  return classMap;
}

/**
 * Extract and process styles from Vue SFC style blocks.
 * Returns null if there are no scoped styles.
 */
export function extractStyles(
  styles: StyleBlock[],
  _componentName: string,
): StyleResult | null {
  const scopedBlocks = styles.filter((s) => s.scoped);

  if (scopedBlocks.length === 0) return null;

  // Combine all scoped style content
  const rawCss = scopedBlocks.map((s) => s.content.trim()).join('\n\n');

  // Process Vue pseudo-selectors
  const css = processVuePseudoSelectors(rawCss);

  // Build class map from processed CSS
  const classMap = buildClassMap(css);

  return { css, classMap };
}

/**
 * Get the CSS module filename for a component.
 */
export function getStyleFilename(componentName: string): string {
  return `${componentName}.module.css`;
}
