import type { ParsedSFC, ImportInfo, ExtractedMacros } from "../types";
import { extractMacros, parsePropTypes } from "./macros";
import { mergeImports, generateImportStatements, addVueImport } from "./imports";
import { detectAutoImports } from "./auto-imports";

export { extractMacros } from "./macros";
export { mergeImports, generateImportStatements, addVueImport } from "./imports";
export { detectAutoImports } from "./auto-imports";

/** Runtime helper for v-for that handles arrays, objects, and numbers */
const RENDER_LIST_HELPER = `function _renderList<T>(source: T[], renderItem: (item: T, index: number) => unknown): unknown[]
function _renderList(source: number, renderItem: (value: number, index: number) => unknown): unknown[]
function _renderList<T extends object>(source: T, renderItem: (value: T[keyof T], key: string, index: number) => unknown): unknown[]
function _renderList(
  source: unknown,
  renderItem: (...args: Array<unknown>) => unknown
): Array<unknown> {
  if (Array.isArray(source)) {
    return source.map((item, index) => renderItem(item, index, source))
  }
  if (typeof source === 'number') {
    return Array.from({ length: source }, (_, i) =>
      (renderItem as (...args: Array<unknown>) => unknown)(i + 1, i)
    )
  }
  if (typeof source === 'object' && source) {
    return Object.keys(source).map((key, index) =>
      renderItem((source as Record<string, unknown>)[key], key, index)
    )
  }
  return []
}`;

/** Map TS type strings to Vue runtime prop constructors */
const TS_TO_RUNTIME: Record<string, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  symbol: "Symbol",
};

/**
 * Convert a single TS type to a runtime prop type expression.
 * Returns { expr, needsPropType } where needsPropType means we need `import type { PropType } from 'vue'`.
 */
