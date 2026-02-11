import type { TemplateChildNode, ElementNode, DirectiveNode, JsxContext } from "../types";
import { rewriteTemplateGlobals } from "./utils";

// NodeTypes from @vue/compiler-core
const ELEMENT = 1;
const TEXT = 2;
const DIRECTIVE = 7;

/**
 * Check if an element node has a directive with the given name.
 */
function findDirective(node: ElementNode, name: string): DirectiveNode | undefined {
  return node.props.find((p): p is DirectiveNode => p.type === DIRECTIVE && p.name === name);
}

/**
 * Check if a TemplateChildNode is a whitespace-only text node.
 */
function isWhitespaceText(node: TemplateChildNode): boolean {
  return node.type === TEXT && "content" in node && (node as any).content.trim() === "";
}

/**
 * Process a conditional chain starting from a v-if element.
 * Scans siblings forward to collect v-else-if and v-else branches.
 *
 * Returns the JSX ternary expression and the number of sibling nodes consumed
 * (including whitespace text nodes between branches).
 */
export function processConditionalChain(
  siblings: TemplateChildNode[],
  startIndex: number,
  ctx: JsxContext,
  renderElement: (node: ElementNode, ctx: JsxContext) => string,
): { jsx: string; consumed: number } {
  const branches: { condition: string | null; node: ElementNode }[] = [];
  let consumed = 1; // the v-if node itself

  const ifNode = siblings[startIndex] as ElementNode;
  const ifDir = findDirective(ifNode, "if")!;
  branches.push({
    condition: ifDir.exp ? rewriteTemplateGlobals((ifDir.exp as any).content, ctx) : "true",
    node: ifNode,
  });

  // Scan forward for v-else-if / v-else
  let i = startIndex + 1;
  while (i < siblings.length) {
    const sibling = siblings[i];

    // Skip whitespace-only text nodes
    if (isWhitespaceText(sibling)) {
      i++;
      consumed++;
      continue;
    }

    // Must be an element node
    if (sibling.type !== ELEMENT) break;

    const elseIfDir = findDirective(sibling as ElementNode, "else-if");
    const elseDir = findDirective(sibling as ElementNode, "else");

    if (elseIfDir) {
      branches.push({
        condition: elseIfDir.exp
          ? rewriteTemplateGlobals((elseIfDir.exp as any).content, ctx)
          : "true",
        node: sibling as ElementNode,
      });
      consumed++;
      i++;
      continue;
    }

    if (elseDir) {
      branches.push({
        condition: null, // v-else has no condition
        node: sibling as ElementNode,
      });
      consumed++;
      i++;
      break;
    }

    // Not a conditional sibling, stop
    break;
  }

  // Build ternary chain
  const jsx = buildTernary(branches, ctx, renderElement);
  return { jsx: `{${jsx}}`, consumed };
}

function buildTernary(
  branches: { condition: string | null; node: ElementNode }[],
  ctx: JsxContext,
  renderElement: (node: ElementNode, ctx: JsxContext) => string,
): string {
  if (branches.length === 1) {
    // Only v-if, no else
    const b = branches[0];
    return `${b.condition} ? ${renderElement(b.node, ctx)} : null`;
  }

  const parts: string[] = [];
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    if (b.condition === null) {
      // v-else (final branch)
      parts.push(renderElement(b.node, ctx));
    } else if (i === branches.length - 1) {
      // Last branch with condition, no v-else
      parts.push(`${b.condition} ? ${renderElement(b.node, ctx)} : null`);
    } else {
      parts.push(`${b.condition} ? ${renderElement(b.node, ctx)}`);
    }
  }

  return parts.join(" : ");
}

/**
 * Parse a v-for expression like "item in items" or "(item, index) in items".
 */
function parseVForExpression(expr: string): { iterator: string; iterable: string } {
  // Match "X in Y" or "X of Y"
  const match = expr.match(/^\s*(.+?)\s+(?:in|of)\s+(.+?)\s*$/);
  if (!match) {
    return { iterator: "_item", iterable: expr };
  }
  return { iterator: match[1], iterable: match[2] };
}

/**
 * Process a v-for directive on an element.
 * Generates: `{items.map((item, index) => (<Element key={...} />))}`
 *
 * If v-if is also present on the same element, the v-if wraps the map body:
 * `{items.map((item) => (show ? <Element /> : null))}`
 */
export function processVFor(
  node: ElementNode,
  ctx: JsxContext,
  renderElement: (node: ElementNode, ctx: JsxContext) => string,
): string {
  const forDir = findDirective(node, "for")!;
  const expr = forDir.exp ? rewriteTemplateGlobals((forDir.exp as any).content, ctx) : "";
  const { iterator, iterable } = parseVForExpression(expr);

  // Check for :key binding
  const keyDir = node.props.find(
    (p): p is DirectiveNode =>
      p.type === DIRECTIVE &&
      p.name === "bind" &&
      p.arg != null &&
      (p.arg as any).content === "key",
  );
  const _keyExpr = keyDir?.exp ? (keyDir.exp as any).content : null;

  // Check for v-if on same element
  const ifDir = findDirective(node, "if");

  const rendered = renderElement(node, ctx);

  let body: string;
  if (ifDir) {
    const condition = ifDir.exp ? rewriteTemplateGlobals((ifDir.exp as any).content, ctx) : "true";
    body = `${condition} ? ${rendered} : null`;
  } else {
    body = rendered;
  }

  const arrowParams = iterator.startsWith("(") ? iterator : `(${iterator})`;

  // Mark that v-for was used so the _renderList helper gets emitted
  ctx.hasVFor = true;

  return `{_renderList(${iterable}, ${arrowParams} => (${body}))}`;
}

export { findDirective, isWhitespaceText };
