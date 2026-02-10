# vue-sfc-to-tsx

Convert Vue Single File Components (`.vue`) to Vue TSX (`.tsx` + `.module.css`).

This is **not** a React migration tool. The output is Vue TSX -- it stays within the Vue ecosystem, using `defineComponent`, Vue's JSX transform, and CSS modules.

## Features

- Template to JSX conversion (v-if/v-for/v-show/v-model, slots, events)
- `<script setup>` to `defineComponent` with full macro support (defineProps, defineEmits, defineSlots, defineExpose, defineOptions)
- Scoped CSS to CSS modules (`.module.css`)
- Handles complex patterns: v-if/v-else-if/v-else chains, dynamic components, named/scoped slots
- Optional LLM fallback for patterns that can't be converted deterministically
- CLI for batch conversion and library API for programmatic use

## Installation

```bash
# bun
bun add -d vue-sfc-to-tsx

# npm
npm install -D vue-sfc-to-tsx

# pnpm
pnpm add -D vue-sfc-to-tsx
```

## CLI usage

```bash
# Convert a single file
vue-to-tsx src/components/MyComponent.vue

# Convert a directory recursively
vue-to-tsx src/components/

# Convert with LLM fallback for complex patterns
vue-to-tsx src/components/ --llm

# Write output to a specific directory
vue-to-tsx src/components/ --out-dir converted/
```

## Library API

```ts
import { convert } from 'vue-sfc-to-tsx';

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

1. **Template to JSX** -- The Vue template AST (from `@vue/compiler-sfc`) is walked and converted to JSX. Directives like `v-if` become ternary expressions, `v-for` becomes `.map()`, `@click` becomes `onClick`, etc.

2. **Script setup to defineComponent** -- `<script setup>` macros (`defineProps`, `defineEmits`, `defineSlots`, etc.) are extracted and rewritten into a `defineComponent` call with proper `setup()` function.

3. **Scoped CSS to CSS modules** -- `<style scoped>` blocks are converted to `.module.css` files. Class references in the template are rewritten to use `styles.className` syntax.

4. **LLM fallback** -- When a template pattern can't be converted deterministically (e.g., complex custom directives), it's marked with a fallback comment. With `--llm` enabled, these are sent to Claude for resolution.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
