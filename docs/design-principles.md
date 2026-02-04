# Design Principles

## DX Priorities

1. **Minimal boilerplate.** `useDriftType` is the "just works" path. One hook, one import. Config from provider. Options factories for composability.
2. **Incremental adoption.** Each module is independently useful. Use just the query builder without React. Use just the registry without Zod.
3. **Follow ecosystem patterns.** Options factories follow TanStack Query v5's `queryOptions` pattern. Generated code produces config objects, not hooks.
4. **Error messages that help.** If a type isn't found, say what was expected. If introspection is disabled, say so.
5. **Zero config for common cases.** Naming conventions (`updateOrder`, `UpdateOrderInput`, query name defaults) just work. Overrides are available.

## What NOT to Build

- **No UI components.** No table, no checkbox list, no form. Hooks return data, the user renders it.
- **No optimistic UI.** Users configure `onMutate` on TanStack mutations themselves.
- **No schema caching/persistence.** The user can cache the registry in localStorage if they want.
- **No subscriptions/real-time.** Out of scope for v1.
- **No pagination/sorting built-in.** `filter` is pass-through. The user manages pagination.
