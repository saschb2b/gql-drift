# gql-drift

Dynamic GraphQL queries and mutations at runtime. When your query shape is determined by user interaction, not by a developer at build time, codegen can't help you. gql-drift can.

## The Problem

You have a table where users pick which columns to display. Or an admin dashboard where each role sees different fields. Or a report builder where filters and groupings are chosen at runtime. The GraphQL query doesn't exist until someone clicks.

The usual approach is string concatenation, which gives you no type safety, no validation, no nesting support, and an injection surface. Codegen tools like `graphql-codegen` or `gqlgen` require static `.graphql` files, so they can't help either.

## What gql-drift Does

gql-drift provides a pipeline that turns your GraphQL schema into runtime-safe dynamic queries and mutations:

```
Schema  ->  Introspection  ->  Field Registry  ->  Query/Mutation Builder  ->  Validation
```

- **Introspect** your schema to discover types, fields, nesting, scalars, and mutations
- **Generate a typed field registry** that maps fields to UI labels, GraphQL paths, and formatting types
- **Build queries dynamically** from user-selected fields, with proper nesting support
- **Build mutations dynamically** from dirty fields, with automatic input type discovery
- **Validate at runtime** with auto-generated Zod schemas for both responses and inputs
- **Flatten/unflatten** nested GraphQL responses to flat table rows and back

## Quick Example

```ts
import { introspect, buildRegistry, buildQuery, buildResultSchema } from "gql-drift";
import { z } from "zod";

// 1. Discover fields from your schema
const type = await introspect("Order", { endpoint: "/graphql" });
const registry = buildRegistry(type);

// 2. User selects columns
const selected = registry.filter((f) =>
  ["orderNumber", "status", "shippingAddressCity"].includes(f.key)
);

// 3. Build a valid GraphQL query
const query = buildQuery("orders", selected);
// query GetOrders { orders { id orderNumber status shippingAddress { city } } }

// 4. Validate the response at runtime
const schema = z.array(buildResultSchema(selected));
const rows = schema.parse(flattenResponse(data.orders, selected));
```

### Mutations

```ts
import { discoverMutations, buildInputRegistry, buildUpdateMutation, unflattenInput } from "gql-drift";

// 1. Discover available mutations for a type
const mutations = await discoverMutations("Order", { endpoint: "/graphql" });
// Map { "update" -> "updateOrder", "delete" -> "deleteOrder" }

// 2. Introspect the input type to find writable fields
const inputFields = await buildInputRegistry("Order", { endpoint: "/graphql" });

// 3. Build mutation from dirty fields
const mutation = buildUpdateMutation("Order", selectedFields);

// 4. Unflatten edited values back to nested API structure
const input = unflattenInput({ status: "shipped", shippingAddressCity: "Berlin" }, inputFields);
// { status: "shipped", shippingAddress: { city: "Berlin" } }
```

### React Integration

```tsx
import { useGqlDrift } from "gql-drift/react";

function OrderTable() {
  const { registry, selectedFields, toggleField, query, rows, isLoading } = useGqlDrift({
    typeName: "Order",
    queryName: "orders",
    endpoint: "/graphql",
    defaultFields: ["orderNumber", "status", "customerName"],
  });

  return (
    <div>
      <FieldSelector fields={registry} selected={selectedFields} onToggle={toggleField} />
      <DataTable fields={selectedFields} rows={rows} loading={isLoading} />
    </div>
  );
}
```

## Features

- **Zero static `.graphql` files needed** for dynamic use cases
- **Build-time generation** via CLI script (`gql-drift generate`) for static registries with IDE autocompletion
- **Runtime introspection** for multi-tenant or frequently changing schemas
- **Nested field support** with automatic flattening and unflattening (one level deep by default)
- **Mutation discovery** via naming convention (`Order` -> `updateOrder`, `UpdateOrderInput`)
- **Runtime validation** with auto-generated Zod schemas for both query results and mutation inputs
- **React hooks** for TanStack Query integration with proper cache key management
- **Recursive type detection** with configurable depth limits
- **Field-level authorization** filtering built into the registry
- **Tree-shakeable**: import only what you need (`gql-drift/core`, `gql-drift/react`, `gql-drift/zod`)

## Architecture

```
                          +---------------+
                          | GraphQL       |
                          | Schema        |
                          +-------+-------+
                                  |
                          +-------v-------+
                          | Introspection |
                          +-------+-------+
                                  |
                    +-------------v--------------+
                    |      Field Registry        |
                    |    FieldDefinition[]        |
                    +------+---------------+-----+
                           |               |
                  +--------v----+   +------v---------+
         READ     | Query       |   | Mutation       |   WRITE
                  | Builder     |   | Builder        |
                  +--------+----+   +------+---------+
                           |               |
                  +--------v----+   +------v---------+
                  | fetch +     |   | validate +     |
                  | flatten +   |   | unflatten +    |
                  | validate    |   | fetch          |
                  +--------+----+   +------+---------+
                           |               |
                           +-------+-------+
                                   |
                           +-------v-------+
                           |   Table UI    |
                           +---------------+
```

The `FieldDefinition[]` registry is the single source of truth for both read and write paths.

## Packages

| Package | Description |
|---------|-------------|
| `gql-drift` | Core: introspection, registry builder, query/mutation builders, flatten/unflatten |
| `gql-drift/zod` | Runtime validation schema generators |
| `gql-drift/react` | React hooks with TanStack Query integration |
| `gql-drift/cli` | CLI for build-time field registry generation |

## Requirements

- TypeScript 5.0+
- Node.js 18+ (for build-time generation)
- A GraphQL API with introspection enabled (or a local schema file)
- Optional: Zod 3.x for runtime validation
- Optional: TanStack Query 5.x for React integration

## License

MIT
