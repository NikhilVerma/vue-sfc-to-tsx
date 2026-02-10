# Contributing

Contributions are welcome! Here's how to get started.

## Setup

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```
3. Run the tests to make sure everything works:
   ```bash
   bun test
   ```

## Development workflow

1. Create a branch for your change:
   ```bash
   git checkout -b my-feature
   ```
2. Make your changes
3. Add or update tests as needed -- test fixtures live in `test/fixtures/` as `input.vue` / `expected.tsx` pairs
4. Run tests and lint:
   ```bash
   bun test
   bun run lint
   ```
5. Submit a pull request

## Testing philosophy

We follow **Test-Driven Development (TDD)**: write a failing test that demonstrates the bug, then fix the code to make it pass.

- **Every PR that fixes a bug must include a test that would have caught it.** No exceptions.
- **Integration tests** live in `test/fixtures/` as `input.vue` / `expected.tsx` pairs. These exercise the full conversion pipeline end-to-end.
- **Unit tests** live alongside the modules they test: `test/template/` for template conversion, `test/script/` for script handling, `test/style/` for CSS modules, and `test/llm/` for LLM fallback logic.
- Run `bun test` before starting work and after every change to catch regressions early.

## Project overview

See [CLAUDE.md](./CLAUDE.md) for project structure and architecture details.
