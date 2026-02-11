import type { TemplateChildNode, ElementNode, DirectiveNode, JsxContext } from "../types";
import { escapeJsxText, unwrapExpression } from "./utils";
import { processConditionalChain, processVFor, findDirective } from "./control-flow";
import { processSlot, processSlotContent, formatSlotEntries } from "./slots";
import { generateAttributes, formatAttributes } from "./attributes";
import { processDirective } from "./directives";
import { SELF_CLOSING_TAGS } from "./utils";

/**
 * Walk an array of template child nodes and produce JSX string output.
 * This is the main recursive walker that orchestrates all template modules.
 */
export function walkChildren(children: TemplateChildNode[], ctx: JsxContext): string {
  const parts: string[] = [];
  let i = 0;

  while (i < children.length) {
    const child = children[i];

    switch (child.type) {
      case 2: {
        // TEXT
        const text = (child as any).content as string;
        if (text.trim()) {
          parts.push(escapeJsxText(text));
        } else if (!text.includes("\n")) {
          // Preserve inline whitespace
          parts.push(" ");
        }
        i++;
        break;
      }

      case 5: {
        // INTERPOLATION
        const expr = unwrapExpression((child as any).content, ctx);
        parts.push(`{${expr}}`);
        i++;
        break;
      }

      case 3: {
        // COMMENT
        parts.push(`{/* ${(child as any).content} */}`);
        i++;
        break;
      }

      case 1: {
        // ELEMENT
        const el = child as ElementNode;
        const result = processElementNode(el, children, i, ctx);
        parts.push(result.jsx);
        i += result.consumed;
        break;
      }

      default:
        i++;
        break;
    }
  }

  return parts.join("");
}

interface ElementResult {
  jsx: string;
  consumed: number;
}

/**
 * Process an element node, handling directives, slots, and control flow.
 */
function processElementNode(
  node: ElementNode,
  siblings: TemplateChildNode[],
  index: number,
  ctx: JsxContext,
): ElementResult {
  // 1. Handle <slot> elements
  if (node.tag === "slot") {
    const jsx = processSlot(node, ctx, renderChildrenForSlot);
    return { jsx, consumed: 1 };
  }

  // 2. Check for v-for (wraps everything, takes priority)
  const vFor = findDirective(node, "for");
  if (vFor) {
    const jsx = processVFor(node, ctx, renderFullElement);
    return { jsx, consumed: 1 };
  }

  // 3. Check for v-if → process conditional chain across siblings
  const vIf = findDirective(node, "if");
  if (vIf) {
    const result = processConditionalChain(siblings, index, ctx, renderFullElement);
    return result;
  }

  // 4. Regular element rendering
  const jsx = renderFullElement(node, ctx);
  return { jsx, consumed: 1 };
}

/**
 * Render a full element with all directives, events, and slot content processing.
 * This is the "enhanced" version of generateElement that integrates all modules.
 */
function renderFullElement(node: ElementNode, ctx: JsxContext): string {
  const tag = node.tag;

  // <template> without control flow → fragment
  if (tag === "template") {
    const hasControlFlow = node.props.some(
      (p) =>
        p.type === 7 &&
        (p.name === "if" || p.name === "else-if" || p.name === "else" || p.name === "for"),
    );
    if (!hasControlFlow) {
      const children = walkChildren(node.children, ctx);
      if (!children.trim()) return "<></>";
      return `<>${children}</>`;
    }
    // Template with control flow — render children as fragment
    const children = walkChildren(node.children, ctx);
    if (!children.trim()) return "<></>";
    return `<>${children}</>`;
  }

  // <component :is="expr">
  if (tag === "component") {
    return renderDynamicComponent(node, ctx);
  }

  // Process attributes, directives, and events
  const { attrStr, wrapShow } = processAllProps(node, ctx);

  // Check for slot content on components
  const hasSlotContent = node.children.length > 0 && hasSlotDirectives(node);

  // Self-closing HTML elements
  if (SELF_CLOSING_TAGS.has(tag) && node.children.length === 0) {
    const jsx = `<${tag}${attrStr} />`;
    return wrapShow ? wrapVShow(jsx, wrapShow) : jsx;
  }

  let children: string;
  if (hasSlotContent) {
    const { slotEntries } = processSlotContent(node, ctx, renderChildrenForSlot, walkChildren);
    children = formatSlotEntries(slotEntries);
  } else {
    children = walkChildren(node.children, ctx);
  }

  if (!children.trim()) {
    const jsx = `<${tag}${attrStr} />`;
    return wrapShow ? wrapVShow(jsx, wrapShow) : jsx;
  }

  const jsx = `<${tag}${attrStr}>${children}</${tag}>`;
  return wrapShow ? wrapVShow(jsx, wrapShow) : jsx;
}

