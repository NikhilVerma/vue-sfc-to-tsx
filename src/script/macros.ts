import MagicString from "magic-string";
import type { ExtractedMacros, ImportInfo, ModelMacro, PropInfo } from "../types";

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

  // Find each `import` keyword at the start of a line
  const importStartRe = /^[ \t]*import\s+/gm;
  let m: RegExpExecArray | null;

  while ((m = importStartRe.exec(content)) !== null) {
    const stmtStart = m.index;
    let pos = m.index + m[0].length;

    // Check for `type` keyword (import type ...)
    const typeMatch = content.slice(pos).match(/^type\s+/);
    let typeOnly = false;
    if (typeMatch) {
      typeOnly = true;
      pos += typeMatch[0].length;
    }

    // Side-effect import: import 'foo' or import "foo"
    const quoteAtStart = content[pos];
    if (quoteAtStart === "'" || quoteAtStart === '"') {
      // This is a side-effect import, skip it (handled separately)
      continue;
    }

    // namespace import: * as foo from '...'
    const nsMatch = content.slice(pos).match(/^\*\s+as\s+(\w+)\s+from\s+(['"])(.+?)\2\s*;?/);
    if (nsMatch) {
      const endIdx = pos + nsMatch[0].length;
      imports.push({
        source: nsMatch[3],
        namedImports: [],
        namespaceImport: nsMatch[1],
        typeOnly,
      });
      ranges.push([stmtStart, endIdx]);
      importStartRe.lastIndex = endIdx;
      continue;
    }

    // Parse clause: everything before `from`
    // Handle multiline by scanning for `from` keyword followed by a string
    let fromPos = -1;

    // If there's a `{`, find the matching `}`
    const restFromPos = content.slice(pos);
    const braceIdx = restFromPos.indexOf("{");
    const firstFrom = restFromPos.match(/\bfrom\s+['"]/);

    if (braceIdx !== -1 && (!firstFrom || braceIdx < firstFrom.index!)) {
      // Has braces - find matching close brace
      const braceAbsIdx = pos + braceIdx;
      const balanced = matchBalanced(content, braceAbsIdx, "{", "}");
      if (!balanced) continue;

      const afterBrace = balanced.end + 1;
      // Now find `from` after the closing brace
      const fromMatch = content.slice(afterBrace).match(/^\s*from\s+(['"])(.+?)\1\s*;?/);
      if (!fromMatch) continue;
      fromPos = afterBrace + fromMatch[0].length;

      const source = fromMatch[2];
      const info: ImportInfo = { source, namedImports: [], typeOnly };

      // Extract before-brace part (default import)
      const beforeBrace = content.slice(pos, braceAbsIdx).trim().replace(/,\s*$/, "").trim();
      if (beforeBrace) {
        info.defaultImport = beforeBrace;
      }

      // Extract named imports from brace content
      const namedPart = balanced.content.trim();
      if (namedPart) {
        for (const part of namedPart.split(",")) {
          const trimmed = part.trim();
          if (!trimmed) continue;
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

      imports.push(info);
      ranges.push([stmtStart, fromPos]);
      importStartRe.lastIndex = fromPos;
    } else {
      // No braces - default import or simple named: `import Foo from '...'`
      const simpleMatch = content.slice(pos).match(/^(.+?)\s+from\s+(['"])(.+?)\2\s*;?/);
      if (!simpleMatch) continue;

      const endIdx = pos + simpleMatch[0].length;
      const info: ImportInfo = {
        source: simpleMatch[3],
        namedImports: [],
        typeOnly,
      };
      info.defaultImport = simpleMatch[1].trim();

      imports.push(info);
      ranges.push([stmtStart, endIdx]);
      importStartRe.lastIndex = endIdx;
    }
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
    `(?:(?:const|let|var)\\s+\\w+\\s*=\\s*)?${macroName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "g",
  );

  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const macroStart = m.index;
    const afterMacro = m.index + m[0].length;

    let typeParam: string | undefined;
    let runtimeArg: string | undefined;
    let pos = afterMacro;

    // Check for type parameter <...>
    if (content[pos] === "<") {
      const balanced = matchBalanced(content, pos, "<", ">");
      if (balanced) {
        typeParam = balanced.content;
        pos = balanced.end + 1;
      }
    }

    // Must have opening paren
    if (content[pos] !== "(") continue;

    const parenResult = matchBalanced(content, pos, "(", ")");
    if (!parenResult) continue;

    const argContent = parenResult.content.trim();
    if (argContent && !typeParam) {
      runtimeArg = argContent;
    }

    pos = parenResult.end + 1;

    // Find the end of the statement (skip whitespace, optional semicolon, newline)
    let end = pos;
    while (end < content.length && (content[end] === " " || content[end] === "\t")) end++;
    if (content[end] === ";") end++;
    if (content[end] === "\n") end++;

    // Find the real start (beginning of the line for `const x = macro()`)
    let start = macroStart;
    while (start > 0 && content[start - 1] !== "\n") start--;

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
    while (start > 0 && content[start - 1] !== "\n") start--;

    const outerParenStart = content.indexOf("(", m.index + "withDefaults".length - 1);
    if (outerParenStart === -1) continue;

    const outerParen = matchBalanced(content, outerParenStart, "(", ")");
    if (!outerParen) continue;

    // Inside outerParen, find defineProps<T>()
    const inner = outerParen.content;
    const dpMatch = inner.match(/defineProps\s*/);
    if (!dpMatch) continue;

    let pos = dpMatch.index! + dpMatch[0].length;
    let typeParam: string | undefined;

    if (inner[pos] === "<") {
      const balanced = matchBalanced(inner, pos, "<", ">");
      if (balanced) {
        typeParam = balanced.content;
        pos = balanced.end + 1;
      }
    }

    // Skip the defineProps() parens
    if (inner[pos] === "(") {
      const paren = matchBalanced(inner, pos, "(", ")");
      if (paren) pos = paren.end + 1;
    }

    if (!typeParam) continue;

    // After the comma, find the defaults object
    const commaIdx = inner.indexOf(",", pos);
    if (commaIdx === -1) continue;
    const defaults = inner.slice(commaIdx + 1).trim();

    let end = outerParen.end + 1;
    // Skip trailing semicolon/newline
    while (end < content.length && (content[end] === " " || content[end] === "\t")) end++;
    if (content[end] === ";") end++;
    if (content[end] === "\n") end++;

    return { start, end, typeParam, defaults };
  }

  return null;
}

/**
 * Find all defineModel calls in the source.
 * Pattern: `const <varName> = defineModel<Type>("name", { options })` (multiple allowed).
 */
function findDefineModels(content: string): { start: number; end: number; model: ModelMacro }[] {
  const results: { start: number; end: number; model: ModelMacro }[] = [];
  const re = /(?:const|let|var)\s+(\w+)\s*=\s*defineModel/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const variableName = m[1];
    let pos = m.index + m[0].length;

    // Check for type parameter <...>
    let type: string | undefined;
    if (content[pos] === "<") {
      const balanced = matchBalanced(content, pos, "<", ">");
      if (balanced) {
        type = balanced.content;
        pos = balanced.end + 1;
      }
    }

    // Must have opening paren
    if (content[pos] !== "(") continue;

    const parenResult = matchBalanced(content, pos, "(", ")");
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
        if (afterString.startsWith(",")) {
          options = afterString.slice(1).trim();
        }
      } else if (argContent.startsWith("{")) {
        // Options object without name
        options = argContent;
      }
    }

    // Find statement end
    let end = pos;
    while (end < content.length && (content[end] === " " || content[end] === "\t")) end++;
    if (content[end] === ";") end++;
    if (content[end] === "\n") end++;

    // Find line start
    let start = m.index;
    while (start > 0 && content[start - 1] !== "\n") start--;

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
    body: "",
    imports: [],
    rawImports: [],
    rawExports: [],
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
    const dp = findMacro(scriptContent, "defineProps");
    if (dp) {
      result.props = {};
      if (dp.typeParam) result.props.type = dp.typeParam;
      if (dp.runtimeArg) result.props.runtime = dp.runtimeArg;
      s.remove(dp.start, dp.end);
    }
  }

  // Extract defineEmits
  const de = findMacro(scriptContent, "defineEmits");
  if (de) {
    result.emits = {};
    if (de.typeParam) result.emits.type = de.typeParam;
    if (de.runtimeArg) result.emits.runtime = de.runtimeArg;
    s.remove(de.start, de.end);
  }

  // Extract defineSlots
  const ds = findMacro(scriptContent, "defineSlots");
  if (ds) {
    result.slots = {};
    if (ds.typeParam) result.slots.type = ds.typeParam;
    s.remove(ds.start, ds.end);
  }

  // Extract defineExpose
  const dex = findMacro(scriptContent, "defineExpose");
  if (dex) {
    result.expose = {};
    if (dex.runtimeArg) result.expose.runtime = dex.runtimeArg;
    s.remove(dex.start, dex.end);
  }

  // Extract defineOptions
  const dopt = findMacro(scriptContent, "defineOptions");
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

  // Extract side-effect imports (import './foo') from remaining body
  const currentBody = s.toString();
  const sideEffectRe = /^[ \t]*import\s+(['"])(.+?)\1\s*;?[ \t]*$/gm;
  let seMatch: RegExpExecArray | null;
  const sideEffectRanges: [number, number][] = [];
  while ((seMatch = sideEffectRe.exec(currentBody)) !== null) {
    result.rawImports.push(seMatch[0].trim());
    sideEffectRanges.push([seMatch.index, seMatch.index + seMatch[0].length]);
  }

  // Extract all export statements from remaining body.
  // Exports can't live inside setup(), so they must be hoisted to module level.
  // Handles multiline: export type Foo = ...; export interface Foo { ... }; export { ... }
  const exportRanges: [number, number][] = [];
  const exportStartRe = /^[ \t]*export\s+/gm;
  let exMatch: RegExpExecArray | null;
  while ((exMatch = exportStartRe.exec(currentBody)) !== null) {
    const stmtStart = exMatch.index;
    const afterKeyword = stmtStart + exMatch[0].length;
    let stmtEnd = -1;

    // Check if the export contains braces (type/interface body, re-export braces, etc.)
    // Scan forward to find the end of the statement
    // Find first brace or semicolon or newline-not-followed-by-continuation
    let pos = afterKeyword;
    let braceDepth = 0;
    let foundBrace = false;

    while (pos < currentBody.length) {
      const ch = currentBody[pos];
      if (ch === "{") {
        braceDepth++;
        foundBrace = true;
      } else if (ch === "}") {
        braceDepth--;
        if (foundBrace && braceDepth === 0) {
          // End of braced block - check for trailing `from '...'` (re-exports)
          pos++;
          while (
            pos < currentBody.length &&
            (currentBody[pos] === " " || currentBody[pos] === "\t")
          )
            pos++;
          const trailing = currentBody.slice(pos);
          const fromMatch = trailing.match(/^from\s+(['"])(.+?)\1\s*;?/);
          if (fromMatch) {
            pos += fromMatch[0].length;
          } else if (pos < currentBody.length && currentBody[pos] === ";") {
            pos++;
          }
          stmtEnd = pos;
          break;
        }
      } else if (ch === ";" && braceDepth === 0) {
        stmtEnd = pos + 1;
        break;
      } else if (ch === "\n" && braceDepth === 0 && !foundBrace) {
        // Newline outside braces - check if next non-empty line is a continuation
        // Continuations: lines starting with |, &, whitespace followed by |/&
        const nextLineMatch = currentBody.slice(pos + 1).match(/^([ \t]*)(.*)/);
        if (nextLineMatch) {
          const nextContent = nextLineMatch[2];
          if (nextContent.startsWith("|") || nextContent.startsWith("&")) {
            // Continuation line (union/intersection type)
            pos++;
            continue;
          }
        }
        stmtEnd = pos;
        break;
      }
      pos++;
    }

    if (stmtEnd === -1) stmtEnd = currentBody.length;

    const exported = currentBody.slice(stmtStart, stmtEnd).trim();
    result.rawExports.push(exported);
    exportRanges.push([stmtStart, stmtEnd]);
    exportStartRe.lastIndex = stmtEnd;
  }

  // Remove extracted side-effect imports and exports from body using a new MagicString
  if (sideEffectRanges.length > 0 || exportRanges.length > 0) {
    const s2 = new MagicString(currentBody);
    for (const [start, end] of [...sideEffectRanges, ...exportRanges]) {
      s2.remove(start, end);
    }
    result.body = s2.toString().trim();
  } else {
    // Clean up remaining body
    result.body = currentBody.trim();
  }

  return result;
}

/** Vue APIs that return a Ref (need .value in JSX) */
const REF_CREATORS = new Set([
  "ref",
  "computed",
  "shallowRef",
  "toRef",
  "customRef",
  "shallowComputed",
]);

/**
 * Detect variable names that are refs/computed from script setup body.
 * These need `.value` appended when used in JSX (Vue templates auto-unwrap, JSX doesn't).
 */
export function detectRefIdentifiers(body: string, models: ModelMacro[]): Set<string> {
  const refs = new Set<string>();

  // Match: const/let/var <name> = ref( | computed( | shallowRef( | etc.
  const re = /(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\s*[<(]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const varName = m[1];
    const fnName = m[2];
    if (REF_CREATORS.has(fnName) || /^use[A-Z]/.test(fnName)) {
      refs.add(varName);
    }
  }

  // Match: const { a, b } = toRefs(props) — each destructured name is a ref
  const destructRe = /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*(\w+)\s*\(/g;
  while ((m = destructRe.exec(body)) !== null) {
    const fnName = m[2];
    if (fnName === "toRefs" || REF_CREATORS.has(fnName)) {
      for (const part of m[1].split(",")) {
        const trimmed = part.trim();
        const aliasMatch = trimmed.match(/^\w+\s*:\s*(\w+)/);
        if (aliasMatch) {
          refs.add(aliasMatch[1]);
        } else if (/^\w+$/.test(trimmed)) {
          refs.add(trimmed);
        }
      }
    }
  }

  // defineModel variables are converted to computed refs
  for (const model of models) {
    refs.add(model.variableName);
  }

  return refs;
}

/**
 * Parse a TypeScript interface/type body (e.g. `{ indent: number; visible?: boolean }`)
 * into structured PropInfo[].
 */
export function parsePropTypes(typeStr: string): PropInfo[] {
  const props: PropInfo[] = [];
  let body = typeStr.trim();

  // Strip outer braces
  if (body.startsWith("{")) body = body.slice(1);
  if (body.endsWith("}")) body = body.slice(0, -1);
  body = body.trim();
  if (!body) return props;

  // Split on `;` or newlines at top level (respecting nested braces/parens/angles)
  const entries: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{" || ch === "(" || ch === "<") depth++;
    else if (ch === "}" || ch === ")" || ch === ">") depth--;

    if (depth === 0 && (ch === ";" || ch === "\n")) {
      const trimmed = current.trim();
      if (trimmed) entries.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }
  const last = current.trim();
  if (last) entries.push(last);

  for (let entry of entries) {
    entry = entry.trim().replace(/;$/, "").trim();
    if (!entry) continue;
    // Match: name?: type  or  name: type
    const match = entry.match(/^\s*(\w+)\s*(\?)?\s*:\s*(.+)$/s);
    if (match) {
      props.push({
        name: match[1],
        type: match[3].trim(),
        optional: match[2] === "?",
      });
    }
  }

  return props;
}

/**
 * Detect locally-declared variable names from a script body.
 * Finds: const/let/var NAME, const { NAME, NAME } = ..., function NAME
 */
export function detectLocalIdentifiers(body: string): Set<string> {
  const ids = new Set<string>();

  // const/let/var NAME = ...
  const varRe = /(?:const|let|var)\s+(\w+)\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(body)) !== null) {
    ids.add(m[1]);
  }

  // const/let/var { NAME, NAME } = ... (destructuring)
  const destructRe = /(?:const|let|var)\s+\{([^}]+)\}\s*=/g;
  while ((m = destructRe.exec(body)) !== null) {
    for (const part of m[1].split(",")) {
      const trimmed = part.trim();
      // Handle `name: alias` destructuring
      const aliasMatch = trimmed.match(/^\w+\s*:\s*(\w+)/);
      if (aliasMatch) {
        ids.add(aliasMatch[1]);
      } else if (/^\w+$/.test(trimmed)) {
        ids.add(trimmed);
      }
    }
  }

  // function NAME(
  const fnRe = /function\s+(\w+)\s*\(/g;
  while ((m = fnRe.exec(body)) !== null) {
    ids.add(m[1]);
  }

  return ids;
}
