import type { ConvertResult, ConvertOptions, ImportInfo, JsxContext } from "./types";
import { parseSFC } from "./parser";
import { extractStyles, getStyleFilename } from "./style/index";
import { templateToJsx } from "./template/index";
import { scriptToDefineComponent, extractMacros } from "./script/index";
import { detectRefIdentifiers, parsePropTypes, detectLocalIdentifiers } from "./script/macros";
import { generateFallbackComment, resolveFallbacks } from "./llm/index";

export type { ConvertResult, ConvertOptions } from "./types";
export { parseSFC } from "./parser";

/**
 * Convert a Vue Single File Component (.vue) to Vue TSX (.tsx + .css).
 *
 * @param source - The .vue file content
 * @param options - Conversion options
 * @returns The conversion result with tsx, css, warnings, and fallbacks
 */
export async function convert(source: string, options?: ConvertOptions): Promise<ConvertResult> {
  const componentName = options?.componentName ?? "Component";

  // 1. Parse SFC
  const parsed = parseSFC(source);

  if (parsed.errors.length > 0) {
    return {
      tsx: "",
      css: null,
      cssFilename: null,
      warnings: parsed.errors.map((e) => ({ message: e })),
      fallbacks: [],
    };
  }

  // 2. Extract styles → get classMap and CSS
  const styleResult = extractStyles(parsed.styles, componentName);
  const classMap = styleResult?.classMap ?? new Map();
  const css = styleResult?.css ?? null;
  const cssFilename = styleResult ? getStyleFilename(componentName, styleResult.lang) : null;
  const styleWarnings = styleResult?.warnings ?? [];

  // 3. Detect ref identifiers and prop identifiers from script setup
  let refIdentifiers = new Set<string>();
  let propIdentifiers = new Set<string>();
  let scriptMacros = parsed.scriptSetup
    ? extractMacros(parsed.scriptSetup.content, parsed.scriptSetup.lang)
    : null;
  if (parsed.scriptSetup && scriptMacros) {
    const macros = scriptMacros;
    refIdentifiers = detectRefIdentifiers(macros.body, macros.models);

    // Parse prop names from type-based or runtime defineProps.
    // `resolvedTypeBody` is set when the type is an identifier with an extends clause —
    // it contains just the inline body (without inherited props) for name extraction.
    let propNames: string[] = [];
    const propTypeBody = macros.props?.resolvedTypeBody ?? macros.props?.type;
    if (propTypeBody) {
      propNames = parsePropTypes(propTypeBody).map((p) => p.name);
    } else if (macros.props?.runtime) {
      // Extract prop names from runtime object: { name: ..., name2: ... }
      const runtimeMatch = macros.props.runtime.match(/(\w+)\s*:/g);
      if (runtimeMatch) {
        propNames = runtimeMatch.map((m) => m.replace(/\s*:$/, ""));
      }
    }

    // If the type was unresolvable OR has an extends clause (inherited props unknown),
    // also merge withDefaults defaults keys so those props get the props. prefix.
    const hasUnresolvedInherited = macros.props?.resolvedTypeBody !== undefined;
    if ((propNames.length === 0 || hasUnresolvedInherited) && macros.props?.defaults) {
      const defaultKeys = macros.props.defaults.match(/\b(\w+)\s*:/g);
      if (defaultKeys) {
        for (const k of defaultKeys) {
          const name = k.replace(/\s*:$/, "").trim();
          if (!propNames.includes(name)) propNames.push(name);
        }
      }
    }

    if (propNames.length > 0) {
      // Detect locally declared identifiers (const/let/var, destructuring, function)
      const localIds = detectLocalIdentifiers(macros.body);
      // Props that are also local variables (e.g. via toRefs destructuring) or refs
      // should NOT get the props. prefix
      for (const name of propNames) {
        if (!localIds.has(name) && !refIdentifiers.has(name)) {
          propIdentifiers.add(name);
        }
      }
    }
  }

  // 4. Create JsxContext
  const ctx: JsxContext = {
    indent: 0,
    classMap,
    warnings: [],
    fallbacks: [],
    componentName,
    usedContextMembers: new Set(),
    refIdentifiers,
    propIdentifiers,
    hasVFor: false,
    usedBuiltins: new Set(),
    usedComponents: new Set(),
  };

  // 4. Generate JSX body from template
  let jsxBody = "<></>";
  if (parsed.templateAst) {
    jsxBody = templateToJsx(parsed.templateAst, ctx);
  }

  // 5. Build additional imports (e.g., styles import)
  const additionalImports: ImportInfo[] = [];
  if (cssFilename) {
    additionalImports.push({
      source: `./${cssFilename}`,
      namedImports: [],
      typeOnly: false,
    });
  }

  // 6. Add imports for Vue built-in components used in template (Teleport, KeepAlive, etc.)
  if (ctx.usedBuiltins.size > 0) {
    for (const builtin of ctx.usedBuiltins) {
      additionalImports.push({
        source: "vue",
        namedImports: [{ imported: builtin, local: builtin }],
        typeOnly: false,
      });
    }
  }

  // 7. Nuxt: auto-import unresolved PascalCase components from '#components'
  if (options?.nuxt && ctx.usedComponents.size > 0) {
    // Collect names already imported in the script
    const knownNames = new Set<string>();
    if (scriptMacros) {
      for (const imp of scriptMacros.imports) {
        if (imp.defaultImport) knownNames.add(imp.defaultImport);
        if (imp.namespaceImport) knownNames.add(imp.namespaceImport);
        for (const n of imp.namedImports) knownNames.add(n.local);
      }
    }
    for (const b of ctx.usedBuiltins) knownNames.add(b);

    const toImport = [...ctx.usedComponents].filter((n) => !knownNames.has(n)).sort();
    if (toImport.length > 0) {
      additionalImports.push({
        source: "#components",
        namedImports: toImport.map((n) => ({ imported: n, local: n })),
        typeOnly: false,
      });
    }
  }

  // 9. Generate the full TSX output via script module
  let tsx = scriptToDefineComponent(parsed, jsxBody, additionalImports, ctx.usedContextMembers, {
    hasVFor: ctx.hasVFor,
  });

  // 10. LLM fallback resolution (if enabled and there are fallbacks)
  if (options?.llm && ctx.fallbacks.length > 0) {
    const replacements = await resolveFallbacks(ctx.fallbacks, componentName, {
      model: options.llmModel,
      sourceVue: source,
      generatedTsx: tsx,
    });
    for (const fallback of ctx.fallbacks) {
      const replacement = replacements.get(fallback.source);
      if (replacement) {
        // Replace the TODO comment that was inserted into the TSX
        const comment = generateFallbackComment(fallback);
        tsx = tsx.replace(comment, replacement);
      }
    }
  }

  return {
    tsx,
    css,
    cssFilename,
    warnings: [...styleWarnings.map((msg) => ({ message: msg })), ...ctx.warnings],
    fallbacks: ctx.fallbacks,
  };
}
