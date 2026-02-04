import type { DriftConfig, DriftType, FieldDefinition } from "../core/types.js";
import { buildQuery } from "../core/query-builder.js";
import {
  buildUpdateMutation,
  buildCreateMutation,
} from "../core/mutation-builder.js";
import { flatten, unflatten } from "../core/flatten.js";
import { gqlFetch } from "../core/fetch.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultQueryName(typeName: string): string {
  return typeName.charAt(0).toLowerCase() + typeName.slice(1) + "s";
}

async function runValidation(
  values: Record<string, unknown>,
  fields: FieldDefinition[],
  validate?: boolean,
  validateFn?: (values: Record<string, unknown>) => Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (validateFn) return validateFn(values);
  if (validate) {
    const { buildInputSchema } = await import("../zod/index.js");
    const schema = buildInputSchema(fields);
    return schema.parse(values) as Record<string, unknown>;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export interface DriftQueryKeyParams {
  /** The resolved DriftType */
  type: DriftType;
  /** Query name. Defaults to lowercase(typeName) + "s" */
  queryName?: string;
  /** Fields to include in the key. Defaults to type.fields */
  fields?: FieldDefinition[];
  /** Filter variables (included in key for caching) */
  filter?: Record<string, unknown>;
}

/**
 * Build a stable query key for cache operations.
 *
 * ```ts
 * queryClient.invalidateQueries({ queryKey: driftQueryKey({ type: orderType }) });
 * ```
 */
export function driftQueryKey(params: DriftQueryKeyParams): unknown[] {
  const qName = params.queryName ?? defaultQueryName(params.type.typeName);
  const fields = params.fields ?? params.type.fields;
  const sortedKeys = fields.map((f) => f.key).sort();
  return [qName, sortedKeys, params.filter];
}

// ---------------------------------------------------------------------------
// Query options factory
// ---------------------------------------------------------------------------

export interface DriftQueryOptionsParams {
  /** The resolved DriftType */
  type: DriftType;
  /** Query name (e.g. "orders"). Defaults to lowercase(typeName) + "s" */
  queryName?: string;
  /** Fields to query. Defaults to type.fields */
  fields?: FieldDefinition[];
  /** Drift config (endpoint + headers) */
  config: DriftConfig;
  /** Filter variables */
  filter?: Record<string, unknown>;
  /** Filter type name for the GraphQL query signature */
  filterType?: string;
}

/**
 * Returns TanStack Query options for a drift query. Spread into `useQuery()`.
 *
 * ```tsx
 * const { data } = useQuery({
 *   ...driftQueryOptions({ type: orderType, config }),
 * });
 * ```
 */
export function driftQueryOptions(params: DriftQueryOptionsParams) {
  const { type, config, filter, filterType } = params;
  const qName = params.queryName ?? defaultQueryName(type.typeName);
  const fields = params.fields ?? type.fields;

  const queryKey = driftQueryKey({ type, queryName: qName, fields, filter });

  const query = buildQuery(
    qName,
    fields,
    filterType ? { filter: filterType } : undefined,
  );

  return {
    queryKey,
    queryFn: async () => {
      const data = (await gqlFetch(
        config,
        query,
        filter ? { filter } : undefined,
      )) as Record<string, unknown>;
      const list = data[qName];
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => flatten(item, fields));
    },
  };
}

// ---------------------------------------------------------------------------
// Update mutation options factory
// ---------------------------------------------------------------------------

export interface DriftUpdateMutationParams {
  /** The resolved DriftType */
  type: DriftType;
  /** Drift config (endpoint + headers) */
  config: DriftConfig;
  /** Fields to return after mutation. Defaults to type.fields */
  fields?: FieldDefinition[];
  /** Enable Zod validation before sending */
  validate?: boolean;
  /** Custom validation function (takes precedence over validate) */
  validateFn?: (values: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Returns TanStack Query mutation options for an update operation. Spread into `useMutation()`.
 *
 * ```tsx
 * const { mutate } = useMutation({
 *   ...driftUpdateMutation({ type: orderType, config }),
 *   onSuccess: () => queryClient.invalidateQueries({ queryKey: orderQueryKey() }),
 * });
 * mutate({ id: "1", values: { orderNumber: "NEW-001" } });
 * ```
 */
export function driftUpdateMutation(params: DriftUpdateMutationParams) {
  const { type, config, validate, validateFn } = params;
  const returnFields = params.fields ?? type.fields;
  const editableFields = type.editableFields;

  const mutationStr = buildUpdateMutation(type.typeName, returnFields);

  return {
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Record<string, unknown>;
    }) => {
      const validated = await runValidation(
        values,
        editableFields,
        validate,
        validateFn,
      );
      const input = unflatten(validated, editableFields);
      return gqlFetch(config, mutationStr, { id, input });
    },
  };
}

// ---------------------------------------------------------------------------
// Create mutation options factory
// ---------------------------------------------------------------------------

export interface DriftCreateMutationParams {
  /** The resolved DriftType */
  type: DriftType;
  /** Drift config (endpoint + headers) */
  config: DriftConfig;
  /** Fields to return after mutation. Defaults to type.fields */
  fields?: FieldDefinition[];
  /** Enable Zod validation before sending */
  validate?: boolean;
  /** Custom validation function (takes precedence over validate) */
  validateFn?: (values: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Returns TanStack Query mutation options for a create operation. Spread into `useMutation()`.
 *
 * ```tsx
 * const { mutate } = useMutation({
 *   ...driftCreateMutation({ type: orderType, config }),
 *   onSuccess: () => queryClient.invalidateQueries({ queryKey: orderQueryKey() }),
 * });
 * mutate({ values: { orderNumber: "ORD-999", total: 42 } });
 * ```
 */
export function driftCreateMutation(params: DriftCreateMutationParams) {
  const { type, config, validate, validateFn } = params;
  const returnFields = params.fields ?? type.fields;
  const inputFields =
    type.inputFields.length > 0 ? type.inputFields : type.editableFields;

  const mutationStr = buildCreateMutation(type.typeName, returnFields);

  return {
    mutationFn: async ({ values }: { values: Record<string, unknown> }) => {
      const validated = await runValidation(
        values,
        inputFields,
        validate,
        validateFn,
      );
      const input = unflatten(validated, inputFields);
      return gqlFetch(config, mutationStr, { input });
    },
  };
}
