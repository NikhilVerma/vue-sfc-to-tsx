import type { RootNode, ElementNode, JsxContext } from "../types";
import { walkChildren } from "./walker";
import { findDirective } from "./control-flow";

/**
 * Convert a template AST to JSX string.
 * Entry point for template-to-JSX conversion.
 *
 * - If multiple root elements, wraps in fragment `<>...</>`
 * - If single root element, returns as-is
 * - Trims excessive whitespace/newlines
 */
export function templateToJsx(ast: RootNode, ctx: JsxContext): string {
  const jsx = walkChildren(ast.children, ctx);
  const trimmed = jsx.trim();

  if (!trimmed) {
    return "<></>";
  }

  // Count root-level JSX elements to decide if fragment is needed
  const rootElements = countRootElements(ast);

  if (rootElements > 1) {
    return `<>${trimmed}</>`;
  }

  return trimmed;
}

/**
 * Count the number of meaningful root-level JSX outputs.
 * Accounts for v-if/v-else-if/v-else chains being consumed into a single ternary.
 */
function countRootElements(ast: RootNode): number {
  let count = 0;
  const children = ast.children;
  let i = 0;

  while (i < children.length) {
    const child = children[i];

    if (child.type === 1) {
      // ELEMENT — check for v-if chain that consumes siblings
      const el = child as ElementNode;
      if (findDirective(el, "if")) {
        // Count the entire conditional chain as one output
        count++;
        i++;
        // Skip consumed v-else-if / v-else siblings (and whitespace between them)
        while (i < children.length) {
          const sibling = children[i];
          if (sibling.type === 2 && !(sibling as any).content.trim()) {
            i++;
            continue;
          }
          if (sibling.type === 1) {
            const sibEl = sibling as ElementNode;
            if (findDirective(sibEl, "else-if") || findDirective(sibEl, "else")) {
              i++;
              if (findDirective(sibEl, "else")) break; // v-else ends the chain
              continue;
            }
          }
          break;
        }
      } else if (findDirective(el, "else-if") || findDirective(el, "else")) {
        // Stray v-else-if/v-else without v-if — skip (walker ignores these)
        i++;
      } else {
        count++;
        i++;
      }
    } else if (child.type === 5) {
      // INTERPOLATION
      count++;
      i++;
    } else if (child.type === 2) {
      // TEXT — only count if non-whitespace
      if ((child as any).content.trim()) {
        count++;
      }
      i++;
    } else if (child.type === 3) {
      // COMMENT
      count++;
      i++;
    } else {
      i++;
    }
  }

  return count;
}

// Re-export for convenience
export { walkChildren } from "./walker";
export { generateElement, generateChildren } from "./elements";
export { generateAttributes, formatAttributes } from "./attributes";
export { processSlot, processSlotContent, formatSlotEntries } from "./slots";
