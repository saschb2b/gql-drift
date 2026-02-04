# gql-drift

[![CI](https://github.com/saschb2b/gql-drift/actions/workflows/ci.yml/badge.svg)](https://github.com/saschb2b/gql-drift/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/gql-drift.svg)](https://www.npmjs.com/package/gql-drift)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Dynamic GraphQL queries and mutations at runtime.**

When your query shape is determined by user interaction — not by a developer at build time — codegen can't help you. gql-drift can.

---

## Why

You have a table where users pick which columns to display. Or an admin dashboard where each role sees different fields. Or a report builder where filters are chosen at runtime. The GraphQL query doesn't exist until someone clicks.

Traditional codegen requires static `.graphql` files. String concatenation gives you no type safety. gql-drift sits in between:

```
Schema → Introspection → Field Registry → Query Builder → Flatten → UI
```

- Introspect types, fields, nesting, scalars, enums, and mutations
- Build queries dynamically from user-selected fields
- Build mutations with automatic input type discovery
- Flatten nested responses to table rows (and back)
- Validate at runtime with auto-generated Zod schemas

---

## Install

```bash
pnpm add gql-drift
```

Optional peer dependencies — install only what you use:

```bash
pnpm add react @tanstack/react-query   # React integration
pnpm add zod                            # Runtime validation
pnpm add graphql                        # Local schema file support (CLI)
```

---

## Quick Start

### 1. Generate from your schema

```bash
npx gql-drift init       # scaffold config
npx gql-drift generate   # generate field registries
```

Config file (`gql-drift.config.json`):

```json
{
  "endpoint": "http://localhost:4000/graphql",
  "types": ["Order", "Customer"],
  "out": "src/generated",
  "depth": 1
}
```

Or skip the config file:

```bash
npx gql-drift generate --endpoint http://localhost:4000/graphql --types Order,Customer
npx gql-drift generate --schema ./schema.graphql --types Order,Customer
```

### 2. Use the generated code

Each generated file exports a `DriftType`, field arrays, and TanStack Query options factories:

```ts
// src/generated/order.ts (auto-generated)
import { orderType, ORDER_FIELDS, orderQueryOptions, updateOrderMutation } from "./generated/order";
```

---

## React + TanStack Query

gql-drift follows the [TanStack Query v5 `queryOptions` pattern](https://tkdodo.eu/blog/the-query-options-api). Generated code produces **options factories** — you spread them into standard TanStack hooks.

### Provider Setup

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

### Querying and Mutating

Spread generated options into `useQuery` / `useMutation`:

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDriftConfig } from "gql-drift/react";
import { orderQueryOptions, updateOrderMutation, orderQueryKey } from "./generated/order";

function OrderTable() {
  const config = useDriftConfig();
  const queryClient = useQueryClient();

  const { data: rows } = useQuery({
    ...orderQueryOptions({ config }),
  });

  const { mutate } = useMutation({
    ...updateOrderMutation({ config }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderQueryKey() }),
  });

  return /* your UI */;
}
```

This works with `useQuery`, `useSuspenseQuery`, `queryClient.prefetchQuery`, and anything else in TanStack Query.

### Dynamic Field Selection

For the full experience — field checkboxes, toggle on/off, auto-rebuilding queries — use `useDriftType`:

```tsx
import { useDriftType } from "gql-drift/react";
import { orderType } from "./generated/order";

function OrderTable() {
  const {
    registry, // all available fields
    selectedFields, // currently active fields
    toggleField, // toggle a field by key
    rows, // flattened query results
    isLoading,
    format, // format a cell value for display
    updateRow, // (id, values) => Promise
    createRow, // (values) => Promise
  } = useDriftType({ type: orderType });

  return (
    <div>
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

Config comes from `DriftProvider`. Query name defaults from the type name (`"orders"`).

---

## Custom GraphQL Client

By default gql-drift uses `fetch`. Pass a `fetcher` to use your own client:

```tsx
import { GraphQLClient } from "graphql-request";

const client = new GraphQLClient("/graphql", {
  headers: { Authorization: `Bearer ${token}` },
});

<DriftProvider
  config={{
    endpoint: "/graphql",
    fetcher: ({ query, variables }) => client.request(query, variables),
  }}
/>;
```

The `fetcher` receives `{ query, variables }` and returns the `data` portion of the response. When provided, `endpoint` and `headers` are ignored — your client owns the transport.

<details>
<summary>Examples with other clients</summary>

**urql**

```tsx
import { client } from "./urql-client";

fetcher: async ({ query, variables }) => {
  const result = await client.query(query, variables).toPromise();
  if (result.error) throw result.error;
  return result.data;
};
```

**Apollo Client**

```tsx
import { client } from "./apollo-client";
import { gql } from "@apollo/client";

fetcher: async ({ query, variables }) => {
  const { data } = await client.query({ query: gql(query), variables });
  return data;
};
```

</details>

---

## Vanilla TypeScript

No React required. Use the core directly:

```ts
import { createDrift } from "gql-drift";

const drift = createDrift({ endpoint: "/graphql" });

const order = await drift.type("Order");
const query = drift.buildQuery("orders", order.fields);
const { rows } = await drift.fetch("orders", order);

await drift.update(order, { id: "1", values: { status: "SHIPPED" } });
```

With static generation (no network introspection):

```ts
import { createDriftFromRegistry } from "gql-drift";
import { orderType } from "./generated/order";

const drift = createDriftFromRegistry({ endpoint: "/graphql" }, orderType);
const { rows } = await drift.fetch("orders", await drift.type("Order"));
```

---

## Zod Validation

Auto-generate Zod schemas from your field definitions:

```ts
import { buildResultSchema, buildInputSchema } from "gql-drift/zod";
import { orderType } from "./generated/order";

const resultSchema = buildResultSchema(orderType.fields);
const inputSchema = buildInputSchema(orderType.editableFields);

inputSchema.parse(userInput); // throws ZodError on invalid data
```

In `useDriftType`, pass `validate: true` to auto-validate before every mutation:

```tsx
const { updateRow } = useDriftType({ type: orderType, validate: true });
```

---

## Core Concepts

### FieldDefinition

The single unit that flows through the entire pipeline:

```ts
interface FieldDefinition {
  key: string; // Flat key: "shippingAddressCity"
  label: string; // Human label: "Shipping Address City"
  graphqlPath: string; // Nested path: "shippingAddress.city"
  type: FieldType; // "string" | "number" | "date" | "boolean" | "enum"
  enumValues?: string[]; // ["PENDING", "SHIPPED", "DELIVERED"]
}
```

### Nested Fields

gql-drift flattens nested GraphQL objects into dot-free keys:

```
GraphQL:  order { shippingAddress { city, zip } }
Registry: { key: "shippingAddressCity", graphqlPath: "shippingAddress.city" }
```

`buildQuery` reconstructs the nesting. `flatten` / `unflatten` convert between nested responses and flat rows.

### Rendering Helpers

```ts
import { formatValue, inputType, parseInput } from "gql-drift";

formatValue(field, value); // "99.99" | "true" | "Jan 1, 2024"
inputType(field); // "text" | "number" | "date" | "checkbox" | "select"
parseInput(field, rawValue); // string → number, "true" → boolean, etc.
```

---

## CLI Reference

```
gql-drift init                  Create gql-drift.config.json
gql-drift generate [options]    Generate field registries

Options:
  --endpoint <url>     GraphQL endpoint URL
  --schema <path>      Local .graphql SDL file
  --types <names>      Comma-separated type names
  --out <path>         Output directory (default: src/generated)
  --depth <n>          Max nesting depth (default: 1)
  --header <value>     HTTP header as "Key: Value" (repeatable)
```

Config file values are defaults. CLI flags override them.

---

## Entry Points

| Import            | Contents                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `gql-drift`       | Core: types, introspection, registry, query/mutation builders, flatten, rendering helpers |
| `gql-drift/react` | `DriftProvider`, `useDriftType`, options factories                                        |
| `gql-drift/zod`   | `buildResultSchema`, `buildInputSchema`                                                   |
| `gql-drift/cli`   | CLI entry point (`npx gql-drift`)                                                         |

All entry points are tree-shakeable. ESM and CJS.

## Peer Dependencies

| Package                 | Used by           | Required |
| ----------------------- | ----------------- | -------- |
| `react`                 | `gql-drift/react` | No       |
| `@tanstack/react-query` | `gql-drift/react` | No       |
| `zod`                   | `gql-drift/zod`   | No       |
| `graphql`               | `--schema` flag   | No       |

The core package has zero dependencies.

## License

MIT
