/** Simplified scalar type for formatting and validation */
export type FieldType = "string" | "number" | "date" | "boolean" | "enum";

/** A single field definition used throughout the pipeline */
export interface FieldDefinition {
  /** Flat key used in UI and as object property name: "shippingAddressCity" */
  key: string;
  /** Human-readable label: "Ship. City" */
  label: string;
  /** Dot-notation path into the GraphQL response: "shippingAddress.city" */
  graphqlPath: string;
  /** Simplified scalar type for formatting and validation */
  type: FieldType;
  /** Possible values for enum fields */
  enumValues?: string[];
}

/** Signature for a custom GraphQL fetcher */
export type DriftFetcher = (params: {
  query: string;
  variables?: Record<string, unknown>;
}) => Promise<unknown>;

/** Configuration for gql-drift operations */
export interface DriftConfig {
  /** GraphQL endpoint URL */
  endpoint: string;
  /** Optional headers (auth tokens, etc.) */
  headers?: Record<string, string>;
  /** Max nesting depth for introspection (default: 1) */
  maxDepth?: number;
  /** Custom scalar type mapping overrides */
  scalarMap?: Record<string, FieldType>;
  /**
   * Custom GraphQL fetcher. When provided, gql-drift calls this instead of
   * the built-in `fetch`. The function receives `{ query, variables }` and
   * must return the `data` portion of the GraphQL response.
   *
   * ```ts
   * import { GraphQLClient } from "graphql-request";
   * const client = new GraphQLClient("/graphql", { headers: { Authorization: "Bearer ..." } });
   *
   * const config: DriftConfig = {
   *   endpoint: "/graphql",
   *   fetcher: ({ query, variables }) => client.request(query, variables),
   * };
   * ```
   */
  fetcher?: DriftFetcher;
}

/** Mutation operation type */
export type MutationOperation = "update" | "create" | "delete";

/** Raw introspection type from GraphQL __type query */
export interface IntrospectionType {
  name: string | null;
  kind: string;
  ofType?: IntrospectionType;
  enumValues?: { name: string }[];
}

/** A single field from introspection */
export interface IntrospectionField {
  name: string;
  type: IntrospectionType;
}

/** Result of introspecting a GraphQL type */
export interface IntrospectionResult {
  name: string;
  fields: IntrospectionField[];
}

/** Resolved type info from introspection or static generation */
export interface DriftType {
  /** The type name (e.g. "Order") */
  typeName: string;
  /** All available field definitions */
  fields: FieldDefinition[];
  /** Available mutation operations and their names */
  mutations: Map<MutationOperation, string>;
  /** Input (writable) field definitions, if an update input type exists */
  inputFields: FieldDefinition[];
  /** Fields that are both readable and writable */
  editableFields: FieldDefinition[];
}
