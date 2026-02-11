# vue-to-tsx

Convert Vue Single File Components (`.vue`) to Vue TSX (`.tsx` + `.module.css`).

This is **not** a React migration tool. The output is Vue TSX -- it stays within the Vue ecosystem, using `defineComponent`, Vue's JSX transform, and CSS modules.

## Why?

Vue's Single File Component format is a well-designed authoring experience. But it comes with a cost: `.vue` files only work with custom tooling. Your editor needs a Vue-specific extension. Your bundler needs a Vue plugin. Your linter, your test runner, your CI -- everything in the chain needs to know what a `.vue` file is.

TSX changes that. A `.tsx` file is just TypeScript. It works everywhere TypeScript works -- no plugins, no extensions, no custom language servers. You get:

- **Native TypeScript support** -- full type checking, refactoring, and go-to-definition without Volar or any editor extension
- **Standard tooling** -- any bundler, linter, test runner, or CI pipeline that supports TypeScript works out of the box
- **All of Vue's power** -- `defineComponent`, `ref`, `computed`, `watch`, slots, emits, provide/inject -- it all works in TSX
- **Full Nuxt compatibility** -- Nuxt auto-imports, composables, and middleware work identically in `.tsx` files
- **Better composition** -- components are just functions returning JSX, making it natural to compose, split, and reuse rendering logic
- **No lock-in** -- your code is portable TypeScript, not a framework-specific file format

vue-to-tsx automates the conversion so you can migrate gradually, file by file, without rewriting anything by hand.

## Features