function tsTypeToRuntime(
  tsType: string,
  originalTsType: string,
): { expr: string; needsPropType: boolean } {
  const t = tsType.trim();
  const simple = TS_TO_RUNTIME[t];
  if (simple) return { expr: simple, needsPropType: false };

  // Array types: string[], number[], T[], Array<T>
  if (t.endsWith("[]") || t.startsWith("Array<")) {
    return { expr: `Array as PropType<${originalTsType}>`, needsPropType: true };
  }

  // Function types: Function, () => ...
  if (t === "Function" || t.includes("=>")) {
    return { expr: `Function as PropType<${originalTsType}>`, needsPropType: true };
  }

  // String literal unions: "a" | "b" | "c" → String as PropType<T>
  if (t.includes("|")) {
    const members = t.split("|").map((m) => m.trim());
    if (members.length > 0 && members.every((m) => /^["'].*["']$/.test(m))) {
      return { expr: `String as PropType<${originalTsType}>`, needsPropType: true };
    }
  }

  // Everything else: Object as PropType<T>
  return { expr: `Object as PropType<${originalTsType}>`, needsPropType: true };
}

/**
 * Build the props option for defineComponent from extracted macros.
 * For type-based props, converts to runtime prop declarations.
 */
function buildPropsOption(
  props: ExtractedMacros["props"],
  allImports: ImportInfo[],
): string | null {
  if (!props) return null;

  if (props.runtime) {
    return props.runtime;
  }

  // Type-based props: convert to runtime
  if (!props.type) return null;

  const propInfos = parsePropTypes(props.type);
  if (propInfos.length === 0) return null;

  // Parse defaults if withDefaults was used
  const defaults = new Map<string, string>();
  if (props.defaults) {
    let body = props.defaults.trim();
    if (body.startsWith("{")) body = body.slice(1);
    if (body.endsWith("}")) body = body.slice(0, -1);
    // Simple key: value parsing at top level
    let current = "";
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
      if (ch === "," && depth === 0) {
        const m = current.trim().match(/^(\w+)\s*:\s*(.+)$/s);
        if (m) defaults.set(m[1], m[2].trim());
        current = "";
      } else {
        current += ch;
      }
    }
    const last = current.trim().match(/^(\w+)\s*:\s*(.+)$/s);
    if (last) defaults.set(last[1], last[2].trim());
  }

  let needsPropType = false;
  const entries: string[] = [];

  for (const prop of propInfos) {
    const runtime = tsTypeToRuntime(prop.type, prop.type);
    if (runtime.needsPropType) needsPropType = true;

    const parts: string[] = [];
    parts.push(`type: ${runtime.expr}`);

    const defaultVal = defaults.get(prop.name);
    if (defaultVal !== undefined) {
      parts.push(`default: ${defaultVal}`);
    } else if (prop.optional) {
      parts.push("required: false");
    } else {
      parts.push("required: true");
    }

    entries.push(`    ${prop.name}: { ${parts.join(", ")} }`);
  }

  if (needsPropType) {
    addVueImport(allImports, "PropType", true);
  }

  return `{\n${entries.join(",\n")}\n  }`;
}

/**
 * Parse event names from a type-based defineEmits type parameter.
 * Handles call signature form: { (e: 'foo', ...): void; (e: 'bar'): void }
 * Handles Vue 3.3+ shorthand form: { foo: [...]; bar: [...] }
 */
function parseEmitTypes(typeStr: string): string[] {
  const names: string[] = [];

  // Call signature form: (e: 'eventName', ...) => extract 'eventName'
  const callSigRe = /\(\s*e\s*:\s*['"]([\w\-:]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = callSigRe.exec(typeStr)) !== null) {
    names.push(match[1]);
  }

  if (names.length > 0) return names;

  // Shorthand property form: { foo: [...]; "bar-baz": [...] }
  // Must only match top-level properties (depth 0), not nested object properties
  const body = typeStr.replace(/^\s*\{/, "").replace(/\}\s*$/, "");
  let depth = 0;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "{" || ch === "[" || ch === "(") {
      depth++;
      i++;
    } else if (ch === "}" || ch === "]" || ch === ")") {
      depth--;
      i++;
    } else if (depth === 0) {
      const rest = body.slice(i);
      const propMatch = rest.match(/^(?:["']([\w\-:]+)["']|([\w]+))\s*:/);
      if (propMatch) {
        names.push(propMatch[1] ?? propMatch[2]);
        i += propMatch[0].length;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  return names;
}

/**
 * Build the emits option for defineComponent from extracted macros.
 */
function buildEmitsOption(emits: ExtractedMacros["emits"]): string | null {
  if (!emits) return null;

  if (emits.runtime) {
    return emits.runtime;
  }

  // Type-based emits: parse event names from the type parameter
  if (emits.type) {
    const eventNames = parseEmitTypes(emits.type);
    if (eventNames.length > 0) {
      return `[${eventNames.map((n) => `'${n}'`).join(", ")}]`;
    }
  }

  return null;
}

/**
 * Ensure jsxBody is valid as the return value of `return () => (...)`.
 * A bare `{expr}` (from v-if chain as single root) needs a fragment wrapper.
 */
function ensureValidJsxReturn(jsx: string): string {
  const trimmed = jsx.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}") && !trimmed.startsWith("{/*")) {
    return `<>${trimmed}</>`;
  }
  return jsx;
}

/**
 * Indent each line of a string by the given number of spaces.
 */
function indentStr(str: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return str
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

/**
 * Convert a ParsedSFC (with script setup) to a defineComponent-based TSX string.
 */
export function scriptToDefineComponent(
  parsed: ParsedSFC,
  jsxBody: string,
  additionalImports: ImportInfo[] = [],
  usedContextMembers: Set<string> = new Set(),
  options: { hasVFor?: boolean } = {},
): string {
  if (parsed.scriptSetup) {
    return fromScriptSetup(parsed, jsxBody, additionalImports, usedContextMembers, options);
  }

  if (parsed.script) {
    return fromRegularScript(parsed, jsxBody, additionalImports, options);
  }

  // No script at all - create a minimal functional component
  const imports: ImportInfo[] = [];
  addVueImport(imports, "defineComponent");
  const merged = mergeImports(imports, additionalImports);

  const lines: string[] = [];
  lines.push(generateImportStatements(merged));
  lines.push("");
  lines.push("export default defineComponent({");
  lines.push("  setup() {");
  if (options.hasVFor) {
    lines.push(indentStr(RENDER_LIST_HELPER, 4));
    lines.push("");
  }
  lines.push("    return () => (");
  lines.push(indentStr(ensureValidJsxReturn(jsxBody), 6));
  lines.push("    )");
  lines.push("  }");
  lines.push("})");

  return lines.join("\n");
}

function fromScriptSetup(
  parsed: ParsedSFC,
  jsxBody: string,
  additionalImports: ImportInfo[],
  usedContextMembers: Set<string> = new Set(),
  options: { hasVFor?: boolean } = {},
): string {
  const macros = extractMacros(parsed.scriptSetup!.content, parsed.scriptSetup!.lang);

  // Detect auto-imported APIs (e.g., ref, computed used without explicit import)
  // Include runtime props/emits strings since they may reference PropType etc.
  const extraScanSources = [macros.props?.runtime ?? "", macros.emits?.runtime ?? ""]
    .filter(Boolean)
    .join("\n");
  const autoImported = detectAutoImports(
    macros.body + "\n" + extraScanSources,
    jsxBody,
    macros.imports,
  );

  // Build imports
  const allImports = [...macros.imports, ...autoImported];
  addVueImport(allImports, "defineComponent");
  const merged = mergeImports(allImports, additionalImports);

  // Remove macro-related type imports from vue (defineProps, defineEmits, etc are compiler macros)
  const vueMacroNames = new Set([
    "defineProps",
    "defineEmits",
    "defineSlots",
    "defineExpose",
    "defineOptions",
    "defineModel",
    "withDefaults",
    "useSlots",
    "useAttrs",
  ]);
  for (const imp of merged) {
    if (imp.source === "vue") {
      imp.namedImports = imp.namedImports.filter((n) => !vueMacroNames.has(n.imported));
    }
  }

  // Build defineComponent options
  const componentOptions: string[] = [];

  // Props — prefer resolvedTypeBody (interface with extends) over raw type for runtime option
  const propsForOption = macros.props
    ? { ...macros.props, type: macros.props.resolvedTypeBody ?? macros.props.type }
    : null;
  const propsOption = buildPropsOption(propsForOption, allImports);
  if (propsOption) {
    componentOptions.push(`  props: ${propsOption},`);
  }

  // Emits
  const emitsOption = buildEmitsOption(macros.emits);
  if (emitsOption) {
    componentOptions.push(`  emits: ${emitsOption},`);
  }

  // Models require props and emit in setup signature, and computed import
  const hasModels = macros.models.length > 0;
  if (hasModels) {
    addVueImport(allImports, "computed");
    // Re-merge to include computed
    const reMerged = mergeImports(allImports, additionalImports);
    for (const imp of reMerged) {
      if (imp.source === "vue") {
        imp.namedImports = imp.namedImports.filter((n) => !vueMacroNames.has(n.imported));
      }
    }
    // Update merged in place
    merged.length = 0;
    merged.push(...reMerged);
  }

  // Determine setup parameters
  const setupParams: string[] = [];
  const hasProps = macros.props !== null || hasModels;
  const hasEmits = macros.emits !== null || hasModels;

  if (hasProps) {
    const propsType = macros.props?.type;
    setupParams.push(propsType ? `props: ${propsType}` : "props");
  }

  const ctxParts: string[] = [];
  if (macros.slots || usedContextMembers.has("slots")) ctxParts.push("slots");
  if (hasEmits || usedContextMembers.has("emit")) ctxParts.push("emit");
  if (macros.expose) ctxParts.push("expose");
  if (usedContextMembers.has("attrs")) ctxParts.push("attrs");

  // Build the setup function signature
  let setupSig: string;
  if (setupParams.length === 0 && ctxParts.length === 0) {
    setupSig = "setup()";
  } else {
    let propsParam = hasProps ? "props" : "_props";
    // For unresolved identifier prop types (imported types we couldn't inline),
    // annotate the setup parameter so TypeScript knows the prop shapes without
    // needing a runtime props declaration.
    if (hasProps && macros.props?.type && !macros.props.type.trim().startsWith("{")) {
      propsParam = `props: ${macros.props.type}`;
    }
    if (ctxParts.length > 0) {
      setupSig = `setup(${propsParam}, { ${ctxParts.join(", ")} })`;
    } else {
      setupSig = `setup(${propsParam})`;
    }
  }

  // If the body contains top-level await, make setup async
  if (/\bawait\b/.test(macros.body)) {
    setupSig = `async ${setupSig}`;
  }

  // Build setup body
  const bodyLines: string[] = [];

  // Emit _renderList helper if v-for was used in template
  if (options.hasVFor) {
    bodyLines.push(RENDER_LIST_HELPER);
    bodyLines.push("");
  }

  // Generate computed get/set for each defineModel
  for (const model of macros.models) {
    const propName = model.name ?? "modelValue";
    const typeAnnotation = model.type ? `<${model.type}>` : "";
    bodyLines.push(`const ${model.variableName} = computed${typeAnnotation}({`);
    bodyLines.push(`  get: () => props.${propName},`);
    bodyLines.push(`  set: (val) => emit('update:${propName}', val)`);
    bodyLines.push(`})`);
  }

  // If user named their emit variable something other than 'emit' (e.g. const emits = defineEmits()),
  // inject an alias so body references like `useForwardPropsEmits(props, emits)` still work.
  if (macros.emits?.variableName) {
    bodyLines.push(`const ${macros.emits.variableName} = emit`);
  }

  if (macros.body) {
    bodyLines.push(macros.body);
  }

  // Emit expose() call if defineExpose was used
  if (macros.expose?.runtime) {
    bodyLines.push(`\nexpose(${macros.expose.runtime})`);
  }

  bodyLines.push("");
  bodyLines.push("return () => (");
  bodyLines.push(indentStr(ensureValidJsxReturn(jsxBody), 2));
  bodyLines.push(")");

  const indentedBody = indentStr(bodyLines.join("\n"), 4);

  // Build final output
  const lines: string[] = [];
  const importStr = generateImportStatements(merged);
  if (importStr) {
    lines.push(importStr);
  }

  // Hoist side-effect imports after structured imports
  if (macros.rawImports.length > 0) {
    lines.push(macros.rawImports.map((s) => s.replace(/\.vue(['"])/g, "$1")).join("\n"));
  }

  // Hoist type/interface declarations that must live at module level
  // (e.g. `interface Props extends Base { ... }`) so the setup annotation can reference them.
  if (macros.hoistedTypes.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    lines.push(macros.hoistedTypes.join("\n\n"));
  }

  if (lines.length > 0) {
    lines.push("");
  }

  lines.push("export default defineComponent({");
  for (const opt of componentOptions) {
    lines.push(opt);
  }
  lines.push(`  ${setupSig} {`);
  lines.push(indentedBody);
  lines.push("  }");
  lines.push("})");

  // Append export statements after defineComponent
  if (macros.rawExports.length > 0) {
    lines.push("");
    lines.push(macros.rawExports.join("\n"));
  }

  return lines.join("\n");
}

function fromRegularScript(
  parsed: ParsedSFC,
  jsxBody: string,
  additionalImports: ImportInfo[],
  options: { hasVFor?: boolean } = {},
): string {
  const content = parsed.script!.content.trim();

  // Try to find `export default { ... }` and wrap it
  const exportMatch = content.match(/export\s+default\s+/);
  if (!exportMatch) {
    // Can't transform, return as-is with a render method appended
    return content;
  }

  // Simple approach: wrap the export default in defineComponent and add render
  const imports: ImportInfo[] = [];
  addVueImport(imports, "defineComponent");
  const merged = mergeImports(imports, additionalImports);

  // Extract any imports from the script
  const beforeExport = content.slice(0, exportMatch.index).trim();
  const afterExport = content.slice(exportMatch.index! + exportMatch[0].length).trim();

  const lines: string[] = [];
  const importStr = generateImportStatements(merged);
  if (importStr) {
    lines.push(importStr);
  }
  if (beforeExport) {
    // Filter out existing import lines (they're handled by merged imports)
    const nonImportLines = beforeExport
      .split("\n")
      .filter((l) => !l.trim().startsWith("import "))
      .join("\n")
      .trim();
    if (nonImportLines) {
      lines.push("");
      lines.push(nonImportLines);
    }
  }
  lines.push("");
  lines.push(`export default defineComponent({`);
  lines.push(`  ...${afterExport.replace(/;?\s*$/, "")},`);
  lines.push("  setup() {");
  if (options.hasVFor) {
    lines.push(indentStr(RENDER_LIST_HELPER, 4));
    lines.push("");
  }
  lines.push("    return () => (");
  lines.push(indentStr(ensureValidJsxReturn(jsxBody), 6));
  lines.push("    )");
  lines.push("  }");
  lines.push("})");

  return lines.join("\n");
}
