import type { SimpleExpressionNode, CompoundExpressionNode } from '../types';

/** Convert kebab-case to camelCase */
export function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** Convert kebab-case to PascalCase */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Convert a Vue event name to JSX event handler name (e.g. 'click' → 'onClick') */
export function toJsxEventName(event: string): string {
  const camel = toCamelCase(event);
  return 'on' + camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Extract expression string from a SimpleExpressionNode or CompoundExpressionNode */
export function unwrapExpression(
  node: SimpleExpressionNode | CompoundExpressionNode | undefined,
): string {
  if (!node) return '';
  // SimpleExpressionNode (type 4) has content
  if (node.type === 4) {
    return (node as SimpleExpressionNode).content;
  }
  // CompoundExpressionNode (type 8) has children that are strings or expression nodes
  if (node.type === 8) {
    const compound = node as CompoundExpressionNode;
    return compound.children
      .map((child) => {
        if (typeof child === 'string') return child;
        if (typeof child === 'symbol') return '';
        return unwrapExpression(child as SimpleExpressionNode | CompoundExpressionNode);
      })
      .join('');
  }
  return '';
}

/** Escape special characters for JSX text content */
export function escapeJsxText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;');
}

/** Add indentation to a string */
export function indent(str: string, level: number): string {
  const spaces = '  '.repeat(level);
  return str
    .split('\n')
    .map((line) => (line.trim() ? spaces + line : line))
    .join('\n');
}

/** Check if a tag name represents a Vue component (not a plain HTML element) */
export function isComponent(tag: string): boolean {
  // PascalCase (starts with uppercase)
  if (/^[A-Z]/.test(tag)) return true;
  // Contains dots (e.g. v-component.something — unlikely but possible)
  if (tag.includes('.')) return true;
  // Contains hyphens (custom elements / kebab-case components)
  if (tag.includes('-')) return true;
  return false;
}

/** HTML void / self-closing elements */
export const SELF_CLOSING_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
