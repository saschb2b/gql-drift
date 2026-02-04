import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useRef } from "react";
import { gqlFetch } from "../core/fetch.js";
import { flatten, unflatten } from "../core/flatten.js";
import { discoverMutations } from "../core/introspection.js";
import { buildUpdateMutation, buildCreateMutation } from "../core/mutation-builder.js";
import { buildQuery } from "../core/query-builder.js";
import { buildRegistryAsync, buildInputRegistry, getEditableFields } from "../core/registry.js";
import { formatValue, inputType, parseInput } from "../core/render.js";
import { driftQueryKey } from "./options.js";
import { useDriftConfig } from "./provider.js";
import type { UseMutationResult } from "@tanstack/react-query";
import type { FieldDefinition, DriftConfig, DriftType, MutationOperation } from "../core/types.js";

// Re-export rendering helpers
export { formatValue, inputType, parseInput } from "../core/render.js";
export type { HtmlInputType } from "../core/render.js";

// Re-export provider
export { DriftProvider, useDriftConfig } from "./provider.js";
export type { DriftProviderProps } from "./provider.js";

// Re-export options factories
export {
  driftQueryOptions,
  driftUpdateMutation,
  driftCreateMutation,
  driftQueryKey,
} from "./options.js";
export type {
  DriftQueryOptionsParams,
  DriftUpdateMutationParams,
  DriftCreateMutationParams,
  DriftQueryKeyParams,
} from "./options.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultQueryName(typeName: string): string {
  return typeName.charAt(0).toLowerCase() + typeName.slice(1) + "s";
}

// ---------------------------------------------------------------------------
// useDriftType - the "just works" hook
// ---------------------------------------------------------------------------

export interface UseDriftTypeOptions {
  /** The GraphQL type name (e.g. "Order"). Required if `type` is not provided. */
  typeName?: string;
  /**
   * The GraphQL query name (e.g. "orders").
   * Defaults to lowercase(typeName) + "s" (e.g. "Order" -> "orders").
   */
  queryName?: string;
  /**
   * Drift config. Optional if a DriftProvider is present higher in the tree.
   */
  config?: DriftConfig;
  /**
   * Pre-built DriftType from CLI generation or defineDriftType().
   * When provided, skips introspection entirely.
   */
  type?: DriftType;
  /** Initial selected field keys. Omit to select all. */
  initialKeys?: string[];
  /** Optional filter type name (e.g. "OrderFilter") */
  filterType?: string;
  /** Optional filter variables */
  filter?: Record<string, unknown>;
  /**
   * When true, mutation inputs are validated against a Zod schema
   * built from the editable fields before sending.
   * Requires `gql-drift/zod` (and `zod`) to be installed.
   */
  validate?: boolean;
  /**
   * Custom validation function. Takes flat key-value pairs, should throw on
   * invalid input or return the (potentially transformed) values.
   * When provided, takes precedence over `validate: true`.
   */
  validateFn?: (values: Record<string, unknown>) => Record<string, unknown>;
}

export interface UseDriftTypeResult {
  /** Whether the type is still being introspected (always false with static type) */
  isIntrospecting: boolean;
  /** Error during introspection */
  introspectionError: Error | null;
  /** The resolved type info (null while introspecting) */
  type: DriftType | null;
  /** Full field registry (empty while introspecting) */
  registry: FieldDefinition[];
  /** Fields that are both readable and writable */
  editableFields: FieldDefinition[];
  /** Currently selected field definitions */
  selectedFields: FieldDefinition[];
  /** Currently selected field keys */
  selectedKeys: Set<string>;
  /** Toggle a field on/off by key */
  toggleField: (key: string) => void;
  /** Set the selected keys directly */
  setSelectedKeys: (keys: string[]) => void;
  /** The generated GraphQL query string */
  query: string;
  /** Flattened row data */
  rows: Record<string, unknown>[];
  /** Whether data is loading (introspection OR query) */
  isLoading: boolean;
  /** Data fetch error */
  error: Error | null;
  /** Update a row. Pass flat key-value pairs, unflattening is handled automatically. */
  updateRow: (id: string, values: Record<string, unknown>) => Promise<unknown>;
  /** Create a row. Pass flat key-value pairs. */
  createRow: (values: Record<string, unknown>) => Promise<unknown>;
  /** The underlying TanStack Query update mutation */
  updateMutation: UseMutationResult<
    unknown,
    Error,
    { id: string; values: Record<string, unknown> }
  >;
  /** The underlying TanStack Query create mutation */
  createMutation: UseMutationResult<unknown, Error, { values: Record<string, unknown> }>;
  /** Format a value for display based on field type */
  format: (field: FieldDefinition, value: unknown) => string;
  /** Get the HTML input type for a field */
  inputType: (field: FieldDefinition) => string;
  /** Parse a raw input string into the correct type for a field */
  parseInput: (field: FieldDefinition, raw: string | boolean) => unknown;
  /** Check if a field is editable */
  isEditable: (field: FieldDefinition) => boolean;
}

