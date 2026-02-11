import type {
  RootNode,
  TemplateChildNode,
  ElementNode,
  TextNode,
  InterpolationNode,
  CommentNode,
  AttributeNode,
  DirectiveNode,
  SimpleExpressionNode,
  CompoundExpressionNode,
} from "@vue/compiler-core";

// Re-export AST types for convenience
export type {
  RootNode,
  TemplateChildNode,
  ElementNode,
  TextNode,
  InterpolationNode,
  CommentNode,
  AttributeNode,
  DirectiveNode,
  SimpleExpressionNode,
  CompoundExpressionNode,
};

/** Result of converting a single .vue file */
export interface ConvertResult {
  /** The generated .tsx file content */
  tsx: string;
  /** CSS file content, if styles existed */
  css: string | null;
  /** CSS filename (e.g. "MyComponent.css") */
  cssFilename: string | null;
  /** Warnings generated during conversion */
  warnings: ConvertWarning[];
  /** Items that need LLM fallback */
  fallbacks: FallbackItem[];
}

export interface ConvertWarning {
  message: string;
  line?: number;
  column?: number;
}

export interface FallbackItem {
  /** The original Vue template snippet */
  source: string;
  /** Why it couldn't be converted deterministically */
  reason: string;
  /** Location in the original .vue file */
  line?: number;
  column?: number;
}

export interface ConvertOptions {
  /** Component name (derived from filename if not provided) */
  componentName?: string;
  /** Enable LLM fallback for unconvertible patterns */
  llm?: boolean;
  /** LLM model to use (default: claude-sonnet-4-5) */
  llmModel?: string;
}

/** Parsed SFC descriptor with raw AST */
export interface ParsedSFC {
  /** Raw template AST (not compiled) */
  templateAst: RootNode | null;
  /** Raw template source */
  templateSource: string | null;
  /** Script setup content */
  scriptSetup: ScriptBlock | null;
  /** Regular script content */
  script: ScriptBlock | null;
  /** Style blocks */
  styles: StyleBlock[];
  /** Errors from parsing */
  errors: string[];
}

export interface ScriptBlock {
  content: string;
  lang: string | undefined;
  setup: boolean;
}

export interface StyleBlock {
  content: string;
  scoped: boolean;
  lang: string | undefined;
}

/** Parsed prop info from type-based defineProps */
export interface PropInfo {
  name: string;
  type: string;
  optional: boolean;
}

/** Extracted macro information from script setup */
export interface ExtractedMacros {
  /** defineProps type parameter or runtime argument */
  props: { type?: string; runtime?: string; defaults?: string } | null;
  /** defineEmits type parameter or runtime argument */
  emits: { type?: string; runtime?: string } | null;
  /** defineSlots type parameter */
  slots: { type?: string } | null;
  /** defineExpose argument */
  expose: { runtime?: string } | null;
  /** defineOptions argument */
  options: { runtime?: string } | null;
  /** defineModel macro calls (Vue 3.4+) */
  models: ModelMacro[];
  /** The remaining script body after macro removal */
  body: string;
  /** Imports extracted from the script */
  imports: ImportInfo[];
  /** Side-effect imports (e.g. `import './polyfill'`) */
  rawImports: string[];
  /** Export statements (e.g. `export type { Foo }`) */
  rawExports: string[];
}

export interface ModelMacro {
  /** Variable name assigned to (e.g., "visible") */
  variableName: string;
  /** Model name (e.g., "visible"). Null = default "modelValue" */
  name: string | null;
  /** Type parameter (e.g., "boolean") */
  type?: string;
  /** Options object string (e.g., "{ default: false }") */
  options?: string;
}

export interface ImportInfo {
  source: string;
  defaultImport?: string;
  namedImports: { imported: string; local: string }[];
  namespaceImport?: string;
  typeOnly: boolean;
}

/** Map of original class names to CSS class references */
export type ClassMap = Map<string, string>;

/** Style extraction result */
export interface StyleResult {
  /** Style file content (CSS, SCSS, Less — kept as-is, not compiled) */
  css: string;
  /** Map of class names found in the styles */
  classMap: ClassMap;
  /** Original preprocessor language (e.g. 'scss', 'less') or undefined for plain CSS */
  lang: string | undefined;
  /** Warnings from style processing */
  warnings: string[];
}

/** JSX generation context passed through the walker */
export interface JsxContext {
  /** Indentation level */
  indent: number;
  /** CSS class map */
  classMap: ClassMap;
  /** Accumulated warnings */
  warnings: ConvertWarning[];
  /** Accumulated fallback items */
  fallbacks: FallbackItem[];
  /** Component name */
  componentName: string;
  /** Setup context members used in the template (slots, attrs, emit) */
  usedContextMembers: Set<string>;
  /** Variable names that are refs/computed and need .value in JSX */
  refIdentifiers: Set<string>;
  /** Prop names that need props. prefix in template expressions */
  propIdentifiers: Set<string>;
  /** Whether any v-for directive was encountered (triggers _renderList helper) */
  hasVFor: boolean;
  /** Vue built-in components used in template (Teleport, KeepAlive, etc.) */
  usedBuiltins: Set<string>;
}
