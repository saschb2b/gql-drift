# gql-drift - Agent Implementation Guide

## Reference Material

The full architecture, rationale, and working code examples are documented in the blog article at:

```
C:\Users\sasch\Documents\GitHub\homepage\blog\en\dynamic-graphql-queries.mdx
```

**Read that file first.** It contains every concept, every code example, and every design decision this package implements. The article is the spec.

## Project Goal

Build a TypeScript npm package that provides a clean, tree-shakeable pipeline for dynamic GraphQL queries and mutations at runtime. The package replaces the hand-rolled code from the article with a reusable library that has great developer experience.

## Package Structure

```
gql-drift/
  src/
    core/
      introspection.ts    # Schema introspection (introspectType, discoverMutations)
      registry.ts         # Field registry builder (buildRegistry, buildInputRegistry)
      query-builder.ts    # Query string builder (buildQuery)
      mutation-builder.ts # Mutation string builder (buildUpdateMutation, buildCreateMutation)
      flatten.ts          # Response flattener (flatten, unflatten)
      types.ts            # Shared types (FieldDefinition, IntrospectionResult, etc.)
    zod/
      index.ts            # Zod schema generators (buildResultSchema, buildInputSchema)
    react/
      index.ts            # React hooks (useGqlDrift, useGqlMutation)
    cli/
      index.ts            # CLI entry point for build-time generation
    index.ts              # Main entry point re-exporting core
  tests/
    core/
      introspection.test.ts
      registry.test.ts
      query-builder.test.ts
      mutation-builder.test.ts
      flatten.test.ts
    zod/
      schema.test.ts
    react/
      hooks.test.ts
    integration/
      full-pipeline.test.ts
  package.json
  tsconfig.json
  tsup.config.ts          # Build config (ESM + CJS, tree-shakeable)
  vitest.config.ts
  README.md
  agents.md
  LICENSE
```
## Core Types

These types are the backbone. Every module works with them:

```ts
interface FieldDefinition {
  /** Flat key used in UI and as object property name: "shippingAddressCity" */
  key: string;
  /** Human-readable label: "Ship. City" */
  label: string;
  /** Dot-notation path into the GraphQL response: "shippingAddress.city" */
  graphqlPath: string;
  /** Simplified scalar type for formatting and validation */
  type: "string" | "number" | "date" | "boolean";
}

interface DriftConfig {
  /** GraphQL endpoint URL */
  endpoint: string;
  /** Optional headers (auth tokens, etc.) */
  headers?: Record<string, string>;
  /** Max nesting depth for introspection (default: 1) */
  maxDepth?: number;
  /** Custom scalar type mapping overrides */
  scalarMap?: Record<string, FieldDefinition["type"]>;
}

type MutationOperation = "update" | "create" | "delete";
```

## Module-by-Module Implementation

### 1. `core/types.ts`
Export all shared types: `FieldDefinition`, `DriftConfig`, `MutationOperation`, `IntrospectionType`, `IntrospectionField`, `IntrospectionResult`.

### 2. `core/introspection.ts`

**Functions to implement:**

- `introspectType(typeName: string, config: DriftConfig): Promise<IntrospectionResult>`
  - Sends the introspection query from the article (with nested `ofType` unwrapping)
  - Returns the raw introspection result for a single type
  - Must handle NON_NULL and LIST wrappers via `unwrapType()`

- `discoverMutations(typeName: string, config: DriftConfig): Promise<Map<MutationOperation, string>>`
  - Introspects the `Mutation` root type
  - Checks for `updateX`, `createX`, `deleteX` by naming convention
  - Returns a Map of available operations to their mutation names

**Key details from the article:**
- The introspection query needs 3 levels of `ofType` nesting to handle `NON_NULL(LIST(NON_NULL(Scalar)))` patterns
- `unwrapType()` strips NON_NULL and LIST wrappers to get the underlying SCALAR/OBJECT/ENUM
- Default scalar mapping: `String->string`, `Int->number`, `Float->number`, `Boolean->boolean`, `DateTime->date`, `ID->string`
- The scalar map should be overridable via `DriftConfig.scalarMap`
### 3. `core/registry.ts`

**Functions to implement:**

