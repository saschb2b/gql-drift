# gql-drift

Dynamic GraphQL queries and mutations at runtime. When your query shape is determined by user interaction — not by a developer at build time — codegen can't help you. gql-drift can.

## The Problem

You have a table where users pick which columns to display. Or an admin dashboard where each role sees different fields. Or a report builder where filters and groupings are chosen at runtime. The GraphQL query doesn't exist until someone clicks.

The usual approach is string concatenation, which gives you no type safety, no validation, no nesting support, and an injection surface. Codegen tools like `graphql-codegen` require static `.graphql` files, so they can't help either.

## What gql-drift Does

gql-drift provides a pipeline that turns your GraphQL schema into runtime-safe dynamic queries and mutations:

```
Schema -> Introspection -> Field Registry -> Query/Mutation Builder -> Flatten -> UI
```

- **Introspect** your schema to discover types, fields, nesting, scalars, enums, and mutations
- **Generate a typed field registry** that maps fields to UI labels, GraphQL paths, and formatting types
- **Build queries dynamically** from user-selected fields, with proper nesting support
- **Build mutations dynamically** with automatic input type discovery
- **Validate at runtime** with auto-generated Zod schemas
- **Flatten/unflatten** nested GraphQL responses to flat table rows and back

## Installation

```bash
pnpm add gql-drift

# Optional peer dependencies (install what you need)
pnpm add react @tanstack/react-query   # React integration
pnpm add zod                            # Runtime validation
pnpm add graphql                        # Local schema file support (CLI)
```

## Getting Started

### 1. Generate from your schema

```bash
# Scaffold a config file
npx gql-drift init

# Generate field registries
npx gql-drift generate
```

This reads your `gql-drift.config.json` and outputs typed TypeScript files:

```json
{
  "endpoint": "http://localhost:4000/graphql",
  "types": ["Order", "Customer"],
  "out": "src/generated",
  "depth": 1
}
```

Or skip the config file entirely:

```bash
# From a running endpoint
npx gql-drift generate --endpoint http://localhost:4000/graphql --types Order,Customer

# From a local schema file (no server needed)
npx gql-drift generate --schema ./schema.graphql --types Order,Customer
```

### 2. Use the generated code

The generated file exports everything you need:

```ts
// src/generated/order.ts (auto-generated)

// Data
export const ORDER_FIELDS: FieldDefinition[];
export const ORDER_INPUT_FIELDS: FieldDefinition[];
export const ORDER_EDITABLE_FIELDS: FieldDefinition[];
export const ORDER_MUTATIONS: { operation, mutationName, inputTypeName }[];
export const orderType: DriftType;

// TanStack Query options factories
export function orderQueryOptions(params): { queryKey, queryFn };
export function updateOrderMutation(params): { mutationFn };
export function createOrderMutation(params): { mutationFn };
export function orderQueryKey(params): unknown[];
```

## Usage

### React + TanStack Query

gql-drift follows the [TanStack Query v5 `queryOptions` pattern](https://tkdodo.eu/blog/the-query-options-api) — generated code produces **options factories**, not hooks. You spread them into standard TanStack Query hooks.

#### Setup

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DriftProvider } from "gql-drift/react";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DriftProvider config={{ endpoint: "/graphql" }}>
        <YourApp />
      </DriftProvider>
    </QueryClientProvider>
  );
}
```

#### Custom GraphQL Client

By default gql-drift uses `fetch` internally. To use your own GraphQL client, pass a `fetcher` function on the config:

```tsx
import { GraphQLClient } from "graphql-request";

const client = new GraphQLClient("/graphql", {
  headers: { Authorization: `Bearer ${token}` },
});

<DriftProvider config={{
  endpoint: "/graphql",
  fetcher: ({ query, variables }) => client.request(query, variables),
}}>
```

The `fetcher` receives `{ query, variables }` and must return the `data` portion of the GraphQL response. When provided, `endpoint` and `headers` are ignored — your client owns the transport.

This works with any GraphQL client:

```tsx
// urql
import { client } from "./urql-client";

