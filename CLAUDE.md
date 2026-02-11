# vue-to-tsx

Converts Vue Single File Components (.vue) to Vue TSX (.tsx + .module.css). This is NOT a React migration tool -- output stays within Vue.

Published at: https://www.npmjs.com/package/vue-to-tsx

## Package manager

Bun. Always use `bun` for installing, running, building, and testing.

## Commands

- `bun test` -- run all tests
- `bun run build` -- build to dist/
- `bun run lint` -- lint with oxlint
- `bun run lint:fix` -- lint with auto-fix
- `bun run lint:type-aware` -- type-aware lint + type-check via oxlint + tsgolint
- `bun run typecheck` -- type-check with tsgo (TypeScript native)
- `bun run fmt` -- format all src/ and test/ files with oxfmt
- `bun run fmt:check` -- check formatting without writing
- `bun run check` -- run lint + fmt:check + typecheck (full pre-push check)

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
- LLM fallback (optional): patterns that can't be converted deterministically get marked with fallback comments, then resolved via Claude or OpenAI API

## Linting, formatting & type-checking

- Linting: `oxlint` (with `oxlint-tsgolint` for type-aware rules)
- Formatting: `oxfmt` (auto-formatter for src/ and test/)
- Type-checking: `tsgo` (`@typescript/native-preview`) — replaces `tsc --noEmit`
- Config: `.oxlintrc.json` for lint rules, `tsconfig.json` for type-checking

## Before pushing

Always run `bun run check` (or individually: `bun run lint`, `bun run fmt:check`, `bun run typecheck`) before pushing. The `prepublishOnly` script enforces lint + typecheck + test + build.

## Development ethos

- **TDD (Test-Driven Development)**: Always write a failing test first before fixing a bug. Every bug fix must include a regression test.
- Run `bun test` before and after every change
- Run `bun run check` before pushing (lint + format + typecheck)
- Test fixtures in `test/fixtures/` are end-to-end integration tests
- Unit tests go in `test/template/`, `test/script/`, etc.
