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
  const raw = processSlotRaw(node, ctx, renderChildren);
  return `{${raw}}`;
}

/**
 * Process a <slot> element into a raw JSX expression (no {} wrapping).
 * Used by renderFullElement so conditional chains can wrap correctly.
 */
export function processSlotRaw(
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
  const dynamicName = node.props.find(
    (p): p is DirectiveNode =>
      p.type === 7 && p.name === "bind" && p.arg != null && (p.arg as any).content === "name",
  );
  let isDynamicName = false;
  if (dynamicName) {
    slotName = unwrapExpression(dynamicName.exp as any);
    isDynamicName = true;
  }

  const slotProps: string[] = [];
  for (const prop of node.props) {
    if (prop.type === 6) {
      if ((prop as any).name === "name") continue;
      const val = (prop as any).value?.content;
      if (val != null) {
        const propName = (prop as any).name;
        const needsQuotes = !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName);
        const safeName = needsQuotes ? `'${propName}'` : propName;
        slotProps.push(`${safeName}: "${val}"`);
      }
    } else if (prop.type === 7 && prop.name === "bind") {
      const dir = prop as DirectiveNode;
      if (dir.arg && (dir.arg as any).content === "name") continue;
      if (!dir.arg) {
        const expr = unwrapExpression(dir.exp as any, ctx);
        if (expr) slotProps.push(`...${expr}`);
        continue;
      }
      const propName = (dir.arg as any).content;
      const needsQuotes = !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName);
      const safeName = needsQuotes ? `'${propName}'` : propName;
      const expr = unwrapExpression(dir.exp as any, ctx);
      slotProps.push(`${safeName}: ${expr}`);
    }
  }

  ctx.usedContextMembers.add("slots");

  const propsArg = slotProps.length > 0 ? `{ ${slotProps.join(", ")} }` : "";
  const needsBracket = isDynamicName || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(slotName);
  const slotAccess = needsBracket
    ? isDynamicName
      ? `slots[${slotName}]`
      : `slots['${slotName}']`
    : `slots.${slotName}`;

  const call = `${slotAccess}?.(${propsArg})`;

  const fallback = renderChildren(node, ctx);
  if (fallback.trim()) {
    return `(${call} ?? <>${fallback}</>)`;
  }

  return call;
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

/**
 * Check if slot content needs to be wrapped in a fragment.
 * Wraps when: content has multiple root JSX elements/expressions, contains newlines,
 * or is non-JSX text.
 *
 * Uses a character-level scanner that properly skips JSX expression content `{...}`
 * so that `>` characters inside arrow functions or comparisons don't fool the detector.
 */
function needsFragmentWrap(content: string): boolean {
  const trimmed = content.trim();
  // Non-JSX content — wrap it
  if (!trimmed.startsWith("<")) return true;
  // Contains newlines — wrap for safety
  if (content.includes("\n")) return true;

  // Walk through tracking element depth and brace depth.
  // Return true as soon as we confirm there are multiple root-level nodes.
  let i = 0;
  let elemDepth = 0;
  let rootCount = 0;

  while (i < trimmed.length) {
    const c = trimmed[i];

    if (c === "{") {
      // Root-level JSX expression { ... }
      if (elemDepth === 0) {
        rootCount++;
        if (rootCount > 1) return true;
      }
      // Skip entire brace group (handles nested braces too)
      let braceDepth = 1;
      i++;
      while (i < trimmed.length && braceDepth > 0) {
        if (trimmed[i] === "{") braceDepth++;
        else if (trimmed[i] === "}") braceDepth--;
        i++;
      }
      continue;
    }

    if (c === "<") {
      const nextCh = trimmed[i + 1];

      if (nextCh === "/") {
        // Closing tag </tag> — find matching >
        elemDepth--;
        const closeEnd = trimmed.indexOf(">", i + 2);
        i = closeEnd >= 0 ? closeEnd + 1 : trimmed.length;
        if (elemDepth === 0) {
          // Root element closed — anything after?
          return trimmed.slice(i).trim().length > 0;
        }
        continue;
      }

      // Opening tag <Tag ...>
      if (elemDepth === 0) {
        rootCount++;
        if (rootCount > 1) return true;
      }
      elemDepth++;
      i++;

      // Scan attributes until > or />, skipping JSX expression values { ... }
      while (i < trimmed.length) {
        const tc = trimmed[i];
        if (tc === "{") {
          // Skip JSX expression in attribute value
          let bd = 1;
          i++;
          while (i < trimmed.length && bd > 0) {
            if (trimmed[i] === "{") bd++;
            else if (trimmed[i] === "}") bd--;
            i++;
          }
          continue;
        }
        if (tc === "/" && trimmed[i + 1] === ">") {
          // Self-closing tag
          elemDepth--;
          i += 2;
          if (elemDepth === 0) {
            return trimmed.slice(i).trim().length > 0;
          }
          break;
        }
        if (tc === ">") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    i++;
  }

  return false;
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
    const content = needsFragmentWrap(entry.content) ? `<>${entry.content}</>` : entry.content;
    const needsQuotes = !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(entry.name);
    const safeName = needsQuotes ? `'${entry.name}'` : entry.name;
    return `${safeName}: ${params} => ${content}`;
  });

  return `{{${"\n"}${slotParts.map((p) => `  ${p}`).join(",\n")}${"\n"}}}`;
}