fetcher: async ({ query, variables }) => {
  const result = await client.query(query, variables).toPromise();
  if (result.error) throw result.error;
  return result.data;
}

// Apollo Client
import { client } from "./apollo-client";
import { gql } from "@apollo/client";

fetcher: async ({ query, variables }) => {
  const { data } = await client.query({ query: gql(query), variables });
  return data;
}
```

#### Option A: Standard TanStack Query hooks

Spread the generated options factories into `useQuery` / `useMutation` directly. You own the state.

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDriftConfig } from "gql-drift/react";
import {
  orderQueryOptions,
  updateOrderMutation,
  orderQueryKey,
} from "./generated/order";

function OrderTable() {
  const config = useDriftConfig();
  const queryClient = useQueryClient();

  // Query with all fields
  const { data: rows } = useQuery({
    ...orderQueryOptions({ config }),
  });

  // Query with specific fields
  const selectedFields = orderType.fields.filter((f) =>
    ["orderNumber", "status", "total"].includes(f.key)
  );
  const { data: filteredRows } = useQuery({
    ...orderQueryOptions({ config, fields: selectedFields }),
  });

  // Mutation
  const { mutate } = useMutation({
    ...updateOrderMutation({ config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderQueryKey() });
    },
  });

  return /* your UI */;
}
```

This pattern works with `useQuery`, `useSuspenseQuery`, `queryClient.prefetchQuery`, and anything else in the TanStack Query ecosystem.

#### Option B: `useDriftType` (batteries included)

For the full dynamic field selection experience — checkboxes, toggle fields, auto-rebuilding queries — use the all-in-one hook:

```tsx
import { useDriftType } from "gql-drift/react";
import { orderType } from "./generated/order";

function OrderTable() {
  const {
    registry,        // all available fields
    selectedFields,  // currently selected fields
    toggleField,     // toggle a field on/off by key
    rows,            // flattened query results
    isLoading,
    format,          // format a value for display
    inputType,       // get HTML input type ("text", "number", "date", "checkbox", "select")
    parseInput,      // parse raw input into correct type
    isEditable,      // check if a field is writable
    updateRow,       // (id, flatValues) => Promise
    createRow,       // (flatValues) => Promise
  } = useDriftType({ type: orderType });

  return (
    <div>
      {/* Field checkboxes */}
      {registry.map((field) => (
        <label key={field.key}>
          <input
            type="checkbox"
            checked={selectedFields.some((s) => s.key === field.key)}
            onChange={() => toggleField(field.key)}
          />
          {field.label}
        </label>
      ))}

      {/* Data table */}
      <table>
        <thead>
          <tr>
            {selectedFields.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id as string}>
              {selectedFields.map((f) => (
                <td key={f.key}>{format(f, row[f.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`config` comes from `DriftProvider`, `queryName` defaults to `"orders"` (from the type name). The hook handles introspection (if no static type is passed), field selection state, query building, data fetching, flattening, mutations, and rendering helpers.

### Vanilla TypeScript (no React)

```ts
import { createDrift } from "gql-drift";

const drift = createDrift({ endpoint: "/graphql" });

// Introspect a type
const order = await drift.type("Order");
// order.fields, order.editableFields, order.mutations

// Build a query from selected fields
const query = drift.buildQuery("orders", order.fields);

// Fetch and flatten
const { rows } = await drift.fetch("orders", order);

// Mutate
await drift.update(order, {
  id: "1",
  values: { orderNumber: "ORD-002", total: 150 },
});
```

Or use the static registry from CLI generation:

```ts
import { createDriftFromRegistry } from "gql-drift";
import { orderType } from "./generated/order";

const drift = createDriftFromRegistry(
  { endpoint: "/graphql" },
  orderType,
);

const order = await drift.type("Order"); // instant, no network
const { rows } = await drift.fetch("orders", order);
```

### Runtime Validation with Zod

```ts
import { buildResultSchema, buildInputSchema } from "gql-drift/zod";
import { orderType } from "./generated/order";

