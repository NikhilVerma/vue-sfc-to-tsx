import type { SimpleExpressionNode, CompoundExpressionNode, JsxContext } from '../types';

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

/** Extract expression string from a SimpleExpressionNode or CompoundExpressionNode.
 *  When ctx is provided, rewrites Vue template globals ($attrs, $slots, etc.). */
export function unwrapExpression(
  node: SimpleExpressionNode | CompoundExpressionNode | undefined,
  ctx?: JsxContext,
): string {
  if (!node) return '';
  let result: string;
  // SimpleExpressionNode (type 4) has content
  if (node.type === 4) {
    result = (node as SimpleExpressionNode).content;
  } else if (node.type === 8) {
    // CompoundExpressionNode (type 8) has children that are strings or expression nodes
    const compound = node as CompoundExpressionNode;
    result = compound.children
      .map((child) => {
        if (typeof child === 'string') return child;
        if (typeof child === 'symbol') return '';
        return unwrapExpression(child as SimpleExpressionNode | CompoundExpressionNode);
      })
      .join('');
  } else {
    result = '';
  }
  if (ctx && result) {
    result = rewriteTemplateGlobals(result, ctx);
  }
  return result;
}

/** Rewritable Vue template globals → Composition API equivalents */
const TEMPLATE_GLOBALS: Record<string, { replacement: string; contextMember: string }> = {
  '$attrs': { replacement: 'attrs', contextMember: 'attrs' },
  '$slots': { replacement: 'slots', contextMember: 'slots' },
  '$emit': { replacement: 'emit', contextMember: 'emit' },
  '$props': { replacement: 'props', contextMember: 'props' },
};

/** Framework globals that produce a warning instead of rewriting */
const WARN_GLOBALS = ['$t', '$route', '$router', '$i18n', '$refs'];

/**
 * Rewrite Vue template globals in an expression string.
 * Replaces $attrs → attrs, $slots → slots, $emit → emit, $props → props.
 * Adds warnings for framework-specific globals like $t, $route, etc.
 */
export function rewriteTemplateGlobals(expr: string, ctx: JsxContext): string {
  let result = expr;

  // Rewrite known globals using word-boundary-aware replacement
  for (const [global, { replacement, contextMember }] of Object.entries(TEMPLATE_GLOBALS)) {
    // Use regex to match the global as a standalone token (not inside another identifier)
    const escaped = global.replace('$', '\\$');
    const regex = new RegExp(escaped + '(?![a-zA-Z0-9_])', 'g');
    if (regex.test(result)) {
      result = result.replace(regex, replacement);
      // Don't add 'props' to context members since props is already a setup param
      if (contextMember !== 'props') {
        ctx.usedContextMembers.add(contextMember);
      }
    }
  }

  // Warn about framework globals
  for (const global of WARN_GLOBALS) {
    const escaped = global.replace('$', '\\$');
    const regex = new RegExp(escaped + '(?![a-zA-Z0-9_])', 'g');
    if (regex.test(expr)) {
      const alreadyWarned = ctx.warnings.some(w => w.message.includes(global));
      if (!alreadyWarned) {
        ctx.warnings.push({
          message: `Template global '${global}' detected. You may need to add the equivalent Composition API call to your setup function.`,
        });
      }
    }
  }

  // Append .value to ref/computed identifiers (Vue templates auto-unwrap, JSX doesn't)
  if (ctx.refIdentifiers.size > 0) {
    result = appendRefValue(result, ctx.refIdentifiers);
  }

  return result;
}

/**
 * Append `.value` to known ref identifiers in an expression.
 * Matches standalone identifiers not preceded by `.` and not already followed by `.value`.
 */
function appendRefValue(expr: string, refs: Set<string>): string {
  let result = expr;
  for (const name of refs) {
    // Match `name` as standalone identifier:
    // - NOT preceded by `.` or alphanumeric (avoid obj.name)
    // - NOT already followed by `.value`
    const regex = new RegExp(
      `(?<![.\\w])\\b${name}\\b(?!\\.value\\b)(?=\\s*[^(]|$)`,
      'g',
    );
    result = result.replace(regex, `${name}.value`);
  }
  return result;
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