/**
 * All-in-one hook for a dynamic GraphQL type with field selection,
 * data fetching, mutations, and rendering helpers.
 *
 * Two modes:
 * 1. **Runtime introspection**: pass `typeName` and it discovers everything from the schema.
 * 2. **Static registry**: pass `type` (from CLI generation / `defineDriftType`) and it skips introspection.
 *
 * Config can come from a `DriftProvider` or be passed directly.
 * `queryName` defaults to `lowercase(typeName) + "s"`.
 *
 * ```tsx
 * // Minimal (with DriftProvider + CLI-generated type)
 * const { rows, toggleField } = useDriftType({ type: orderType });
 *
 * // Explicit config
 * const { rows, toggleField } = useDriftType({
 *   typeName: "Order",
 *   config: { endpoint: "/graphql" },
 * });
 * ```
 */
export function useDriftType(options: UseDriftTypeOptions): UseDriftTypeResult {
  const {
    typeName: typeNameProp,
    type: staticType,
    initialKeys,
    filterType,
    filter,
    validate: shouldValidate,
    validateFn,
  } = options;

  // --- Resolve config (explicit > provider) ---
  const providerConfig = useDriftConfig();
  const config = options.config ?? providerConfig;
  if (!config) {
    throw new Error("useDriftType requires `config` or a <DriftProvider> higher in the tree");
  }

  // --- Resolve type name and query name ---
  const typeName = staticType?.typeName ?? typeNameProp;
  if (!typeName) {
    throw new Error("useDriftType requires either `typeName` or `type` option");
  }

  const queryName = options.queryName ?? defaultQueryName(typeName);

  // --- Introspection (skipped when staticType is provided) ---
  const configRef = useRef(config);
  configRef.current = config;

  const introspectionResult = useQuery<DriftType>({
    queryKey: ["__gql_drift_introspect", typeName, config.endpoint],
    queryFn: async () => {
      const cfg = configRef.current;
      const fields = await buildRegistryAsync(typeName, cfg);

      let mutations = new Map<MutationOperation, string>();
      try {
        mutations = await discoverMutations(typeName, cfg);
      } catch {
        // No mutations
      }

      let inputFields: FieldDefinition[] = [];
      try {
        inputFields = await buildInputRegistry(typeName, cfg);
      } catch {
        // No input type
      }

      const editableFields = getEditableFields(fields, inputFields);
      return { typeName, fields, mutations, inputFields, editableFields };
    },
    staleTime: Infinity,
    enabled: !staticType,
  });

  const driftType = staticType ?? introspectionResult.data ?? null;
  const registry = useMemo(() => driftType?.fields ?? [], [driftType]);
  const editableFields = useMemo(() => driftType?.editableFields ?? [], [driftType]);
  const editableKeySet = useMemo(() => new Set(editableFields.map((f) => f.key)), [editableFields]);

  // --- Field selection ---
  const [selectedKeySet, setSelectedKeySet] = useState<Set<string> | null>(
    initialKeys ? new Set(initialKeys) : null,
  );

  const effectiveKeys = useMemo(() => {
    if (selectedKeySet !== null) return selectedKeySet;
    if (registry.length === 0) return new Set<string>();
    return new Set(registry.map((f) => f.key));
  }, [selectedKeySet, registry]);

  const selectedFields = useMemo(
    () => registry.filter((f) => effectiveKeys.has(f.key)),
    [registry, effectiveKeys],
  );

  const queryOptions = useMemo(
    () => (filterType ? { filter: filterType } : undefined),
    [filterType],
  );
  const query = useMemo(
    () => (selectedFields.length > 0 ? buildQuery(queryName, selectedFields, queryOptions) : ""),
    [queryName, selectedFields, queryOptions],
  );

  // --- Data fetching ---
  const dataResult = useQuery({
    queryKey: driftQueryKey({
      type: driftType ?? {
        typeName,
        fields: [],
        mutations: new Map(),
        inputFields: [],
        editableFields: [],
      },
      queryName,
      fields: selectedFields,
      filter,
    }),
    queryFn: async () => {
      return gqlFetch(config, query, filter ? { filter } : undefined);
    },
    enabled: selectedFields.length > 0 && driftType !== null,
  });

  const rows = useMemo(() => {
    const data = dataResult.data as Record<string, unknown> | undefined;
    if (!data) return [];
    const list = data[queryName];
    if (!Array.isArray(list)) return [];
    return list.map((item: Record<string, unknown>) => flatten(item, selectedFields));
  }, [dataResult.data, queryName, selectedFields]);

  // --- Validation helper ---
  const validateValues = useCallback(
    async (
      values: Record<string, unknown>,
      fields: FieldDefinition[],
    ): Promise<Record<string, unknown>> => {
      if (validateFn) {
        return validateFn(values);
      }
      if (shouldValidate) {
        const { buildInputSchema } = await import("../zod/index.js");
        const schema = buildInputSchema(fields);
        return schema.parse(values);
      }
      return values;
    },
    [shouldValidate, validateFn],
  );

  // --- Mutations ---
  const queryClient = useQueryClient();

  const updateMutation = useMutation<
    unknown,
    Error,
    { id: string; values: Record<string, unknown> }
  >({
    mutationFn: async ({ id, values }) => {
      const validated = await validateValues(values, editableFields);
      const returnFields = selectedFields.length > 0 ? selectedFields : registry;
      const mutationStr = buildUpdateMutation(typeName, returnFields);
      const input = unflatten(validated, editableFields);
      return gqlFetch(config, mutationStr, { id, input });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [queryName] });
    },
  });

  const createMutation = useMutation<unknown, Error, { values: Record<string, unknown> }>({
    mutationFn: async ({ values }) => {
      const inputFields = driftType?.inputFields ?? editableFields;
      const validated = await validateValues(values, inputFields);
      const returnFields = selectedFields.length > 0 ? selectedFields : registry;
      const mutationStr = buildCreateMutation(typeName, returnFields);
      const input = unflatten(validated, inputFields);
      return gqlFetch(config, mutationStr, { input });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [queryName] });
    },
  });

  // --- Selection helpers ---
  const toggleField = useCallback(
    (key: string) => {
      setSelectedKeySet((prev) => {
        const base = prev ?? new Set(registry.map((f) => f.key));
        const next = new Set(base);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [registry],
  );

  const setSelectedKeys = useCallback((keys: string[]) => {
    setSelectedKeySet(new Set(keys));
  }, []);

  // --- Rendering helpers (bound to avoid re-importing) ---
  const format = useCallback(
    (field: FieldDefinition, value: unknown) => formatValue(field, value),
    [],
  );

  const getInputType = useCallback((field: FieldDefinition) => inputType(field), []);

  const parse = useCallback(
    (field: FieldDefinition, raw: string | boolean) => parseInput(field, raw),
    [],
  );

  const checkEditable = useCallback(
    (field: FieldDefinition) => editableKeySet.has(field.key),
    [editableKeySet],
  );

  const isIntrospecting = staticType ? false : introspectionResult.isLoading;

  return {
    isIntrospecting,
    introspectionError: staticType ? null : introspectionResult.error,
    type: driftType,
    registry,
    editableFields,
    selectedFields,
    selectedKeys: effectiveKeys,
    toggleField,
    setSelectedKeys,
    query,
    rows,
    isLoading: isIntrospecting || dataResult.isLoading,
    error: dataResult.error,
    updateRow: (id, values) => updateMutation.mutateAsync({ id, values }),
    createRow: (values) => createMutation.mutateAsync({ values }),
    updateMutation,
    createMutation,
    format,
    inputType: getInputType,
    parseInput: parse,
    isEditable: checkEditable,
  };
}
