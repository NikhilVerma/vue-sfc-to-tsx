import { parse as sfcParse } from "@vue/compiler-sfc";
import type { ParsedSFC } from "./types";

/**
 * Parse a Vue SFC source string into a ParsedSFC with raw AST.
 * Uses descriptor.template.ast (the raw, untransformed AST) instead of compileTemplate().
 */
export function parseSFC(source: string, filename = "anonymous.vue"): ParsedSFC {
  const { descriptor, errors } = sfcParse(source, {
    filename,
    sourceMap: false,
  });

  const result: ParsedSFC = {
    templateAst: descriptor.template?.ast ?? null,
    templateSource: descriptor.template?.content ?? null,
    scriptSetup: descriptor.scriptSetup
      ? {
          content: descriptor.scriptSetup.content,
          lang: descriptor.scriptSetup.lang,
          setup: true,
        }
      : null,
    script: descriptor.script
      ? {
          content: descriptor.script.content,
          lang: descriptor.script.lang,
          setup: false,
        }
      : null,
    styles: descriptor.styles.map((s) => ({
      content: s.content,
      scoped: s.scoped ?? false,
      lang: s.lang,
    })),
    errors: errors.map((e) => (typeof e === "string" ? e : e.message)),
  };

  return result;
}
