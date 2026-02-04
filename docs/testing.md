# Testing Patterns

Framework: vitest with jsdom environment for React tests.

## Structure

```
tests/
  core/           # Unit tests for each core module
  cli/            # Config parsing, schema loading, generated output
  react/          # Provider, options factories
  zod/            # Schema generation
  integration/    # Full pipeline tests
```

## Approach

- **No real GraphQL server** for unit tests. Mock introspection responses as plain objects matching `IntrospectionResult`.
- **Mock `globalThis.fetch`** with `vi.spyOn(globalThis, "fetch")` for tests that exercise the fetch path (options factories, drift client).
- **React hooks** tested with `@testing-library/react`'s `renderHook`. Use `createElement` for wrapper providers (QueryClientProvider, DriftProvider).
- **Round-trip tests** for flatten/unflatten: `unflatten(flatten(data, fields), fields)` should reconstruct the original structure.
- **Snapshot-style tests** for query/mutation builders: verify the exact query string output.
- **CLI schema tests** use temp directories with real `.graphql` SDL files and the `graphql` package for local introspection.

## What to Test

- Every core function gets direct unit tests with mock data.
- Registry builder: test scalar mapping, nested objects, enum handling, label generation, depth limits.
- Query builder: test root fields, nested field grouping, filter arguments.
- Options factories: test that `queryKey` is stable, `queryFn` calls fetch correctly, mutation functions validate and unflatten.
- Config merging: test CLI args override file defaults, header merging.