- Template to JSX conversion (v-if/v-for/v-show/v-model, slots, events)
- `<script setup>` to `defineComponent` with full macro support (defineProps, defineEmits, defineSlots, defineExpose, defineOptions, defineModel)
- Type-based `defineEmits` converted to runtime `emits` option (call signature and Vue 3.3+ shorthand forms, including kebab-case event names)
- Automatic `.value` unwrapping for `ref`/`computed` identifiers in JSX expressions (string-literal-aware -- won't corrupt `'statement'` or `'default'` inside quotes)
- Automatic `props.` prefixing for prop identifiers in template expressions (also string-literal-aware)
- Vue built-in components (`Teleport`, `KeepAlive`, `Transition`, `TransitionGroup`, `Suspense`) auto-imported from `vue`
- Auto-imports Vue APIs used in runtime props/emits (`PropType`, `ref`, `computed`, etc.)
- `v-for` uses a runtime helper that supports arrays, objects, and numbers (matching Vue's runtime behavior)
- Static `class` and dynamic `:class` merged into a single attribute (no duplicate class props)
- `.vue` import paths automatically stripped (e.g., `import Foo from './Foo.vue'` becomes `'./Foo'`)
- Scoped CSS to CSS modules (`.module.css`)
- Handles complex patterns: v-if/v-else-if/v-else chains, dynamic components, named/scoped slots
- Optional LLM fallback for patterns that can't be converted deterministically (Anthropic and OpenAI)
- CLI for batch conversion and library API for programmatic use

## Installation

```bash
# bun
bun add -d vue-to-tsx

# npm
npm install -D vue-to-tsx

# pnpm
pnpm add -D vue-to-tsx
```

## CLI usage

```bash
# Convert a single file
vue-to-tsx src/components/MyComponent.vue

# Convert a directory recursively
vue-to-tsx src/components/

# Convert and delete original .vue files (in-place replacement)
vue-to-tsx src/components/ --delete

# Convert with LLM fallback for complex patterns
vue-to-tsx src/components/ --llm

# Write output to a specific directory
vue-to-tsx src/components/ --out-dir converted/

# Preview what would happen without writing anything
vue-to-tsx src/components/ --dry-run --delete
```

## Library API

```ts
import { convert } from 'vue-to-tsx';

const source = `
<template>
  <div class="container">
    <h1>{{ title }}</h1>
    <button @click="handleClick">Click me</button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ title: string }>();
const emit = defineEmits<{ click: [] }>();

function handleClick() {
  emit('click');
}
</script>

<style scoped>
.container {
  padding: 16px;
}
</style>
`;

const result = await convert(source, {
  componentName: 'MyComponent',
});

console.log(result.tsx);        // The generated .tsx file
console.log(result.css);        // The generated .module.css file (or null)
console.log(result.warnings);   // Any conversion warnings
console.log(result.fallbacks);  // Items that need manual review
```

## How it works

1. **Template to JSX** -- The Vue template AST (from `@vue/compiler-sfc`) is walked and converted to JSX. Directives like `v-if` become ternary expressions, `v-for` uses a runtime helper (`_renderList`) that handles arrays, objects, and numbers, `@click` becomes `onClick`, etc.

2. **Script setup to defineComponent** -- `<script setup>` macros (`defineProps`, `defineEmits`, `defineSlots`, etc.) are extracted and rewritten into a `defineComponent` call with proper `setup()` function.

3. **Scoped CSS to CSS modules** -- `<style scoped>` blocks are converted to `.module.css` files. Class references in the template are rewritten to use `styles.className` syntax.

4. **LLM fallback** -- When a template pattern can't be converted deterministically (e.g., complex custom directives), it's marked with a fallback comment. With `--llm` enabled, these are sent to an LLM for resolution.

## Output formatting

The converter produces syntactically valid TSX but does not format or prettify it. Run your project's formatter on the output files to match your codebase style:

```bash
# Prettier
bunx prettier --write "src/**/*.tsx"

# Biome
bunx biome format --write "src/**/*.tsx"

# dprint
bunx dprint fmt "src/**/*.tsx"
```

## LLM-powered fallback

The deterministic converter handles the vast majority of Vue patterns -- `v-if`/`v-for`/`v-show`, `v-model`, slots, events, macros, CSS modules, and more. But roughly 5% of real-world Vue code uses patterns that have no single correct JSX translation. For these, vue-to-tsx offers an AI-powered fallback that understands Vue semantics and produces idiomatic JSX.

### What triggers the fallback

- **Custom directives** -- `v-focus`, `v-tooltip`, `v-click-outside`, and any app-specific directives
- **`v-memo`** -- performance hint with no direct JSX equivalent
- **Complex slot forwarding** -- dynamically passing through `$slots` to child components
- **Dynamic components with complex `:is`** -- `<component :is="someCondition ? CompA : CompB" />` with non-trivial expressions

### Without `--llm`

These patterns are marked with a `// TODO: vue-to-tsx` comment so you can resolve them manually:

```tsx
{/* TODO: vue-to-tsx - Custom directive "v-tooltip" cannot be converted deterministically */}
{/* Original: <span v-tooltip="helpText">Hover me</span> */}
```

### With `--llm`

The same pattern is intelligently converted, producing a working JSX equivalent:

```tsx
<Tooltip text={helpText.value}>
  <span>Hover me</span>
</Tooltip>
```

All fallback items in a file are **batched into a single API call**, so even a file with multiple custom directives only makes one request. This keeps costs low and latency minimal.

### Setup

Set an API key for your preferred provider:

```bash
# Anthropic (default if both are set)
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
export OPENAI_API_KEY=sk-...
```

The provider is auto-detected from whichever API key is set. If both are set, Anthropic is preferred. You can override this with `VUE_TO_TSX_LLM_PROVIDER`:

```bash
export VUE_TO_TSX_LLM_PROVIDER=openai  # force OpenAI even if ANTHROPIC_API_KEY is set
```

Then pass `--llm` to the CLI:

```bash
vue-to-tsx src/components/ --llm
```

### Model override

Default models: `claude-sonnet-4-5` (Anthropic), `gpt-4o` (OpenAI). Override via CLI flag or env var:

```bash
# CLI flag
vue-to-tsx src/components/ --llm --llm-model gpt-4o-mini

# Environment variable
export VUE_TO_TSX_LLM_MODEL=claude-haiku-4-5-20251001
```

### Programmatic usage

```ts
const result = await convert(source, {
  componentName: 'MyComponent',
  llm: true,
  llmModel: 'claude-sonnet-4-5',
});
```

## Options

The `convert()` function accepts an options object:

```ts
interface ConvertOptions {
  componentName?: string;  // Component name (derived from filename if not provided)
  llm?: boolean;           // Enable LLM fallback (default: false)
  llmModel?: string;       // LLM model to use (auto-detected from provider)
}
```

| Option | CLI flag | Default | Description |
|--------|----------|---------|-------------|
| `componentName` | (from filename) | PascalCase of filename | Name used in `defineComponent` |
| `llm` | `--llm` | `false` | Enable AI-powered fallback for unconvertible patterns |
| `llmModel` | `--llm-model` | Auto (provider-dependent) | LLM model ID for fallback resolution |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