// Validate query results
const resultSchema = buildResultSchema(orderType.fields);
const validatedRows = data.map((row) => resultSchema.parse(row));

// Validate mutation input before sending
const inputSchema = buildInputSchema(orderType.editableFields);
inputSchema.parse(userInput); // throws ZodError on invalid data
```

Enum fields automatically get `z.enum()` with their possible values.

In `useDriftType`, pass `validate: true` to auto-validate mutation inputs:

```tsx
const { updateRow } = useDriftType({
  type: orderType,
  validate: true, // Zod validates before every mutation
});
```

## Core Concepts

### FieldDefinition

The single source of truth for the entire pipeline:

```ts
interface FieldDefinition {
  key: string;         // Flat key for UI: "shippingAddressCity"
  label: string;       // Human label: "Shipping Address City"
  graphqlPath: string; // Nested path: "shippingAddress.city"
  type: FieldType;     // "string" | "number" | "date" | "boolean" | "enum"
  enumValues?: string[]; // ["PENDING", "SHIPPED", "DELIVERED"]
}
```

Flat keys are used throughout the UI layer. GraphQL paths handle the nesting. The `flatten` / `unflatten` functions convert between them.

### DriftType

A resolved type with all its metadata:

```ts
interface DriftType {
  typeName: string;
  fields: FieldDefinition[];           // All queryable fields
  mutations: Map<MutationOperation, string>; // "update" -> "updateOrder"
  inputFields: FieldDefinition[];       // Writable fields (from input type)
  editableFields: FieldDefinition[];    // Intersection of fields + inputFields
}
```

### Nested Fields

gql-drift flattens nested GraphQL objects into dot-free keys:

```
GraphQL: order { shippingAddress { city, zip } }
Registry: [
  { key: "shippingAddressCity", graphqlPath: "shippingAddress.city" },
  { key: "shippingAddressZip", graphqlPath: "shippingAddress.zip" },
]
```

`buildQuery` reconstructs the nesting. `flatten` / `unflatten` convert between nested responses and flat rows.

### Rendering Helpers

```ts
import { formatValue, inputType, parseInput } from "gql-drift/react";

formatValue(field, value)   // "99.99" | "true" | "Jan 1, 2024" | "PENDING"
inputType(field)            // "text" | "number" | "date" | "checkbox" | "select"
parseInput(field, rawValue) // string -> number, "true" -> boolean, etc.
```

## CLI Reference

```
gql-drift init                  Create a gql-drift.config.json file
gql-drift generate [options]    Generate field registries from schema

Options:
  --endpoint <url>     GraphQL endpoint URL
  --schema <path>      Path to a local .graphql SDL file
  --types <names>      Comma-separated type names
  --out <path>         Output directory (default: src/generated)
  --depth <n>          Max nesting depth (default: 1)
  --header <value>     HTTP header as "Key: Value" (repeatable)
```

Config file values are used as defaults. CLI flags override them.

## Entry Points

| Import | Description |
|--------|-------------|
| `gql-drift` | Core: types, introspection, registry, query/mutation builders, flatten/unflatten, rendering helpers, drift client |
| `gql-drift/react` | React: `DriftProvider`, `useDriftType`, options factories (`driftQueryOptions`, `driftUpdateMutation`, `driftCreateMutation`, `driftQueryKey`) |
| `gql-drift/zod` | Validation: `buildResultSchema`, `buildInputSchema` |
| `gql-drift/cli` | CLI entry point (used via `npx gql-drift`) |

All entry points are tree-shakeable and available in both ESM and CJS.

## Peer Dependencies

| Package | Required for | Optional |
|---------|-------------|----------|
| `react` | `gql-drift/react` | Yes |
| `@tanstack/react-query` | `gql-drift/react` | Yes |
| `zod` | `gql-drift/zod`, `validate: true` | Yes |
| `graphql` | `gql-drift generate --schema` | Yes |

Install only what you use. The core package (`gql-drift`) has zero dependencies.

## License

MIT
