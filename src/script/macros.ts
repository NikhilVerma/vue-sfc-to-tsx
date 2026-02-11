import MagicString from 'magic-string';
import type { ExtractedMacros, ImportInfo, ModelMacro } from '../types';

/**
 * Match balanced content starting from a given character (e.g. `<` / `>` or `(` / `)`).
 * Returns the content between the delimiters (exclusive) and the end index (inclusive).
 */
function matchBalanced(
  str: string,
  startIdx: number,
  open: string,
  close: string,
): { content: string; end: number } | null {
  if (str[startIdx] !== open) return null;
  let depth = 1;
  let i = startIdx + 1;
  while (i < str.length && depth > 0) {
    if (str[i] === open) depth++;
    else if (str[i] === close) depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return null;
  return { content: str.slice(startIdx + 1, i), end: i };
}

/**
 * Parse import statements from script content and return ImportInfo[].
 */
function parseImports(content: string): { imports: ImportInfo[]; ranges: [number, number][] } {
  const imports: ImportInfo[] = [];
  const ranges: [number, number][] = [];

  // Match import statements - handles multiline
  const importRe = /^[ \t]*import\s+(type\s+)?(.+?)\s+from\s+(['"])(.+?)\3\s*;?[ \t]*$/gm;
  let m: RegExpExecArray | null;

  while ((m = importRe.exec(content)) !== null) {
    const typeOnly = !!m[1];
    const clause = m[2].trim();
    const source = m[4];
    const info: ImportInfo = {
      source,
      namedImports: [],
      typeOnly,
    };

    // namespace import: * as foo
    const nsMatch = clause.match(/^\*\s+as\s+(\w+)$/);
    if (nsMatch) {
      info.namespaceImport = nsMatch[1];
      imports.push(info);
      ranges.push([m.index, m.index + m[0].length]);
      continue;
    }

    // Parse the clause for default and named imports
    const braceStart = clause.indexOf('{');
    if (braceStart !== -1) {
      const braceEnd = clause.indexOf('}', braceStart);
      const namedPart = clause.slice(braceStart + 1, braceEnd).trim();
      const beforeBrace = clause.slice(0, braceStart).trim().replace(/,\s*$/, '').trim();

      if (beforeBrace) {
        info.defaultImport = beforeBrace;
      }

      if (namedPart) {
        for (const part of namedPart.split(',')) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          // handle "type Foo" or "type Foo as Bar"
          const typePrefix = trimmed.match(/^type\s+/);
          const cleaned = typePrefix ? trimmed.slice(typePrefix[0].length) : trimmed;
          const asMatch = cleaned.match(/^(\S+)\s+as\s+(\S+)$/);
          if (asMatch) {
            info.namedImports.push({ imported: asMatch[1], local: asMatch[2] });
          } else {
            info.namedImports.push({ imported: cleaned, local: cleaned });
          }
        }
      }
    } else {
      // No braces - just a default import
      info.defaultImport = clause;
    }

    imports.push(info);
    ranges.push([m.index, m.index + m[0].length]);
  }

  return { imports, ranges };
}

/**
 * Find a macro call in the source, potentially prefixed with `const <name> = `.
 * Returns the full match range and the extracted info.
 */
function findMacro(
  content: string,
  macroName: string,
): {
  start: number;
  end: number;
  typeParam?: string;
  runtimeArg?: string;
} | null {
  // Look for the macro call, possibly wrapped in withDefaults for defineProps
  const re = new RegExp(
    `(?:(?:const|let|var)\\s+\\w+\\s*=\\s*)?${macroName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'g',
  );

  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const macroStart = m.index;
    const afterMacro = m.index + m[0].length;

    let typeParam: string | undefined;
    let runtimeArg: string | undefined;
    let pos = afterMacro;

    // Check for type parameter <...>
    if (content[pos] === '<') {
      const balanced = matchBalanced(content, pos, '<', '>');
      if (balanced) {
        typeParam = balanced.content;
        pos = balanced.end + 1;
      }
    }

    // Must have opening paren
    if (content[pos] !== '(') continue;

    const parenResult = matchBalanced(content, pos, '(', ')');
    if (!parenResult) continue;

    const argContent = parenResult.content.trim();
    if (argContent && !typeParam) {
      runtimeArg = argContent;
    }

    pos = parenResult.end + 1;

    // Find the end of the statement (skip whitespace, optional semicolon, newline)
    let end = pos;
    while (end < content.length && (content[end] === ' ' || content[end] === '\t')) end++;
    if (content[end] === ';') end++;
    if (content[end] === '\n') end++;

    // Find the real start (beginning of the line for `const x = macro()`)
    let start = macroStart;
    while (start > 0 && content[start - 1] !== '\n') start--;

    return { start, end, typeParam, runtimeArg };
  }

  return null;
}

/**
 * Find withDefaults(defineProps<T>(), { ... }) pattern.
 */
function findWithDefaults(content: string): {
  start: number;
  end: number;
  typeParam: string;
  defaults: string;
} | null {
  const re = /(?:(?:const|let|var)\s+\w+\s*=\s*)?withDefaults\s*\(/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(content)) !== null) {
    let start = m.index;
    // Find line start
    while (start > 0 && content[start - 1] !== '\n') start--;

    const outerParenStart = content.indexOf('(', m.index + 'withDefaults'.length - 1);
    if (outerParenStart === -1) continue;

    const outerParen = matchBalanced(content, outerParenStart, '(', ')');
    if (!outerParen) continue;

    // Inside outerParen, find defineProps<T>()
    const inner = outerParen.content;
    const dpMatch = inner.match(/defineProps\s*/);
    if (!dpMatch) continue;

    let pos = dpMatch.index! + dpMatch[0].length;
    let typeParam: string | undefined;

    if (inner[pos] === '<') {
      const balanced = matchBalanced(inner, pos, '<', '>');
      if (balanced) {
        typeParam = balanced.content;
        pos = balanced.end + 1;
      }
    }

    // Skip the defineProps() parens
    if (inner[pos] === '(') {
      const paren = matchBalanced(inner, pos, '(', ')');
      if (paren) pos = paren.end + 1;
    }

    if (!typeParam) continue;

    // After the comma, find the defaults object
    const commaIdx = inner.indexOf(',', pos);
    if (commaIdx === -1) continue;
    const defaults = inner.slice(commaIdx + 1).trim();

    let end = outerParen.end + 1;
    // Skip trailing semicolon/newline
    while (end < content.length && (content[end] === ' ' || content[end] === '\t')) end++;
    if (content[end] === ';') end++;
    if (content[end] === '\n') end++;

    return { start, end, typeParam, defaults };
  }

  return null;
}

/**
 * Find all defineModel calls in the source.
 * Pattern: `const <varName> = defineModel<Type>("name", { options })` (multiple allowed).
 */
function findDefineModels(
  content: string,
): { start: number; end: number; model: ModelMacro }[] {
  const results: { start: number; end: number; model: ModelMacro }[] = [];
  const re = /(?:const|let|var)\s+(\w+)\s*=\s*defineModel/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const variableName = m[1];
    let pos = m.index + m[0].length;

    // Check for type parameter <...>
    let type: string | undefined;
    if (content[pos] === '<') {
      const balanced = matchBalanced(content, pos, '<', '>');
      if (balanced) {
        type = balanced.content;
        pos = balanced.end + 1;
      }
    }

    // Must have opening paren
    if (content[pos] !== '(') continue;

    const parenResult = matchBalanced(content, pos, '(', ')');
    if (!parenResult) continue;

    const argContent = parenResult.content.trim();
    pos = parenResult.end + 1;

    // Parse arguments: optional string name, optional options object
    let name: string | null = null;
    let options: string | undefined;

    if (argContent) {
      // Check if first arg is a string literal (single or double quoted)
      const stringMatch = argContent.match(/^(['"])(.*?)\1/);
      if (stringMatch) {
        name = stringMatch[2];
        // Check for options after the comma
        const afterString = argContent.slice(stringMatch[0].length).trim();
        if (afterString.startsWith(',')) {
          options = afterString.slice(1).trim();
        }
      } else if (argContent.startsWith('{')) {
        // Options object without name
        options = argContent;
      }
    }

    // Find statement end
    let end = pos;
    while (end < content.length && (content[end] === ' ' || content[end] === '\t')) end++;
    if (content[end] === ';') end++;
    if (content[end] === '\n') end++;

    // Find line start
    let start = m.index;
    while (start > 0 && content[start - 1] !== '\n') start--;

    results.push({
      start,
      end,
      model: { variableName, name, type, options },
    });
  }

  return results;
}

/**
 * Extract Vue macros and imports from script setup content.
 */
export function extractMacros(scriptContent: string, _lang?: string): ExtractedMacros {
  const s = new MagicString(scriptContent);

  const result: ExtractedMacros = {
    props: null,
    emits: null,
    slots: null,
    expose: null,
    options: null,
    models: [],
    body: '',
    imports: [],
  };

  // Extract imports first
  const { imports, ranges } = parseImports(scriptContent);
  result.imports = imports;
  for (const [start, end] of ranges) {
    s.remove(start, end);
  }

  // Extract withDefaults(defineProps<T>(), { ... }) - check before defineProps
  const wd = findWithDefaults(scriptContent);
  if (wd) {
    result.props = { type: wd.typeParam, defaults: wd.defaults };
    s.remove(wd.start, wd.end);
  }

  // Extract defineProps (only if withDefaults didn't already handle it)
  if (!result.props) {
    const dp = findMacro(scriptContent, 'defineProps');
    if (dp) {
      result.props = {};
      if (dp.typeParam) result.props.type = dp.typeParam;
      if (dp.runtimeArg) result.props.runtime = dp.runtimeArg;
      s.remove(dp.start, dp.end);
    }
  }

  // Extract defineEmits
  const de = findMacro(scriptContent, 'defineEmits');
  if (de) {
    result.emits = {};
    if (de.typeParam) result.emits.type = de.typeParam;
    if (de.runtimeArg) result.emits.runtime = de.runtimeArg;
    s.remove(de.start, de.end);
  }

  // Extract defineSlots
  const ds = findMacro(scriptContent, 'defineSlots');
  if (ds) {
    result.slots = {};
    if (ds.typeParam) result.slots.type = ds.typeParam;
    s.remove(ds.start, ds.end);
  }

  // Extract defineExpose
  const dex = findMacro(scriptContent, 'defineExpose');
  if (dex) {
    result.expose = {};
    if (dex.runtimeArg) result.expose.runtime = dex.runtimeArg;
    s.remove(dex.start, dex.end);
  }

  // Extract defineOptions
  const dopt = findMacro(scriptContent, 'defineOptions');
  if (dopt) {
    result.options = {};
    if (dopt.runtimeArg) result.options.runtime = dopt.runtimeArg;
    s.remove(dopt.start, dopt.end);
  }

  // Extract defineModel (can appear multiple times)
  const models = findDefineModels(scriptContent);
  for (const { start, end, model } of models) {
    result.models.push(model);
    s.remove(start, end);
  }

  // Clean up remaining body
  result.body = s.toString().trim();

  return result;
}
