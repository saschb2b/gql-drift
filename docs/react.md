# React Integration

All in `src/react/`. Requires `react` and `@tanstack/react-query` as peer deps.

## Provider

`src/react/provider.tsx`

```tsx
<DriftProvider config={{ endpoint: "/graphql", fetcher: myFetcher }}>
```

- `DriftProvider` — sets default `DriftConfig` for all hooks via React context
- `useDriftConfig()` — reads config from nearest provider. Returns `null` if none.

## Options Factories

`src/react/options.ts`

Follows the [TanStack Query v5 `queryOptions` pattern](https://tkdodo.eu/blog/the-query-options-api). Pure functions — no React imports. Return objects you spread into `useQuery`/`useMutation`.

- `driftQueryOptions({ type, config, fields?, queryName?, filter?, filterType? })` — returns `{ queryKey, queryFn }`. The `queryFn` fetches, and flattens the response.
- `driftUpdateMutation({ type, config, fields?, validate?, validateFn? })` — returns `{ mutationFn }`. Validates, unflattens, sends.
- `driftCreateMutation({ type, config, fields?, validate?, validateFn? })` — same for create.
- `driftQueryKey({ type, queryName?, fields?, filter? })` — stable query key array for cache operations.

`queryName` defaults to `lowercase(typeName) + "s"`. `fields` defaults to `type.fields`.

**Consumer usage:**

```tsx
const config = useDriftConfig();
const { data } = useQuery({ ...driftQueryOptions({ type: orderType, config }) });
const { mutate } = useMutation({
  ...driftUpdateMutation({ type: orderType, config }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: driftQueryKey({ type: orderType }) }),
});
```

Works with `useQuery`, `useSuspenseQuery`, `queryClient.prefetchQuery`, etc.

## useDriftType

`src/react/index.ts`

All-in-one hook for dynamic field selection UIs (checkbox-driven tables, report builders).

```tsx
const result = useDriftType({
  type: orderType,         // static DriftType (skips introspection) OR
  typeName: "Order",       // runtime introspection
  config: { ... },         // optional if DriftProvider is present
  queryName: "orders",     // optional, defaults from typeName
  validate: true,          // optional Zod validation on mutations
  initialKeys: ["orderNumber", "total"], // optional initial field selection
});
```

Returns: `registry`, `selectedFields`, `selectedKeys`, `toggleField`, `setSelectedKeys`, `query`, `rows`, `isLoading`, `error`, `updateRow`, `createRow`, `updateMutation`, `createMutation`, `format`, `inputType`, `parseInput`, `isEditable`, `type`, `editableFields`, `isIntrospecting`, `introspectionError`.

Internally uses `useQuery` for introspection (staleTime: Infinity, skipped with static type) and data fetching, `useMutation` for update/create.

**Query key** includes sorted selected field keys — different field selections get different cache entries.

## Generated Per-Type Wrappers

The CLI generates options factories that close over the `DriftType`, so consumers don't pass it manually:

```ts
// From src/generated/order.ts:
orderQueryOptions({ config }); // type + queryName pre-filled
updateOrderMutation({ config });
createOrderMutation({ config });
orderQueryKey();
```
