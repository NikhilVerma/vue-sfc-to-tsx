import type { ElementNode, TemplateChildNode } from "../types";
import type { JsxContext } from "../types";
import { escapeJsxText, unwrapExpression, SELF_CLOSING_TAGS } from "./utils";
import { generateAttributes, formatAttributes } from "./attributes";

/**
 * Generate a JSX string from an ElementNode.
 * Handles regular HTML elements, self-closing tags, Vue components,
 * <template> fragments, and <component :is="x"> dynamic components.
 */
export function generateElement(node: ElementNode, ctx: JsxContext): string {
  const tag = node.tag;

  // <template> → fragment
  if (tag === "template") {
    // Check if it has v-if/v-for/v-slot — those will be handled by other modules
    // For a bare <template>, render as fragment
    const children = generateChildren(node.children, ctx);
    if (!children.trim()) return "<></>";
    return `<>${children}</>`;
  }

  // <component :is="expr"> → dynamic component
  if (tag === "component") {
    return generateDynamicComponent(node, ctx);
  }

  const attrResult = generateAttributes(node, ctx);
  const attrStr = formatAttributes(attrResult);

  // Self-closing HTML elements
  if (SELF_CLOSING_TAGS.has(tag) && node.children.length === 0) {
    return `<${tag}${attrStr} />`;
  }

  const children = generateChildren(node.children, ctx);

  // Self-close if no children
  if (!children.trim()) {
    return `<${tag}${attrStr} />`;
  }

  return `<${tag}${attrStr}>${children}</${tag}>`;
}

function generateDynamicComponent(node: ElementNode, ctx: JsxContext): string {
  // Find the :is directive
  let componentExpr = "undefined";
  for (const prop of node.props) {
    if (prop.type === 7 && prop.name === "bind" && prop.arg && (prop.arg as any).content === "is") {
      componentExpr = unwrapExpression(prop.exp as any, ctx);
      break;
    }
  }

  // Filter out the :is prop from attributes
  const filteredNode = {
    ...node,
    props: node.props.filter((prop) => {
      if (prop.type === 7 && prop.name === "bind" && prop.arg && (prop.arg as any).content === "is")
        return false;
      return true;
    }),
  } as ElementNode;

  const attrResult = generateAttributes(filteredNode, ctx);
  const attrStr = formatAttributes(attrResult);
  const children = generateChildren(node.children, ctx);

  const Component = componentExpr;

  if (!children.trim()) {
    return `<${Component}${attrStr} />`;
  }

  return `<${Component}${attrStr}>${children}</${Component}>`;
}

/**
 * Process an array of child nodes into a JSX string.
 */
export function generateChildren(children: TemplateChildNode[], ctx: JsxContext): string {
  const parts: string[] = [];

  for (const child of children) {
    const result = generateChild(child, ctx);
    if (result !== null) {
      parts.push(result);
    }
  }

  return parts.join("");
}

/**
 * Generate JSX for a single child node.
 */
function generateChild(node: TemplateChildNode, ctx: JsxContext): string | null {
  switch (node.type) {
    case 1: // ELEMENT
      return generateElement(node as ElementNode, ctx);

    case 2: // TEXT
      return handleTextNode(node as any);

    case 3: // COMMENT
      return `{/* ${(node as any).content} */}`;

    case 5: // INTERPOLATION
      return handleInterpolation(node as any);

    default:
      return null;
  }
}

function handleTextNode(node: { content: string }): string {
  const text = node.content;
  // Collapse whitespace-only nodes to a single space (or skip)
  if (!text.trim()) {
    // Preserve a single space between inline elements, but skip pure whitespace
    return text.includes("\n") ? "" : " ";
  }
  return escapeJsxText(text);
}

function handleInterpolation(node: { content: any }, ctx?: import("../types").JsxContext): string {
  const expr = unwrapExpression(node.content, ctx);
  return `{${expr}}`;
}
