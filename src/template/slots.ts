import type { ElementNode, DirectiveNode, JsxContext } from "../types";
import { unwrapExpression } from "./utils";

/**
 * Process a <slot> element into JSX.
 * - `<slot>` → `{slots.default?.()}`
 * - `<slot name="header">` → `{slots.header?.()}`
 * - `<slot name="item" :item="item" :index="i">` → `{slots.item?.({ item, index: i })}`
 * - `<slot>fallback</slot>` → `{slots.default?.() ?? <>fallback</>}`
 */
export function processSlot(
  node: ElementNode,
  ctx: JsxContext,
  renderChildren: (node: ElementNode, ctx: JsxContext) => string,
): string {
  // Determine slot name
  let slotName = "default";
  const nameProp = node.props.find((p) => p.type === 6 && (p as any).name === "name");
  if (nameProp && nameProp.type === 6) {
    slotName = (nameProp as any).value?.content ?? "default";
  }
  // Dynamic name via :name="expr"
  const dynamicName = node.props.find(
    (p): p is DirectiveNode =>
      p.type === 7 && p.name === "bind" && p.arg != null && (p.arg as any).content === "name",
  );
  let isDynamicName = false;
  if (dynamicName) {
    slotName = unwrapExpression(dynamicName.exp as any);
    isDynamicName = true;
  }

  // Collect slot props (bound attributes other than name)
  const slotProps: string[] = [];
  for (const prop of node.props) {
    if (prop.type === 6) {
      // Static attribute — skip 'name'
      if ((prop as any).name === "name") continue;
      // Other static attrs passed as slot props (unusual but possible)
      const val = (prop as any).value?.content;
      if (val != null) {
        slotProps.push(`${(prop as any).name}: "${val}"`);
      }
    } else if (prop.type === 7 && prop.name === "bind") {
      const dir = prop as DirectiveNode;
      if (dir.arg && (dir.arg as any).content === "name") continue;
      if (!dir.arg) {
        // v-bind="obj" spread on slot — pass as spread in slot props
        const expr = unwrapExpression(dir.exp as any, ctx);
        if (expr) slotProps.push(`...${expr}`);
        continue;
      }
      const propName = (dir.arg as any).content;
      const expr = unwrapExpression(dir.exp as any, ctx);
      slotProps.push(`${propName}: ${expr}`);
    }
  }

  // Track that slots is used in setup context
  ctx.usedContextMembers.add("slots");

  const propsArg = slotProps.length > 0 ? `{ ${slotProps.join(", ")} }` : "";
  const slotAccess = isDynamicName ? `slots[${slotName}]` : `slots.${slotName}`;

  const call = `${slotAccess}?.(${propsArg})`;

  // Check for fallback content
  const fallback = renderChildren(node, ctx);
  if (fallback.trim()) {
    return `{${call} ?? <>${fallback}</>}`;
  }

  return `{${call}}`;
}

/**
 * Extract slot content from a component's children.
 * Handles v-slot directives on <template> children and default slot content.
 *
 * Returns an object expression for the slots, e.g.:
 * `{{ default: () => <div>content</div>, header: ({ item }) => <h1>{item}</h1> }}`
 */
export function processSlotContent(
  node: ElementNode,
  ctx: JsxContext,
  renderChildren: (node: ElementNode, ctx: JsxContext) => string,
  renderChildNodes: (children: import("../types").TemplateChildNode[], ctx: JsxContext) => string,
): { slotEntries: SlotEntry[]; hasSlots: boolean } {
  const entries: SlotEntry[] = [];
  const defaultChildren: import("../types").TemplateChildNode[] = [];

  // Check if the component itself has v-slot (shorthand for default slot)
  const componentSlotDir = node.props.find(
    (p): p is DirectiveNode => p.type === 7 && p.name === "slot",
  );

  if (componentSlotDir) {
    // v-slot on the component itself — all children are the default slot
    const slotParam = componentSlotDir.exp ? unwrapExpression(componentSlotDir.exp as any) : "";
    const slotName = componentSlotDir.arg ? (componentSlotDir.arg as any).content : "default";
    const content = renderChildNodes(node.children, ctx);
    entries.push({ name: slotName, params: slotParam, content });
    return { slotEntries: entries, hasSlots: true };
  }

  for (const child of node.children) {
    if (child.type === 1) {
      const el = child as ElementNode;
      // <template v-slot:name="params">
      const slotDir = el.props.find((p): p is DirectiveNode => p.type === 7 && p.name === "slot");
      if (el.tag === "template" && slotDir) {
        const slotName = slotDir.arg ? (slotDir.arg as any).content : "default";
        const slotParam = slotDir.exp ? unwrapExpression(slotDir.exp as any) : "";
        const content = renderChildNodes(el.children, ctx);
        entries.push({ name: slotName, params: slotParam, content });
        continue;
      }
    }
    defaultChildren.push(child);
  }

  // If there's default children not in named slots, add them as default slot
  const defaultContent = renderChildNodes(defaultChildren, ctx);
  if (defaultContent.trim()) {
    // Only add default if there isn't already one
    const hasDefault = entries.some((e) => e.name === "default");
    if (!hasDefault) {
      entries.push({ name: "default", params: "", content: defaultContent });
    }
  }

  return { slotEntries: entries, hasSlots: entries.length > 0 };
}

export interface SlotEntry {
  name: string;
  params: string;
  content: string;
}

/**
 * Format slot entries into JSX v-slots syntax for Vue JSX.
 * Uses the `v-slots` pattern or direct children depending on complexity.
 */
export function formatSlotEntries(entries: SlotEntry[]): string {
  if (entries.length === 0) return "";

  // Single default slot with no params — just return content directly as children
  if (entries.length === 1 && entries[0].name === "default" && !entries[0].params) {
    return entries[0].content;
  }

  // Multiple slots or named slots → v-slots object
  const slotParts = entries.map((entry) => {
    const params = entry.params ? `(${entry.params})` : "()";
    const content = entry.content.includes("\n")
      ? `<>${entry.content}</>`
      : entry.content.trim().startsWith("<")
        ? entry.content
        : `<>${entry.content}</>`;
    return `${entry.name}: ${params} => ${content}`;
  });

  return `{{${"\n"}${slotParts.map((p) => `  ${p}`).join(",\n")}${"\n"}}}`;
}