- `buildRegistry(introspection: IntrospectionResult, config?: { maxDepth?: number; scalarMap?: Record<string, FieldDefinition["type"]> }): FieldDefinition[]`
  - Transforms raw introspection into flat `FieldDefinition[]`
  - Handles nested OBJECT fields by recursing (up to `maxDepth`, default 1)
  - Flattens nested paths: `shippingAddress.city` -> key `shippingAddressCity`, graphqlPath `shippingAddress.city`
  - Skips `id` field (always included automatically by the query builder)
  - Uses `formatLabel()` for auto-generated labels (camelCase -> "Title Case")

- `buildInputRegistry(typeName: string, config: DriftConfig): Promise<FieldDefinition[]>`
  - Derives input type name via convention: `Update{TypeName}Input`
  - Introspects that input type
  - Returns the writable field definitions

- `getEditableFields(queryFields: FieldDefinition[], inputFields: FieldDefinition[]): FieldDefinition[]`
  - Returns fields that exist in BOTH registries (readable AND writable)
  - These are the fields that should get edit affordances in the UI

**Key details from the article:**
- `capitalize()` helper: first char uppercase
- `formatLabel()`: camelCase -> space-separated title case via regex `replace(/([a-z])([A-Z])/g, " ")`
- Nested object handling: when `unwrapped.kind === "OBJECT"`, recurse with prefix and pathPrefix
- The prefix creates flat keys: prefix `"shippingAddress"` + field `"city"` -> key `"shippingAddressCity"`
- The pathPrefix creates GraphQL paths: `"shippingAddress.city"`

### 4. `core/query-builder.ts`

**Functions to implement:**

- `buildQuery(queryName: string, fields: FieldDefinition[], options?: { filter?: string; variables?: string }): string`
  - Pure function: fields in, valid GraphQL query string out
  - Always includes `id` in the selection
  - Groups nested paths: `shippingAddress.city` + `shippingAddress.country` -> `shippingAddress { city country }`
  - Supports optional filter/variables argument typing

**Key algorithm from the article:**
1. Collect all `graphqlPath` values plus `"id"`
2. Split each path on `.` - paths without dots are root fields, paths with dots go into a `Map<parent, children[]>`
3. Build selection set: root fields + `parent { child1 child2 }` for each group
4. Wrap in `query QueryName(: FilterType) { queryName(filter: ) { ...selections } }`

### 5. `core/mutation-builder.ts`

**Functions to implement:**

- `buildUpdateMutation(typeName: string, returnFields: FieldDefinition[], inputTypeName?: string): string`
  - Naming convention: typeName `"Order"` -> mutation name `updateOrder`, input type `UpdateOrderInput`
  - The return selection reuses the same field grouping logic as the query builder
  - Produces: `mutation UpdateOrder(: ID!, : UpdateOrderInput!) { updateOrder(id: , input: ) { id ... } }`

- `buildCreateMutation(typeName: string, returnFields: FieldDefinition[], inputTypeName?: string): string`
  - Same pattern but with `create` prefix and no `` parameter

- `getMutationName(typeName: string, operation: MutationOperation): string`
  - Convention: `operation + typeName` -> `"updateOrder"`, `"createOrder"`, `"deleteOrder"`

- `getInputTypeName(typeName: string, operation: MutationOperation): string`
  - Convention: `Capitalize(operation) + typeName + "Input"` -> `"UpdateOrderInput"`
### 6. `core/flatten.ts`

**Functions to implement:**

- `flatten(data: Record<string, unknown>, fields: FieldDefinition[]): Record<string, unknown>`
  - Walks dot-notation paths in the nested response and produces flat key-value pairs
  - `{ shippingAddress: { city: "Berlin" } }` -> `{ shippingAddressCity: "Berlin" }` (given the right field definition)
  - Always preserves `id`

- `unflatten(flatData: Record<string, unknown>, fields: FieldDefinition[]): Record<string, unknown>`
  - Reverse of flatten: flat keys back to nested structure
  - `{ shippingAddressCity: "Berlin" }` -> `{ shippingAddress: { city: "Berlin" } }`
  - Only includes keys present in `flatData` (for sparse/dirty updates)

**Key details from the article:**
- Flatten: for each field, split `graphqlPath` on `.`, walk into the nested object, assign to `row[field.key]`
- Unflatten: for each field, check if `field.key` exists in flatData. If path has no dot, assign directly. If path has a dot, reconstruct nested object.

### 7. `zod/index.ts`

**Functions to implement:**

