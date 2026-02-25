import type { DirectiveNode, JsxContext } from "../types";
import { rewriteTemplateGlobals } from "./utils";

/**
 * Convert a Vue event name to a JSX prop name.
 * e.g. "click" -> "onClick", "update:modelValue" -> "onUpdate:modelValue"
 */
function toJsxEventName(eventName: string, capture: boolean): string {
  // Handle colon-separated names like "update:modelValue"
  const colonIdx = eventName.indexOf(":");
  let base: string;
  let suffix = "";
  if (colonIdx >= 0) {
    base = eventName.slice(0, colonIdx);
    suffix = eventName.slice(colonIdx); // includes the colon
  } else {
    base = eventName;
  }

  const capitalized = base.charAt(0).toUpperCase() + base.slice(1);
  const captureSuffix = capture ? "Capture" : "";
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

/**
 * Check if an expression is already a function (arrow function or function expression).
 * These should not be wrapped in another arrow function.
 */
function isFunctionExpression(expr: string): boolean {
  const trimmed = expr.trim();
  // function expression: function(...) { ... }
  if (trimmed.startsWith("function")) return true;
  // Arrow function with parens: (...) => ...
  if (trimmed.startsWith("(") && trimmed.includes("=>")) return true;
  // Arrow function without parens: identifier => ...
  if (/^[\w$]+\s*=>/.test(trimmed)) return true;
  return false;
}

/**
 * Check if an expression contains multiple statements (has semicolons outside strings).
 * Multi-statement expressions need to be wrapped in a block body `{ ... }`.
 */
function isMultiStatement(expr: string): boolean {
  // Quick check — if no semicolons, definitely not multi-statement
  if (!expr.includes(";")) return false;
  // Check for semicolons outside of string literals
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "\\" && (inSingle || inDouble || inTemplate)) {
      i++;
      continue;
    }
    if (!inSingle && !inDouble && !inTemplate) {
      if (ch === "'") inSingle = true;
      else if (ch === '"') inDouble = true;
      else if (ch === "`") inTemplate = true;
      else if (ch === ";") return true;
    } else if (inSingle && ch === "'") inSingle = false;
    else if (inDouble && ch === '"') inDouble = false;
    else if (inTemplate && ch === "`") inTemplate = false;
  }
  return false;
}

/** Wrap an expression in a block body if it contains multiple statements */
function wrapInBlock(expr: string): string {
  if (!isMultiStatement(expr)) return expr;
  const trimmed = expr.trim().replace(/;$/, "");
  return `{ ${trimmed}; }`;
}

/** Modifiers that are handled by the Vue JSX runtime natively (not withModifiers) */
const NATIVE_MODIFIERS = new Set(["capture", "once", "passive"]);

/**
 * Process an event directive (@click, v-on:click, etc.) into a JSX prop.
 *
 * @returns The JSX attribute name and value expression.
 */
export function processEvent(dir: DirectiveNode, ctx: JsxContext): { name: string; value: string } {
  const eventName = dir.arg ? (dir.arg as any).content : "";
  const rawHandler = dir.exp ? (dir.exp as any).content : "";
  const handler = rawHandler ? rewriteTemplateGlobals(rawHandler, ctx) : "";
  // Modifiers in the raw AST are SimpleExpressionNode objects with .content
  const modifiers = dir.modifiers.map((m: any) => (typeof m === "string" ? m : m.content));

  // Separate native modifiers from withModifiers modifiers
  const hasCapture = modifiers.includes("capture");
  const runtimeModifiers = modifiers.filter((m: string) => !NATIVE_MODIFIERS.has(m));

  const jsxName = toJsxEventName(eventName, hasCapture);

  // No handler expression
  if (!handler) {
    return { name: jsxName, value: "() => {}" };
  }

  // Determine the base handler value
  let value: string;
  if (isSimpleHandler(handler) || isFunctionExpression(handler)) {
    value = handler;
  } else {
    // Inline expression needs arrow wrapper
    value = `() => ${wrapInBlock(handler)}`;
  }

  // Apply withModifiers if there are non-native modifiers
  if (runtimeModifiers.length > 0) {
    const modList = runtimeModifiers.map((m) => `'${m}'`).join(", ");
    if (isSimpleHandler(handler) || isFunctionExpression(handler)) {
      value = `withModifiers(${value}, [${modList}])`;
    } else {
      value = `withModifiers(() => ${wrapInBlock(handler)}, [${modList}])`;
    }
  }

  return { name: jsxName, value };
}
