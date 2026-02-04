# Core Modules

All in `src/core/`. No framework dependencies.

## introspection.ts

- `introspectType(typeName, config)` — sends the introspection query, returns `IntrospectionResult`
- `discoverMutations(typeName, config)` — introspects `Mutation` root, finds `updateX`/`createX`/`deleteX` by naming convention
- `unwrapType(t)` — strips `NON_NULL` and `LIST` wrappers to get the underlying type

The introspection query uses 3 levels of `ofType` nesting to handle `NON_NULL(LIST(NON_NULL(Scalar)))`. Includes `enumValues { name }` at each level.

## registry.ts

- `buildRegistry(introspection, config?)` — sync, transforms raw introspection into `FieldDefinition[]`
- `buildRegistryAsync(typeName, config)` — async, introspects then builds
- `buildInputRegistry(typeName, config)` — introspects `Update{TypeName}Input`, returns writable fields
- `getEditableFields(queryFields, inputFields)` — intersection of readable + writable
- `withLabels(fields, labelMap)` — override auto-generated labels

Nested OBJECT fields are recursed up to `maxDepth` (default 1). Nested types must be provided via `nestedTypes` config for sync `buildRegistry`, or are auto-resolved in the async version.

ENUMs are handled as `type: "enum"` with `enumValues` preserved from introspection.

`id` field is always skipped (included automatically by the query builder).

## query-builder.ts

- `buildQuery(queryName, fields, options?)` — fields in, valid GraphQL query string out

Algorithm: collect `graphqlPath` values, split on `.`, group by parent, build `parent { child1 child2 }` selections. Always includes `id`. Supports optional filter type in the query signature.

## mutation-builder.ts

- `buildUpdateMutation(typeName, returnFields, inputTypeName?)` — `mutation UpdateOrder($id: ID!, $input: UpdateOrderInput!) { updateOrder(id: $id, input: $input) { ... } }`
- `buildCreateMutation(typeName, returnFields, inputTypeName?)` — same but no `$id` param
- `getMutationName(typeName, operation)` — `"updateOrder"`
- `getInputTypeName(typeName, operation)` — `"UpdateOrderInput"`

Return selection reuses the same grouping logic as the query builder.

## flatten.ts

- `flatten(data, fields)` — nested response -> flat `Record<string, unknown>`. Walks `graphqlPath` dot-notation. Preserves `id`.
- `unflatten(flatData, fields)` — reverse. Only includes keys present in `flatData` (for sparse updates).

When traversing null nested objects (e.g. `shippingAddress: null`), nested fields get `undefined`, not `null`.

## fetch.ts

- `gqlFetch(config, query, variables?)` — shared fetch function used by all modules. Checks `config.fetcher` first, falls back to built-in `fetch`. Returns the `data` portion. Throws on HTTP errors and GraphQL errors.

## render.ts

- `formatValue(field, value, options?)` — display formatting. Numbers/dates are locale-aware. Booleans -> `"Yes"`/`"No"`.
- `inputType(field)` — returns HTML input type: `"text"` | `"number"` | `"date"` | `"checkbox"` | `"select"` (for enums)
- `parseInput(field, raw)` — parse form input to correct type (string -> number, etc.)
- `isEditable(field, editableKeys)` — check if a field key is in the editable set

## drift.ts

High-level client factories:

- `createDrift(config)` — runtime introspection client. `.type()`, `.fetch()`, `.update()`, `.create()`. Caches type resolution.
- `createDriftFromRegistry(config, ...registries)` — static client from CLI-generated data. No network for type resolution.
- `defineDriftType(options)` — converts static registry data (fields, mutations arrays) into a `DriftType` with proper `Map` for mutations.
