# Contributing to gql-drift

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/saschb2b/gql-drift.git
cd gql-drift
pnpm install
```

## Scripts

| Command | Description |
|---|---|
| `pnpm build` | Build with tsup (ESM + CJS) |
| `pnpm test` | Run all tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm lint` | ESLint |
| `pnpm lint:fix` | ESLint with auto-fix |
| `pnpm format` | Format with Prettier |
| `pnpm format:check` | Check formatting |

## Before Submitting a PR

Make sure all checks pass:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

CI runs all of these automatically on pull requests.

## Project Structure

```
src/
  core/       Core logic (zero dependencies)
  react/      React + TanStack Query integration
  zod/        Zod schema generation
  cli/        CLI tool (generate, init)
tests/
  core/       Core unit tests
  react/      React component tests (jsdom)
  zod/        Zod tests
  cli/        CLI tests
  integration/ End-to-end pipeline tests
```

## Guidelines

- Keep the core package dependency-free. React, Zod, and TanStack Query are optional peer dependencies.
- Write tests for new functionality. The project targets 90%+ coverage.
- Follow existing code style. ESLint and Prettier enforce most conventions.
- Keep PRs focused. One feature or fix per PR.

## Reporting Bugs

Open an issue at https://github.com/saschb2b/gql-drift/issues with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Node version and OS

## Feature Requests

Open an issue describing the use case. Explain the problem before proposing a solution.
