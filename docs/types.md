# Types and Conventions

## FieldDefinition

The single source of truth for the entire pipeline. Every module consumes or produces these.

```ts
type FieldType = "string" | "number" | "date" | "boolean" | "enum";

interface FieldDefinition {
  key: string;            // Flat key for UI: "shippingAddressCity"
  label: string;          // Human label: "Shipping Address City"
  graphqlPath: string;    // Dot-notation path: "shippingAddress.city"
  type: FieldType;
  enumValues?: string[];  // For enum fields: ["PENDING", "SHIPPED", "DELIVERED"]
}
```

- `key` is camelCase, no dots. Used as object property names in flattened rows.
- `graphqlPath` maps to the nested GraphQL response shape. `flatten`/`unflatten` use it.
- `label` is auto-generated from `key` via `formatLabel()` (camelCase -> space-separated title case). Overridable via `withLabels()` or the `labels` config option.

## DriftConfig

```ts
type DriftFetcher = (params: {
  query: string;
  variables?: Record<string, unknown>;
}) => Promise<unknown>;

interface DriftConfig {
  endpoint: string;
  headers?: Record<string, string>;
  maxDepth?: number;                        // Nesting depth for introspection (default: 1)
  scalarMap?: Record<string, FieldType>;    // Override scalar -> FieldType mapping
  fetcher?: DriftFetcher;                   // Custom GraphQL client (overrides built-in fetch)
}
```

When `fetcher` is provided, it receives `{ query, variables }` and must return the `data` portion of the GraphQL response. `endpoint` and `headers` are ignored in that case.

Default scalar mapping: `String->string`, `Int->number`, `Float->number`, `Boolean->boolean`, `DateTime->date`, `ID->string`.

## DriftType

Resolved type metadata. Produced by `defineDriftType()` (from CLI-generated data) or runtime introspection.

```ts
interface DriftType {
  typeName: string;
  fields: FieldDefinition[];
  mutations: Map<MutationOperation, string>;  // "update" -> "updateOrder"
  inputFields: FieldDefinition[];
  editableFields: FieldDefinition[];          // Intersection of fields + inputFields
}
```

## Naming Conventions

- Mutation names: `{operation}{TypeName}` -> `updateOrder`, `createOrder`, `deleteOrder`
- Input type names: `{Operation}{TypeName}Input` -> `UpdateOrderInput`, `CreateOrderInput`
- Flat keys: nested paths concatenated in camelCase -> `shippingAddress.city` -> `shippingAddressCity`
- Default query name: `lowercase(typeName) + "s"` -> `"Order"` -> `"orders"`
