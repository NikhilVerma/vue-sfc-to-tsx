import type { ConvertResult, ConvertOptions, ImportInfo, JsxContext } from './types';
import { parseSFC } from './parser';
import { extractStyles, getStyleFilename } from './style/index';
import { templateToJsx } from './template/index';
import { scriptToDefineComponent } from './script/index';
import { generateFallbackComment, resolveFallbacks } from './llm/index';

export type { ConvertResult, ConvertOptions } from './types';
export { parseSFC } from './parser';

/**
 * Convert a Vue Single File Component (.vue) to Vue TSX (.tsx + .module.css).
 *
 * @param source - The .vue file content
 * @param options - Conversion options
 * @returns The conversion result with tsx, css, warnings, and fallbacks
 */
export async function convert(
  source: string,
  options?: ConvertOptions,
): Promise<ConvertResult> {
  const componentName = options?.componentName ?? 'Component';

  // 1. Parse SFC
  const parsed = parseSFC(source);

  if (parsed.errors.length > 0) {
    return {
      tsx: '',
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
  const cssFilename = styleResult ? getStyleFilename(componentName) : null;

  // 3. Create JsxContext
  const ctx: JsxContext = {
    indent: 0,
    classMap,
    warnings: [],
    fallbacks: [],
    componentName,
    usedContextMembers: new Set(),
  };

  // 4. Generate JSX body from template
  let jsxBody = '<></>';
  if (parsed.templateAst) {
    jsxBody = templateToJsx(parsed.templateAst, ctx);
  }

  // 5. Build additional imports (e.g., styles import)
  const additionalImports: ImportInfo[] = [];
  if (cssFilename) {
    additionalImports.push({
      source: `./${cssFilename}`,
      defaultImport: 'styles',
      namedImports: [],
      typeOnly: false,
    });
  }

  // 7. Generate the full TSX output via script module
  let tsx = scriptToDefineComponent(parsed, jsxBody, additionalImports, ctx.usedContextMembers);

  // 8. LLM fallback resolution (if enabled and there are fallbacks)
  if (options?.llm && ctx.fallbacks.length > 0) {
    const replacements = await resolveFallbacks(ctx.fallbacks, componentName, {
      model: options.llmModel,
    });
    for (const [originalSource, replacement] of replacements) {
      const comment = generateFallbackComment({
        source: originalSource,
        reason: '',
      });
      tsx = tsx.replace(comment, replacement);
    }
  }

  return {
    tsx,
    css,
    cssFilename,
    warnings: ctx.warnings,
    fallbacks: ctx.fallbacks,
  };
}
