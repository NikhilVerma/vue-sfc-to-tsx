import type { DirectiveNode, ElementNode, JsxContext } from '../types';
import { rewriteTemplateGlobals } from './utils';

export interface DirectiveResult {
  /** JSX attribute name (if converted to an attribute) */
  attr?: string;
  /** JSX attribute value expression (if converted to an attribute) */
  value?: string;
  /** Whether this directive needs LLM fallback */
  fallback?: boolean;
  /** Whether to skip processing children (v-pre) */
  skipChildren?: boolean;
  /** Whether to omit this directive entirely (v-cloak) */
  omit?: boolean;
}

/**
 * Process a Vue directive into its JSX equivalent.
 */
export function processDirective(
  dir: DirectiveNode,
  node: ElementNode,
  ctx: JsxContext,
): DirectiveResult {
  const name = dir.name;
  const arg = dir.arg ? (dir.arg as any).content : undefined;
  const rawExp = dir.exp ? (dir.exp as any).content : undefined;
  const exp = rawExp ? rewriteTemplateGlobals(rawExp, ctx) : undefined;
  const modifiers = dir.modifiers.map((m: any) =>
    typeof m === 'string' ? m : m.content,
  );

  switch (name) {
    case 'show':
      return { attr: 'v-show', value: exp ?? 'true' };

    case 'model': {
      const argSuffix = arg ? `:${arg}` : '';
      if (modifiers.length > 0) {
        const modList = modifiers.map((m) => `'${m}'`).join(', ');
        return {
          attr: `v-model${argSuffix}`,
          value: `{[${exp}, [${modList}]]}`,
        };
      }
      return { attr: `v-model${argSuffix}`, value: exp ?? 'undefined' };
    }

    case 'html':
      return { attr: 'innerHTML', value: exp ?? "''" };

    case 'text':
      return { attr: 'textContent', value: exp ?? "''" };

    case 'pre':
      return { skipChildren: true };

    case 'cloak':
      return { omit: true };

    case 'memo':
    default: {
      // Custom directives or unsupported directives -> fallback
      const source = buildDirectiveSource(dir);
      ctx.fallbacks.push({
        source,
        reason: `Directive v-${name} cannot be deterministically converted to JSX`,
        line: node.loc?.start.line,
        column: node.loc?.start.column,
      });
      return { fallback: true };
    }
  }
}

function buildDirectiveSource(dir: DirectiveNode): string {
  const arg = dir.arg ? `:${(dir.arg as any).content}` : '';
  const modifiers = dir.modifiers.map((m: any) => `.${typeof m === 'string' ? m : m.content}`).join('');
  const exp = dir.exp ? `="${(dir.exp as any).content}"` : '';
  return `v-${dir.name}${arg}${modifiers}${exp}`;
}
