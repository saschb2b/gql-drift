import { gqlFetch } from "./fetch.js";
import { flatten, unflatten } from "./flatten.js";
import { discoverMutations } from "./introspection.js";
import { buildUpdateMutation, buildCreateMutation } from "./mutation-builder.js";
import { buildQuery, type BuildQueryOptions } from "./query-builder.js";
import { buildRegistryAsync, buildInputRegistry, getEditableFields } from "./registry.js";
import type { DriftConfig, DriftType, FieldDefinition, MutationOperation } from "./types.js";

/** Options for fetching data via the drift client */
export interface DriftFetchOptions {
  /** Which fields to select (defaults to all) */
  fields?: FieldDefinition[];
  /** Query builder options (filter type, extra variables) */
  queryOptions?: BuildQueryOptions;
  /** Variables to pass to the query */
  variables?: Record<string, unknown>;
}

/** Options for mutating data via the drift client */
export interface DriftMutateOptions {
  /** The row ID (required for update, omit for create) */
  id?: string;
  /** Flat key-value pairs of the changed fields */
  values: Record<string, unknown>;
  /** Which fields to return after mutation (defaults to all type fields) */
  returnFields?: FieldDefinition[];
}

/** The drift client returned by createDrift() */
export interface DriftClient {
  /** The bound config */
  config: DriftConfig;

  /**
   * Introspect a type and resolve its full field registry, mutations, and editable fields.
   * Results are cached per type name.
   */
  type(typeName: string): Promise<DriftType>;

  /**
   * Build a query string for a type. Convenience wrapper around buildQuery.
   */
  query(queryName: string, fields: FieldDefinition[], options?: BuildQueryOptions): string;

  /**
   * Execute a query against the endpoint and return flattened rows.
   */
  fetch(
    queryName: string,
    type: DriftType,
    options?: DriftFetchOptions,
  ): Promise<{ rows: Record<string, unknown>[]; raw: unknown }>;

  /**
   * Execute an update mutation and return the result.
   */
  update(type: DriftType, options: DriftMutateOptions): Promise<unknown>;

  /**
   * Execute a create mutation and return the result.
   */
  create(type: DriftType, options: DriftMutateOptions): Promise<unknown>;

  /** Lower-level: build a query string */
  buildQuery: typeof buildQuery;
  /** Lower-level: build an update mutation string */
  buildUpdateMutation: typeof buildUpdateMutation;
  /** Lower-level: build a create mutation string */
  buildCreateMutation: typeof buildCreateMutation;
  /** Lower-level: flatten a nested response */
  flatten: typeof flatten;
  /** Lower-level: unflatten flat data to nested */
  unflatten: typeof unflatten;
}

/**
 * Create a drift client with runtime introspection.
 *
 * ```ts
 * const drift = createDrift({ endpoint: "/graphql" });
 * const order = await drift.type("Order");
 * const { rows } = await drift.fetch("orders", order);
 * ```
 */
export function createDrift(config: DriftConfig): DriftClient {
  const typeCache = new Map<string, Promise<DriftType>>();

  function resolveType(typeName: string): Promise<DriftType> {
    const cached = typeCache.get(typeName);
    if (cached) return cached;

    const promise = (async (): Promise<DriftType> => {
      const fields = await buildRegistryAsync(typeName, config);

      let mutations: Map<MutationOperation, string>;
      try {
        mutations = await discoverMutations(typeName, config);
      } catch {
        mutations = new Map();
      }

      let inputFields: FieldDefinition[] = [];
      try {
        inputFields = await buildInputRegistry(typeName, config);
      } catch {
        // No input type found
      }

      const editableFields = getEditableFields(fields, inputFields);

      return { typeName, fields, mutations, inputFields, editableFields };
    })();

    typeCache.set(typeName, promise);
    return promise;
  }

  return createClientFromResolver(config, resolveType);
}

