# CLI and Code Generation

Entry point: `src/cli/index.ts`. Binary: `gql-drift`.

## Commands

### `gql-drift init`

Creates a `gql-drift.config.json` in the current directory with a template:

```json
{
  "endpoint": "http://localhost:4000/graphql",
  "types": ["Order"],
  "out": "src/generated",
  "depth": 1
}
```

### `gql-drift generate`

Generates TypeScript files from schema introspection.

```
Options:
  --endpoint <url>     GraphQL endpoint URL
  --schema <path>      Local .graphql SDL file (alternative to --endpoint)
  --types <names>      Comma-separated type names
  --out <path>         Output directory (default: src/generated)
  --depth <n>          Max nesting depth (default: 1)
  --header <value>     HTTP header as "Key: Value" (repeatable)
```

Config file values are defaults. CLI flags override them.

## Config File

`src/cli/config.ts`

Loads from (in order): `gql-drift.config.json`, `gql-drift.config.ts`, `gql-drift.config.js`.

```ts
interface DriftCliConfig {
  endpoint?: string;
  schema?: string; // path to local .graphql file
  types: string[];
  out: string; // default: "src/generated"
  depth: number; // default: 1
  headers: Record<string, string>;
}
```

`mergeConfig(fileConfig, cliArgs)` — CLI args override file defaults. Headers are merged (CLI wins on conflict).

## Local Schema Support

`src/cli/schema.ts`

When `--schema` is used, introspection happens locally via the `graphql` package (optional peer dep):

- `loadSchemaFromFile(path)` — reads SDL, builds `GraphQLSchema`
- `introspectTypeFromSchema(typeName, schema)` — runs introspection query against local schema
- `discoverMutationsFromSchema(typeName, schema)` — checks for `updateX`/`createX`/`deleteX` in Mutation root

No running server needed.

## Generated Output Shape

For a type `Order`, the CLI generates `src/generated/order.ts`:

```ts
// Data exports
export const ORDER_FIELDS: FieldDefinition[];
export const ORDER_INPUT_FIELDS: FieldDefinition[]; // if input type exists
export const ORDER_EDITABLE_FIELDS: FieldDefinition[]; // if input type exists
export const ORDER_MUTATIONS: { operation; mutationName; inputTypeName }[];
export const orderType: DriftType; // via defineDriftType()

// TanStack Query options factories (close over orderType)
export function orderQueryOptions(params); // -> { queryKey, queryFn }
export function updateOrderMutation(params); // -> { mutationFn } (if update exists)
export function createOrderMutation(params); // -> { mutationFn } (if create exists)
export function orderQueryKey(params?); // -> unknown[]
```

Imports from `gql-drift` and `gql-drift/react`. Mutation factories are only generated when the corresponding mutation exists in the schema.
