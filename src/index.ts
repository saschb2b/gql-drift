// Core types
export type {
  FieldDefinition,
  FieldType,
  DriftConfig,
  DriftFetcher,
  DriftType,
  MutationOperation,
  IntrospectionType,
  IntrospectionField,
  IntrospectionResult,
} from "./core/types.js";

// Drift client
export {
  createDrift,
  createDriftFromRegistry,
  defineDriftType,
} from "./core/drift.js";
export type {
  DriftClient,
  DriftFetchOptions,
  DriftMutateOptions,
  StaticRegistryOptions,
} from "./core/drift.js";

// Introspection
export {
  introspectType,
  discoverMutations,
  unwrapType,
} from "./core/introspection.js";

// Registry
export {
  buildRegistry,
  buildRegistryAsync,
  buildInputRegistry,
  getEditableFields,
  withLabels,
  capitalize,
  formatLabel,
  DEFAULT_SCALAR_MAP,
} from "./core/registry.js";
export type { BuildRegistryConfig } from "./core/registry.js";

// Query builder
export { buildQuery, buildSelectionSet } from "./core/query-builder.js";
export type { BuildQueryOptions } from "./core/query-builder.js";

// Mutation builder
export {
  buildUpdateMutation,
  buildCreateMutation,
  getMutationName,
  getInputTypeName,
} from "./core/mutation-builder.js";

// Fetch
export { gqlFetch } from "./core/fetch.js";

// Flatten / unflatten
export { flatten, unflatten } from "./core/flatten.js";

// Rendering helpers
export {
  formatValue,
  inputType,
  parseInput,
  isEditable,
} from "./core/render.js";
export type { HtmlInputType } from "./core/render.js";