/** Options for creating a DriftType from a static (CLI-generated) registry */
export interface StaticRegistryOptions {
  /** The type name (e.g. "Order") */
  typeName: string;
  /** All field definitions (from CLI generation) */
  fields: FieldDefinition[];
  /** Mutation info from CLI generation */
  mutations?: {
    operation: MutationOperation;
    mutationName: string;
    inputTypeName: string;
  }[];
  /** Input (writable) field definitions. If omitted, all fields are assumed writable. */
  inputFields?: FieldDefinition[];
  /** Editable fields (intersection of query + input). Auto-derived if inputFields is given. */
  editableFields?: FieldDefinition[];
}

/**
 * Create a DriftType from a static (CLI-generated) registry.
 * Bridges the gap between `gql-drift generate` output and the runtime API.
 *
 * ```ts
 * import { ORDER_FIELDS, ORDER_MUTATIONS } from "./generated/order";
 *
 * const orderType = defineDriftType({
 *   typeName: "Order",
 *   fields: ORDER_FIELDS,
 *   mutations: ORDER_MUTATIONS,
 * });
 * ```
 */
export function defineDriftType(options: StaticRegistryOptions): DriftType {
  const { typeName, fields, mutations: mutationList, inputFields } = options;

  const mutations = new Map<MutationOperation, string>();
  if (mutationList) {
    for (const m of mutationList) {
      mutations.set(m.operation, m.mutationName);
    }
  }

  const resolvedInputFields = inputFields ?? fields;
  const editableFields = options.editableFields ?? getEditableFields(fields, resolvedInputFields);

  return {
    typeName,
    fields,
    mutations,
    inputFields: resolvedInputFields,
    editableFields,
  };
}

/**
 * Create a drift client from a pre-built static registry. No introspection needed.
 *
 * ```ts
 * import { ORDER_FIELDS, ORDER_MUTATIONS } from "./generated/order";
 *
 * const drift = createDriftFromRegistry(
 *   { endpoint: "/graphql" },
 *   { typeName: "Order", fields: ORDER_FIELDS, mutations: ORDER_MUTATIONS },
 * );
 * const order = await drift.type("Order"); // instant, no network call
 * ```
 */
export function createDriftFromRegistry(
  config: DriftConfig,
  ...registries: StaticRegistryOptions[]
): DriftClient {
  const types = new Map<string, DriftType>();
  for (const reg of registries) {
    types.set(reg.typeName, defineDriftType(reg));
  }

  function resolveType(typeName: string): Promise<DriftType> {
    const cached = types.get(typeName);
    if (cached) return Promise.resolve(cached);
    return Promise.reject(
      new Error(
        `Type "${typeName}" was not provided in the static registry. ` +
          `Available types: ${[...types.keys()].join(", ")}`,
      ),
    );
  }

  return createClientFromResolver(config, resolveType);
}

function createClientFromResolver(
  config: DriftConfig,
  resolveType: (typeName: string) => Promise<DriftType>,
): DriftClient {
  return {
    config,
    type: resolveType,
    query: buildQuery,

    async fetch(queryName, type, options) {
      const fields = options?.fields ?? type.fields;
      const queryStr = buildQuery(queryName, fields, options?.queryOptions);
      const data = (await gqlFetch(config, queryStr, options?.variables)) as Record<
        string,
        unknown
      >;

      const list = data[queryName];
      const rows = Array.isArray(list)
        ? list.map((item: Record<string, unknown>) => flatten(item, fields))
        : [];

      return { rows, raw: data };
    },

    async update(type, options) {
      if (!options.id) throw new Error("Update requires an id");
      const returnFields = options.returnFields ?? type.fields;
      const mutationStr = buildUpdateMutation(type.typeName, returnFields);
      const input = unflatten(options.values, type.editableFields);
      return gqlFetch(config, mutationStr, { id: options.id, input });
    },

    async create(type, options) {
      const returnFields = options.returnFields ?? type.fields;
      const mutationStr = buildCreateMutation(type.typeName, returnFields);
      const input = unflatten(options.values, type.inputFields);
      return gqlFetch(config, mutationStr, { input });
    },

    buildQuery,
    buildUpdateMutation,
    buildCreateMutation,
    flatten,
    unflatten,
  };
}
