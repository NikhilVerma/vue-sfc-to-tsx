import type { DirectiveNode, JsxContext } from '../types';

/**
 * Convert a Vue event name to a JSX prop name.
 * e.g. "click" -> "onClick", "update:modelValue" -> "onUpdate:modelValue"
 */
function toJsxEventName(eventName: string, capture: boolean): string {
  // Handle colon-separated names like "update:modelValue"
  const colonIdx = eventName.indexOf(':');
  let base: string;
  let suffix = '';
  if (colonIdx >= 0) {
    base = eventName.slice(0, colonIdx);
    suffix = eventName.slice(colonIdx); // includes the colon
  } else {
    base = eventName;
  }

  const capitalized = base.charAt(0).toUpperCase() + base.slice(1);
  const captureSuffix = capture ? 'Capture' : '';
  return `on${capitalized}${suffix}${captureSuffix}`;
}

/**
 * Check if an expression is a simple identifier or member access (a.b.c).
 * These don't need to be wrapped in an arrow function.
 */
function isSimpleHandler(expr: string): boolean {
  // Match: identifier, member access (a.b), optional chaining (a?.b)
  return /^[\w$][\w$]*(?:[.?][\w$]+)*$/.test(expr.trim());
}

/** Modifiers that are handled by the Vue JSX runtime natively (not withModifiers) */
const NATIVE_MODIFIERS = new Set(['capture', 'once', 'passive']);

/**
 * Process an event directive (@click, v-on:click, etc.) into a JSX prop.
 *
 * @returns The JSX attribute name and value expression.
 */
export function processEvent(
  dir: DirectiveNode,
  ctx: JsxContext,
): { name: string; value: string } {
  const eventName = dir.arg ? (dir.arg as any).content : '';
  const handler = dir.exp ? (dir.exp as any).content : '';
  // Modifiers in the raw AST are SimpleExpressionNode objects with .content
  const modifiers = dir.modifiers.map((m: any) =>
    typeof m === 'string' ? m : m.content,
  );

  // Separate native modifiers from withModifiers modifiers
  const hasCapture = modifiers.includes('capture');
  const runtimeModifiers = modifiers.filter((m: string) => !NATIVE_MODIFIERS.has(m));

  const jsxName = toJsxEventName(eventName, hasCapture);

  // No handler expression
  if (!handler) {
    return { name: jsxName, value: '() => {}' };
  }

  // Determine the base handler value
  let value: string;
  if (isSimpleHandler(handler)) {
    value = handler;
  } else {
    // Inline expression needs arrow wrapper
    value = `() => ${handler}`;
  }

  // Apply withModifiers if there are non-native modifiers
  if (runtimeModifiers.length > 0) {
    const modList = runtimeModifiers.map((m) => `'${m}'`).join(', ');
    // If value is already an arrow function, wrap it; if identifier, wrap it
    if (isSimpleHandler(handler)) {
      value = `withModifiers(${value}, [${modList}])`;
    } else {
      value = `withModifiers(() => ${handler}, [${modList}])`;
    }
  }

  return { name: jsxName, value };
}
