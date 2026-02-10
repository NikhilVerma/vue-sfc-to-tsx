import type { ElementNode, AttributeNode, DirectiveNode } from '../types';
import type { JsxContext } from '../types';
import { toCamelCase, toJsxEventName, unwrapExpression } from './utils';

export interface AttributeResult {
  /** Array of JSX attribute strings (e.g. ['class="foo"', 'onClick={handler}']) */
  attrs: string[];
  /** Array of spread expressions (e.g. ['{...obj}']) */
  spreads: string[];
}

/**
 * Generate JSX attributes from an ElementNode's props.
 * Handles static attributes, v-bind (:), v-on (@), and ref.
 * Skips control-flow directives (v-if, v-for, v-show, v-slot, etc.)
 */
export function generateAttributes(node: ElementNode, ctx: JsxContext): AttributeResult {
  const attrs: string[] = [];
  const spreads: string[] = [];

  for (const prop of node.props) {
    if (prop.type === 6) {
      // AttributeNode (static)
      const attr = generateStaticAttribute(prop as AttributeNode, ctx);
      if (attr) attrs.push(attr);
    } else if (prop.type === 7) {
      // DirectiveNode
      const directive = prop as DirectiveNode;
      const result = generateDirectiveAttribute(directive, ctx);
      if (result) {
        if (result.type === 'spread') {
          spreads.push(result.value);
        } else {
          attrs.push(result.value);
        }
      }
    }
  }

  return { attrs, spreads };
}

function generateStaticAttribute(prop: AttributeNode, ctx: JsxContext): string | null {
  const name = prop.name;
  const value = prop.value?.content;

  // ref="x" → ref={x}
  if (name === 'ref') {
    return value != null ? `ref={${value}}` : 'ref={undefined}';
  }

  // class attribute with classMap rewriting
  if (name === 'class' && value != null && ctx.classMap.size > 0) {
    return generateStaticClassAttribute(value, ctx);
  }

  // Boolean attribute (no value)
  if (value == null) {
    return name;
  }

  return `${name}="${value}"`;
}

function generateStaticClassAttribute(value: string, ctx: JsxContext): string {
  const classes = value.split(/\s+/).filter(Boolean);
  const mapped = classes.map((cls) => {
    const mapped = ctx.classMap.get(cls);
    return mapped ?? `"${cls}"`;
  });

  if (mapped.length === 1) {
    // If the single class is a module ref (no quotes), use {expr}
    const single = mapped[0];
    if (single.startsWith('"')) {
      return `class=${single}`;
    }
    return `class={${single}}`;
  }

  // Multiple classes: template literal or array join
  const parts = mapped.map((m) => (m.startsWith('"') ? m.slice(1, -1) : `\${${m}}`));
  return `class={\`${parts.join(' ')}\`}`;
}

/** Directives we should skip (handled by other modules) */
const CONTROL_FLOW_DIRECTIVES = new Set([
  'if',
  'else-if',
  'else',
  'for',
  'show',
  'slot',
  'model',
  'html',
  'text',
  'pre',
  'cloak',
  'once',
  'memo',
]);

function generateDirectiveAttribute(
  directive: DirectiveNode,
  ctx: JsxContext,
): { type: 'attr' | 'spread'; value: string } | null {
  const { name, arg, exp } = directive;

  // Skip control-flow and other directives handled elsewhere
  if (CONTROL_FLOW_DIRECTIVES.has(name)) {
    return null;
  }

  if (name === 'bind') {
    return generateBindDirective(directive, ctx);
  }

  if (name === 'on') {
    return generateOnDirective(directive, ctx);
  }

  // Unknown directive — skip with no warning for now
  return null;
}

function generateBindDirective(
  directive: DirectiveNode,
  ctx: JsxContext,
): { type: 'attr' | 'spread'; value: string } | null {
  const { arg, exp, modifiers } = directive;
  const expr = unwrapExpression(exp);

  // v-bind="obj" (no arg) → spread
  if (!arg) {
    return expr ? { type: 'spread', value: `{...${expr}}` } : null;
  }

  const propName = unwrapExpression(arg as any);
  if (!propName) return null;

  // :class handling
  if (propName === 'class') {
    return { type: 'attr', value: generateDynamicClass(expr, ctx) };
  }

  // :style handling
  if (propName === 'style') {
    return { type: 'attr', value: `style={${expr}}` };
  }

  // :ref
  if (propName === 'ref') {
    return { type: 'attr', value: `ref={${expr}}` };
  }

  // :key
  if (propName === 'key') {
    return { type: 'attr', value: `key={${expr}}` };
  }

  // .prop modifier → use the prop name directly
  // .camel modifier → camelCase
  let finalName = propName;
  if (modifiers.includes('camel')) {
    finalName = toCamelCase(finalName);
  }

  return { type: 'attr', value: `${finalName}={${expr}}` };
}

function generateDynamicClass(expr: string, ctx: JsxContext): string {
  if (ctx.classMap.size === 0) {
    return `class={${expr}}`;
  }

  // Try to detect object literal pattern like { active: isActive, 'text-danger': hasError }
  const trimmed = expr.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    // Rewrite keys that exist in classMap
    const inner = trimmed.slice(1, -1).trim();
    const entries = splitObjectEntries(inner);
    const rewritten = entries.map((entry) => {
      const colonIdx = entry.indexOf(':');
      if (colonIdx === -1) return entry;
      let key = entry.slice(0, colonIdx).trim();
      const val = entry.slice(colonIdx + 1).trim();

      // Remove quotes from key if present
      const unquotedKey = key.replace(/^['"]|['"]$/g, '');
      const mapped = ctx.classMap.get(unquotedKey);
      if (mapped) {
        return `[${mapped}]: ${val}`;
      }
      return entry;
    });
    return `class={{${rewritten.join(', ')}}}`;
  }

  // Array or other expression — pass through
  return `class={${expr}}`;
}

/** Split top-level entries of an object literal (respecting nested braces/parens) */
function splitObjectEntries(str: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of str) {
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;

    if (ch === ',' && depth === 0) {
      entries.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) entries.push(current.trim());
  return entries;
}

function generateOnDirective(
  directive: DirectiveNode,
  ctx: JsxContext,
): { type: 'attr'; value: string } | null {
  const { arg, exp, modifiers } = directive;
  const expr = unwrapExpression(exp);
  const eventName = arg ? unwrapExpression(arg as any) : '';

  if (!eventName) return null;

  const jsxName = toJsxEventName(eventName);

  if (!expr) {
    // @click with no handler — unlikely but handle gracefully
    return { type: 'attr', value: `${jsxName}={() => {}}` };
  }

  // Simple identifier or member expression: onClick={handler}
  // Inline expression (contains parentheses, operators, etc.): onClick={() => expr}
  if (isSimpleExpression(expr)) {
    return { type: 'attr', value: `${jsxName}={${expr}}` };
  }

  // If it looks like a function call: @click="doSomething($event)"
  return { type: 'attr', value: `${jsxName}={($event) => ${expr}}` };
}

/** Check if an expression is a simple identifier or member access (no function call or complex expression) */
function isSimpleExpression(expr: string): boolean {
  return /^[a-zA-Z_$][\w$.]*$/.test(expr);
}

/**
 * Format attributes and spreads into a string suitable for a JSX opening tag.
 * Returns empty string if no attributes.
 */
export function formatAttributes(result: AttributeResult): string {
  const all = [...result.attrs, ...result.spreads];
  if (all.length === 0) return '';
  return ' ' + all.join(' ');
}
