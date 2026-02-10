# vue-sfc-to-tsx

Converts Vue Single File Components (.vue) to Vue TSX (.tsx + .module.css). This is NOT a React migration tool -- output stays within Vue.

## Package manager

Bun. Always use `bun` for installing, running, building, and testing.

## Commands

- `bun test` -- run all tests
- `bun run build` -- build to dist/
- `bun run lint` -- lint with oxlint

## Project structure

```
src/
  index.ts          -- main convert() entry point
  parser.ts         -- SFC parsing via @vue/compiler-sfc
  types.ts          -- shared TypeScript types
  cli.ts            -- CLI entry point
  template/
    index.ts        -- templateToJsx entry
    walker.ts       -- AST walker
    elements.ts     -- element node handling
    attributes.ts   -- attribute/prop conversion
    control-flow.ts -- v-if/v-for/v-show
    directives.ts   -- directive conversion
    events.ts       -- event handler conversion (@click -> onClick)
    slots.ts        -- slot conversion
    utils.ts        -- shared template utilities
  script/
    index.ts        -- scriptToDefineComponent
    macros.ts       -- script setup macro extraction (defineProps, etc.)
    imports.ts      -- import statement handling
  style/
    index.ts        -- scoped CSS -> CSS modules extraction
  llm/
    index.ts        -- LLM fallback for unconvertible patterns
test/
  fixtures/         -- input.vue / expected.tsx pairs
  integration.test.ts
  parser.test.ts
  template/         -- unit tests per module
  script/
  style/
  llm/
```

## Architecture

- Uses raw AST from `@vue/compiler-sfc` (not compiled output)
- Template walker does sibling scanning for v-if/v-else-if/v-else chains
- Scoped styles are converted to CSS modules with class map
- LLM fallback (optional): patterns that can't be converted deterministically get marked with fallback comments, then resolved via Claude API

## Linting & formatting

- Linting: `oxlint src/`
- Formatting: manual (no auto-formatter configured)

## Development ethos

- **TDD (Test-Driven Development)**: Always write a failing test first before fixing a bug. Every bug fix must include a regression test.
- Run `bun test` before and after every change
- Test fixtures in `test/fixtures/` are end-to-end integration tests
- Unit tests go in `test/template/`, `test/script/`, etc.
