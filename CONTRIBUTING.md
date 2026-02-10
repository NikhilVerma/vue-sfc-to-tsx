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

## Project overview

See [CLAUDE.md](./CLAUDE.md) for project structure and architecture details.