function renderDynamicComponent(node: ElementNode, ctx: JsxContext): string {
  let componentExpr = "undefined";
  for (const prop of node.props) {
    if (prop.type === 7 && prop.name === "bind" && prop.arg && (prop.arg as any).content === "is") {
      componentExpr = unwrapExpression(prop.exp as any, ctx);
      break;
    }
  }

  const filteredNode = {
    ...node,
    props: node.props.filter((prop) => {
      if (prop.type === 7 && prop.name === "bind" && prop.arg && (prop.arg as any).content === "is")
        return false;
      return true;
    }),
  } as ElementNode;

  const { attrStr } = processAllProps(filteredNode, ctx);
  const children = walkChildren(node.children, ctx);

  if (!children.trim()) {
    return `<${componentExpr}${attrStr} />`;
  }
  return `<${componentExpr}${attrStr}>${children}</${componentExpr}>`;
}

interface ProcessedProps {
  attrStr: string;
  extraAttrs: string[];
  wrapShow: string | null;
}

/**
 * Process all props on an element, combining attributes, events, and directives.
 */
function processAllProps(node: ElementNode, ctx: JsxContext): ProcessedProps {
  const attrResult = generateAttributes(node, ctx);
  const extraAttrs: string[] = [];
  let wrapShow: string | null = null;

  // Process directives that aren't handled by generateAttributes
  for (const prop of node.props) {
    if (prop.type !== 7) continue;
    const dir = prop as DirectiveNode;

    // Skip directives already handled by attributes.ts or control-flow
    if (
      dir.name === "bind" ||
      dir.name === "on" ||
      dir.name === "if" ||
      dir.name === "else-if" ||
      dir.name === "else" ||
      dir.name === "for" ||
      dir.name === "slot"
    )
      continue;

    if (dir.name === "show") {
      wrapShow = dir.exp ? unwrapExpression(dir.exp as any, ctx) : "true";
      continue;
    }

    const result = processDirective(dir, node, ctx);
    if (result.omit) continue;
    if (result.attr && result.value) {
      extraAttrs.push(`${result.attr}={${result.value}}`);
    }
  }

  // Add extra directive attrs
  for (const extra of extraAttrs) {
    attrResult.attrs.push(extra);
  }

  return {
    attrStr: formatAttributes(attrResult),
    extraAttrs,
    wrapShow,
  };
}

function wrapVShow(jsx: string, condition: string): string {
  return `<div v-show={${condition}} style={{ display: ${condition} ? undefined : 'none' }}>${jsx}</div>`;
}

function hasSlotDirectives(node: ElementNode): boolean {
  for (const child of node.children) {
    if (child.type === 1) {
      const el = child as ElementNode;
      if (el.tag === "template") {
        const hasSlot = el.props.some((p) => p.type === 7 && (p as DirectiveNode).name === "slot");
        if (hasSlot) return true;
      }
    }
  }
  // Also check the component itself for v-slot
  return node.props.some((p) => p.type === 7 && (p as DirectiveNode).name === "slot");
}

/**
 * Helper to render an element's children for slot processing.
 */
function renderChildrenForSlot(node: ElementNode, ctx: JsxContext): string {
  return walkChildren(node.children, ctx);
}
