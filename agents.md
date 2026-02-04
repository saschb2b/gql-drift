# gql-drift

TypeScript npm package for dynamic GraphQL queries and mutations at runtime — introspection, typed field registries, query/mutation builders, and React/TanStack Query integration.

## Basics

- **Package manager**: pnpm
- **Build**: `pnpm build` (tsup, ESM + CJS)
- **Test**: `pnpm test` (vitest)
- **Typecheck**: `pnpm typecheck` (tsc --noEmit)
- **Entry points**: `gql-drift`, `gql-drift/react`, `gql-drift/zod`, `gql-drift/cli`
- **Zero runtime dependencies** in core. React, TanStack Query, Zod, and graphql are optional peer deps.

## Architecture

The central type is `FieldDefinition` — every module consumes or produces it:

```
Schema -> Introspection -> Field Registry (FieldDefinition[]) -> Query/Mutation Builder -> Flatten/Unflatten -> UI
```

## Detailed Guides

- [Types and conventions](docs/types.md) — FieldDefinition, DriftConfig, DriftType, naming conventions
- [Core modules](docs/core-modules.md) — introspection, registry, query/mutation builders, flatten, render helpers
- [React integration](docs/react.md) — DriftProvider, useDriftType, options factories (TanStack Query v5 pattern)
- [CLI and code generation](docs/cli.md) — init, generate, config files, local schema support, generated output shape
- [Testing patterns](docs/testing.md) — mock strategies, what to test, integration test approach
- [Design principles](docs/design-principles.md) — DX priorities, what NOT to build
