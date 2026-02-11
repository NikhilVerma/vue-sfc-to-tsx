import type { ParsedSFC, ImportInfo, ExtractedMacros } from '../types';
import { extractMacros } from './macros';
import { mergeImports, generateImportStatements, addVueImport } from './imports';
import { detectAutoImports } from './auto-imports';

export { extractMacros } from './macros';
export { mergeImports, generateImportStatements, addVueImport } from './imports';
export { detectAutoImports } from './auto-imports';

/**
 * Build the props option for defineComponent from extracted macros.
 */
function buildPropsOption(props: ExtractedMacros['props']): string | null {
  if (!props) return null;

  if (props.runtime) {
    return props.runtime;
  }

  // For type-based props, we need to express them as runtime props.
  // In defineComponent, we pass them via the generic or a props object.
  // Since we have the type string, we'll use it as a generic annotation comment
  // and fall back to null (the type will be on the setup function's props param).
  return null;
}

/**
 * Build the emits option for defineComponent from extracted macros.
 */
function buildEmitsOption(emits: ExtractedMacros['emits']): string | null {
  if (!emits) return null;

  if (emits.runtime) {
    return emits.runtime;
  }

  return null;
}

/**
 * Indent each line of a string by the given number of spaces.
 */
function indentStr(str: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return str
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n');
}

/**
 * Convert a ParsedSFC (with script setup) to a defineComponent-based TSX string.
 */
export function scriptToDefineComponent(
  parsed: ParsedSFC,
  jsxBody: string,
  additionalImports: ImportInfo[] = [],
  usedContextMembers: Set<string> = new Set(),
): string {
  if (parsed.scriptSetup) {
    return fromScriptSetup(parsed, jsxBody, additionalImports, usedContextMembers);
  }

  if (parsed.script) {
    return fromRegularScript(parsed, jsxBody, additionalImports);
  }

  // No script at all - create a minimal functional component
  const imports: ImportInfo[] = [];
  addVueImport(imports, 'defineComponent');
  const merged = mergeImports(imports, additionalImports);

  const lines: string[] = [];
  lines.push(generateImportStatements(merged));
  lines.push('');
  lines.push('export default defineComponent({');
  lines.push('  setup() {');
  lines.push('    return () => (');
  lines.push(indentStr(jsxBody, 6));
  lines.push('    )');
  lines.push('  }');
  lines.push('})');

  return lines.join('\n');
}

function fromScriptSetup(
  parsed: ParsedSFC,
  jsxBody: string,
  additionalImports: ImportInfo[],
  usedContextMembers: Set<string> = new Set(),
): string {
  const macros = extractMacros(parsed.scriptSetup!.content, parsed.scriptSetup!.lang);

  // Detect auto-imported APIs (e.g., ref, computed used without explicit import)
  const autoImported = detectAutoImports(macros.body, jsxBody, macros.imports);

  // Build imports
  const allImports = [...macros.imports, ...autoImported];
  addVueImport(allImports, 'defineComponent');
  const merged = mergeImports(allImports, additionalImports);

  // Remove macro-related type imports from vue (defineProps, defineEmits, etc are compiler macros)
  const vueMacroNames = new Set([
    'defineProps',
    'defineEmits',
    'defineSlots',
    'defineExpose',
    'defineOptions',
    'defineModel',
    'withDefaults',
  ]);
  for (const imp of merged) {
    if (imp.source === 'vue') {
      imp.namedImports = imp.namedImports.filter((n) => !vueMacroNames.has(n.imported));
    }
  }

  // Build defineComponent options
  const options: string[] = [];

  // Props
  const propsOption = buildPropsOption(macros.props);
  if (propsOption) {
    options.push(`  props: ${propsOption},`);
  }

  // Emits
  const emitsOption = buildEmitsOption(macros.emits);
  if (emitsOption) {
    options.push(`  emits: ${emitsOption},`);
  }

  // Models require props and emit in setup signature, and computed import
  const hasModels = macros.models.length > 0;
  if (hasModels) {
    addVueImport(allImports, 'computed');
    // Re-merge to include computed
    const reMerged = mergeImports(allImports, additionalImports);
    for (const imp of reMerged) {
      if (imp.source === 'vue') {
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
    setupParams.push(propsType ? `props: ${propsType}` : 'props');
  }

  const ctxParts: string[] = [];
  if (macros.slots || usedContextMembers.has('slots')) ctxParts.push('slots');
  if (hasEmits || usedContextMembers.has('emit')) ctxParts.push('emit');
  if (macros.expose) ctxParts.push('expose');
  if (usedContextMembers.has('attrs')) ctxParts.push('attrs');

  // Build the setup function signature
  let setupSig: string;
  if (setupParams.length === 0 && ctxParts.length === 0) {
    setupSig = 'setup()';
  } else {
    const propsParam = hasProps ? 'props' : '_props';
    if (ctxParts.length > 0) {
      setupSig = `setup(${propsParam}, { ${ctxParts.join(', ')} })`;
    } else {
      setupSig = `setup(${propsParam})`;
    }
  }

  // Build setup body
  const bodyLines: string[] = [];

  // Generate computed get/set for each defineModel
  for (const model of macros.models) {
    const propName = model.name ?? 'modelValue';
    const typeAnnotation = model.type ? `<${model.type}>` : '';
    bodyLines.push(`const ${model.variableName} = computed${typeAnnotation}({`);
    bodyLines.push(`  get: () => props.${propName},`);
    bodyLines.push(`  set: (val) => emit('update:${propName}', val)`);
    bodyLines.push(`})`);
  }

  if (macros.body) {
    bodyLines.push(macros.body);
  }
  bodyLines.push('');
  bodyLines.push('return () => (');
  bodyLines.push(indentStr(jsxBody, 2));
  bodyLines.push(')');

  const indentedBody = indentStr(bodyLines.join('\n'), 4);

  // Build final output
  const lines: string[] = [];
  const importStr = generateImportStatements(merged);
  if (importStr) {
    lines.push(importStr);
    lines.push('');
  }

  lines.push('export default defineComponent({');
  for (const opt of options) {
    lines.push(opt);
  }
  lines.push(`  ${setupSig} {`);
  lines.push(indentedBody);
  lines.push('  }');
  lines.push('})');

  return lines.join('\n');
}

function fromRegularScript(
  parsed: ParsedSFC,
  jsxBody: string,
  additionalImports: ImportInfo[],
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
  addVueImport(imports, 'defineComponent');
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
      .split('\n')
      .filter((l) => !l.trim().startsWith('import '))
      .join('\n')
      .trim();
    if (nonImportLines) {
      lines.push('');
      lines.push(nonImportLines);
    }
  }
  lines.push('');
  lines.push(`export default defineComponent({`);
  lines.push(`  ...${afterExport.replace(/;?\s*$/, '')},`);
  lines.push('  setup() {');
  lines.push('    return () => (');
  lines.push(indentStr(jsxBody, 6));
  lines.push('    )');
  lines.push('  }');
  lines.push('})');

  return lines.join('\n');
}
