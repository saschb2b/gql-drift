import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineDriftType, createDriftFromRegistry } from "../../src/core/drift.js";
import type { FieldDefinition, DriftConfig, MutationOperation } from "../../src/core/types.js";

const ORDER_FIELDS: FieldDefinition[] = [
  { key: "orderNumber", label: "Order #", graphqlPath: "orderNumber", type: "string" },
  {
    key: "status",
    label: "Status",
    graphqlPath: "status",
    type: "enum",
    enumValues: ["PENDING", "SHIPPED"],
  },
  { key: "total", label: "Total", graphqlPath: "total", type: "number" },
  { key: "createdAt", label: "Created", graphqlPath: "createdAt", type: "date" },
];

const ORDER_INPUT_FIELDS: FieldDefinition[] = [
  {
    key: "status",
    label: "Status",
    graphqlPath: "status",
    type: "enum",
    enumValues: ["PENDING", "SHIPPED"],
  },
  { key: "total", label: "Total", graphqlPath: "total", type: "number" },
];

const ORDER_MUTATIONS: {
  operation: MutationOperation;
  mutationName: string;
  inputTypeName: string;
}[] = [
  { operation: "update", mutationName: "updateOrder", inputTypeName: "UpdateOrderInput" },
  { operation: "create", mutationName: "createOrder", inputTypeName: "CreateOrderInput" },
];

const config: DriftConfig = { endpoint: "http://localhost:4000/graphql" };

describe("defineDriftType", () => {
  it("creates a DriftType from static registry", () => {
    const type = defineDriftType({
      typeName: "Order",
      fields: ORDER_FIELDS,
      mutations: ORDER_MUTATIONS,
      inputFields: ORDER_INPUT_FIELDS,
    });

    expect(type.typeName).toBe("Order");
    expect(type.fields).toBe(ORDER_FIELDS);
    expect(type.mutations.get("update")).toBe("updateOrder");
    expect(type.mutations.get("create")).toBe("createOrder");
    expect(type.inputFields).toBe(ORDER_INPUT_FIELDS);
    expect(type.editableFields).toHaveLength(2);
    expect(type.editableFields.map((f) => f.key)).toEqual(["status", "total"]);
  });

  it("auto-derives editableFields from query/input intersection", () => {
    const type = defineDriftType({
      typeName: "Order",
      fields: ORDER_FIELDS,
      inputFields: ORDER_INPUT_FIELDS,
    });

    expect(type.editableFields.map((f) => f.key)).toEqual(["status", "total"]);
  });

  it("defaults inputFields to all fields when not provided", () => {
    const type = defineDriftType({
      typeName: "Order",
      fields: ORDER_FIELDS,
    });

    // All fields are assumed writable
    expect(type.inputFields).toBe(ORDER_FIELDS);
    expect(type.editableFields).toEqual(ORDER_FIELDS);
  });

  it("allows explicit editableFields override", () => {
    const editable = [ORDER_FIELDS[1]]; // just status
    const type = defineDriftType({
      typeName: "Order",
      fields: ORDER_FIELDS,
      inputFields: ORDER_INPUT_FIELDS,
      editableFields: editable,
    });

    expect(type.editableFields).toBe(editable);
  });

  it("handles empty mutations", () => {
    const type = defineDriftType({
      typeName: "Order",
      fields: ORDER_FIELDS,
    });

    expect(type.mutations.size).toBe(0);
  });
});

describe("createDriftFromRegistry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves types instantly without network calls", async () => {
    const drift = createDriftFromRegistry(config, {
      typeName: "Order",
      fields: ORDER_FIELDS,
      mutations: ORDER_MUTATIONS,
      inputFields: ORDER_INPUT_FIELDS,
    });

    // No fetch should be called
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const order = await drift.type("Order");
    expect(order.typeName).toBe("Order");
    expect(order.fields).toHaveLength(4);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws for unknown types", async () => {
    const drift = createDriftFromRegistry(config, {
      typeName: "Order",
      fields: ORDER_FIELDS,
    });

    await expect(drift.type("Customer")).rejects.toThrow('Type "Customer" was not provided');
  });

  it("supports multiple registries", async () => {
    const customerFields: FieldDefinition[] = [
      { key: "name", label: "Name", graphqlPath: "name", type: "string" },
    ];

    const drift = createDriftFromRegistry(
      config,
      { typeName: "Order", fields: ORDER_FIELDS },
      { typeName: "Customer", fields: customerFields },
    );

    const order = await drift.type("Order");
    const customer = await drift.type("Customer");

    expect(order.typeName).toBe("Order");
    expect(customer.typeName).toBe("Customer");
  });

  it("fetches data using the static registry", async () => {
    const drift = createDriftFromRegistry(config, {
      typeName: "Order",
      fields: ORDER_FIELDS,
      mutations: ORDER_MUTATIONS,
      inputFields: ORDER_INPUT_FIELDS,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              orders: [
                {
                  id: "1",
                  orderNumber: "ORD-001",
                  status: "SHIPPED",
                  total: 99.99,
                  createdAt: "2024-01-01",
                },
              ],
            },
          }),
      }),
    );

    const order = await drift.type("Order");
    const { rows } = await drift.fetch("orders", order);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: "1",
      orderNumber: "ORD-001",
      status: "SHIPPED",
      total: 99.99,
      createdAt: "2024-01-01",
    });
  });
});