- `buildResultSchema(fields: FieldDefinition[]): z.ZodObject`
  - Maps field types to Zod validators: `string->z.string()`, `number->z.number()`, `date->z.string()`, `boolean->z.boolean()`
  - Always includes `id: z.string()`
  - Returns a `z.object(shape)` (NOT `z.array(...)` - let the consumer wrap in array if needed)

- `buildInputSchema(fields: FieldDefinition[]): z.ZodObject`
  - Same mapping but without the automatic `id` field
  - Used to validate user input before building mutation variables

**Key detail:** Validate AFTER flattening (for query results) and BEFORE unflattening (for mutation inputs). The schemas work with flat keys, not nested structures.

### 8. `react/index.ts`

**Hooks to implement:**

- `useGqlDrift(options: UseGqlDriftOptions): UseGqlDriftResult`
  - Combines registry, field selection state, query building, fetching, and flattening
  - Uses TanStack Query's `useQuery` internally
  - Cache key MUST include the sorted selected field keys (see article's warning about stale data)
  - Returns: `{ registry, selectedFields, selectedKeys, toggleField, setSelectedKeys, query, data, rows, isLoading, error }`

- `useGqlMutation(options: UseGqlMutationOptions): UseGqlMutationResult`
  - Wraps TanStack Query's `useMutation`
  - Handles validate -> unflatten -> build mutation -> fetch -> invalidate cache
  - Returns the standard `useMutation` result plus convenience methods

**Key details from the article:**
- The `queryKey` MUST include `fields.map(f => f.key).toSorted()` to prevent stale data across different selections
- `enabled: fields.length > 0` to avoid sending empty queries
- On mutation success, invalidate the relevant query cache

### 9. `cli/index.ts`

**CLI command: `gql-drift generate`**

- Takes: endpoint URL, type name(s), output path
- Runs introspection at build time
- Outputs a typed `.ts` file with the field registry as a const
- Also discovers available mutations and includes them in the output
- Should be addable to `package.json` scripts: `"generate:fields": "gql-drift generate --endpoint http://localhost:4000/graphql --types Order,Customer --out src/generated/"`

## DX Priorities

1. **Minimal boilerplate.** The `useGqlDrift` hook should be the "just works" path for React users. One hook, one config object, done.
2. **Incremental adoption.** Each module is independently useful. You can use just the query builder without React hooks. You can use just the registry without Zod.
3. **Type safety where possible, runtime safety where needed.** `FieldDefinition` provides structure. Zod provides guarantees. Both should feel natural, not bolted on.
4. **Error messages that help.** If a mutation name doesn't exist in the schema, say which name was expected and what was found. If introspection is disabled, say so clearly.
5. **Zero config for common cases.** Naming conventions (`updateOrder`, `UpdateOrderInput`) should just work. Overrides for non-standard APIs should be easy.

## Testing Strategy

1. **Unit tests for every core function.** Query builder gets snapshot tests. Flatten/unflatten get round-trip tests. Registry builder gets tests with mock introspection data.
2. **No real GraphQL server needed for unit tests.** Mock the introspection responses.
3. **Integration test with a minimal GraphQL server** (e.g. `graphql-yoga` or similar) that validates the full pipeline: introspect -> build -> fetch -> flatten -> validate.
4. **React hook tests** with `@testing-library/react` and a mocked TanStack QueryClient.

## Build and Publish

- Use `tsup` for building (ESM + CJS dual output)
- Package exports map:

```json
{
  ".": "./dist/index.js",
  "./zod": "./dist/zod/index.js",
  "./react": "./dist/react/index.js",
  "./cli": "./dist/cli/index.js"
}
```

- Peer dependencies: `zod` (optional), `@tanstack/react-query` (optional), `react` (optional)
- The core package (`gql-drift`) should have ZERO dependencies

## What NOT to Build

- No UI components. No table, no checkbox list, no form. The hooks return data, the user renders it.
- No full editable table implementation. The mutation hooks give you `mutate()`, the user wires it to their UI.
- No optimistic UI built-in. Mention it in docs, let users configure `onMutate` on the TanStack mutation themselves.
- No GraphQL client. We use `fetch`. Users who want Apollo or urql can use the core builders and wire their own transport.
- No schema caching/persistence across sessions. Keep it simple. The user can cache the registry in localStorage if they want.
