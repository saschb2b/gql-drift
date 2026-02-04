import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildRegistry,
  buildRegistryAsync,
  buildInputRegistry,
  getEditableFields,
  capitalize,
  formatLabel,
  withLabels,
} from "../../src/core/registry.js";
import type { IntrospectionResult, FieldDefinition, DriftConfig } from "../../src/core/types.js";

describe("capitalize", () => {
  it("capitalizes first character", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  it("handles single character", () => {
    expect(capitalize("a")).toBe("A");
  });

  it("handles already capitalized", () => {
    expect(capitalize("Hello")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });
});

describe("formatLabel", () => {
  it("converts camelCase to title case", () => {
    expect(formatLabel("customerName")).toBe("Customer Name");
  });

  it("handles single word", () => {
    expect(formatLabel("status")).toBe("Status");
  });

  it("handles multiple transitions", () => {
    expect(formatLabel("shippingAddressCity")).toBe("Shipping Address City");
  });
});

describe("buildRegistry", () => {
  const mockIntrospection: IntrospectionResult = {
    name: "Order",
    fields: [
      { name: "id", type: { name: "ID", kind: "SCALAR" } },
      { name: "orderNumber", type: { name: "String", kind: "SCALAR" } },
      { name: "total", type: { name: "Float", kind: "SCALAR" } },
      { name: "status", type: { name: "OrderStatus", kind: "ENUM" } },
      { name: "createdAt", type: { name: "DateTime", kind: "SCALAR" } },
      { name: "isActive", type: { name: "Boolean", kind: "SCALAR" } },
      {
        name: "shippingAddress",
        type: { name: "Address", kind: "OBJECT" },
      },
    ],
  };

  it("builds field definitions from introspection", () => {
    const fields = buildRegistry(mockIntrospection);

    expect(fields).toContainEqual({
      key: "orderNumber",
      label: "Order Number",
      graphqlPath: "orderNumber",
      type: "string",
    });

    expect(fields).toContainEqual({
      key: "total",
      label: "Total",
      graphqlPath: "total",
      type: "number",
    });

    expect(fields).toContainEqual({
      key: "createdAt",
      label: "Created At",
      graphqlPath: "createdAt",
      type: "date",
    });

    expect(fields).toContainEqual({
      key: "isActive",
      label: "Is Active",
      graphqlPath: "isActive",
      type: "boolean",
    });
  });

  it("skips id field", () => {
    const fields = buildRegistry(mockIntrospection);
    expect(fields.find((f) => f.key === "id")).toBeUndefined();
  });

  it("maps ENUM fields as type enum by default", () => {
    const fields = buildRegistry(mockIntrospection);
    const status = fields.find((f) => f.key === "status");
    expect(status).toBeDefined();
    expect(status!.type).toBe("enum");
    expect(status!.enumValues).toEqual([]);
  });

  it("preserves enum values when present in introspection", () => {
    const withEnumValues = {
      ...mockIntrospection,
      fields: [
        ...mockIntrospection.fields.filter((f) => f.name !== "status"),
        {
          name: "status",
          type: {
            name: "OrderStatus",
            kind: "ENUM",
            enumValues: [{ name: "PENDING" }, { name: "SHIPPED" }, { name: "DELIVERED" }],
          },
        },
      ],
    };
    const fields = buildRegistry(withEnumValues);
    const status = fields.find((f) => f.key === "status");
    expect(status).toBeDefined();
    expect(status!.type).toBe("enum");
    expect(status!.enumValues).toEqual(["PENDING", "SHIPPED", "DELIVERED"]);
  });

  it("handles NON_NULL wrapped scalars", () => {
    const introspection: IntrospectionResult = {
      name: "Order",
      fields: [
        {
          name: "orderNumber",
          type: {
            name: null,
            kind: "NON_NULL",
            ofType: { name: "String", kind: "SCALAR" },
          },
        },
      ],
    };

    const fields = buildRegistry(introspection);
    expect(fields).toContainEqual({
      key: "orderNumber",
      label: "Order Number",
      graphqlPath: "orderNumber",
      type: "string",
    });
  });

  it("respects custom scalar map", () => {
    const introspection: IntrospectionResult = {
      name: "Order",
      fields: [{ name: "customField", type: { name: "BigDecimal", kind: "SCALAR" } }],
    };

    const fields = buildRegistry(introspection, {
      scalarMap: { BigDecimal: "number" },
    });
    expect(fields).toContainEqual({
      key: "customField",
      label: "Custom Field",
      graphqlPath: "customField",
      type: "number",
    });
  });

  it("skips unknown scalar types", () => {
    const introspection: IntrospectionResult = {
      name: "Order",
      fields: [{ name: "unknownField", type: { name: "UnknownType", kind: "SCALAR" } }],
    };

    const fields = buildRegistry(introspection);
    expect(fields).toHaveLength(0);
  });
});

describe("getEditableFields", () => {
  it("returns intersection of query and input fields", () => {
    const queryFields: FieldDefinition[] = [
      {
        key: "orderNumber",
        label: "Order Number",
        graphqlPath: "orderNumber",
        type: "string",
      },
      { key: "status", label: "Status", graphqlPath: "status", type: "string" },
      { key: "total", label: "Total", graphqlPath: "total", type: "number" },
      {
        key: "createdAt",
        label: "Created At",
        graphqlPath: "createdAt",
        type: "date",
      },
    ];

    const inputFields: FieldDefinition[] = [
      { key: "status", label: "Status", graphqlPath: "status", type: "string" },
      { key: "total", label: "Total", graphqlPath: "total", type: "number" },
    ];

    const editable = getEditableFields(queryFields, inputFields);
    expect(editable).toHaveLength(2);
    expect(editable.map((f) => f.key)).toEqual(["status", "total"]);
  });

  it("returns empty array when no overlap", () => {
    const queryFields: FieldDefinition[] = [
      {
        key: "orderNumber",
        label: "Order Number",
        graphqlPath: "orderNumber",
        type: "string",
      },
    ];

    const inputFields: FieldDefinition[] = [
      { key: "status", label: "Status", graphqlPath: "status", type: "string" },
    ];

    expect(getEditableFields(queryFields, inputFields)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildRegistryAsync — nested type resolution + labels
// ---------------------------------------------------------------------------

describe("buildRegistryAsync", () => {
  const driftConfig: DriftConfig = {
    endpoint: "http://localhost:4000/graphql",
    maxDepth: 1,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves nested OBJECT types via introspection", async () => {
    const fetchMock = vi
      .fn()
      // First call: introspect Order
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            __type: {
              name: "Order",
              fields: [
                { name: "id", type: { name: "ID", kind: "SCALAR" } },
                { name: "orderNumber", type: { name: "String", kind: "SCALAR" } },
                { name: "customer", type: { name: "Customer", kind: "OBJECT" } },
              ],
            },
          },
        }),
      })
      // Second call: introspect Customer (nested)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            __type: {
              name: "Customer",
              fields: [
                { name: "id", type: { name: "ID", kind: "SCALAR" } },
                { name: "name", type: { name: "String", kind: "SCALAR" } },
                { name: "email", type: { name: "String", kind: "SCALAR" } },
              ],
            },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const fields = await buildRegistryAsync("Order", driftConfig);

    expect(fields).toContainEqual({
      key: "orderNumber",
      label: "Order Number",
      graphqlPath: "orderNumber",
      type: "string",
    });
    expect(fields).toContainEqual({
      key: "customerName",
      label: "Name",
      graphqlPath: "customer.name",
      type: "string",
    });
    expect(fields).toContainEqual({
      key: "customerEmail",
      label: "Email",
      graphqlPath: "customer.email",
      type: "string",
    });
  });

  it("applies label overrides", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          __type: {
            name: "Order",
            fields: [
              { name: "id", type: { name: "ID", kind: "SCALAR" } },
              { name: "orderNumber", type: { name: "String", kind: "SCALAR" } },
              { name: "total", type: { name: "Float", kind: "SCALAR" } },
            ],
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const fields = await buildRegistryAsync("Order", driftConfig, {
      labels: { orderNumber: "Order #", total: "Amount" },
    });

    expect(fields.find((f) => f.key === "orderNumber")?.label).toBe("Order #");
    expect(fields.find((f) => f.key === "total")?.label).toBe("Amount");
  });
});

// ---------------------------------------------------------------------------
// buildInputRegistry — error path
// ---------------------------------------------------------------------------

describe("buildInputRegistry", () => {
  const driftConfig: DriftConfig = {
    endpoint: "http://localhost:4000/graphql",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when input type is not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { __type: null } }),
      }),
    );

    await expect(buildInputRegistry("Order", driftConfig)).rejects.toThrow(
      /Input type "UpdateOrderInput" not found/,
    );
  });

  it("returns fields when input type exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            __type: {
              name: "UpdateOrderInput",
              fields: [
                { name: "orderNumber", type: { name: "String", kind: "SCALAR" } },
                { name: "total", type: { name: "Float", kind: "SCALAR" } },
              ],
            },
          },
        }),
      }),
    );

    const fields = await buildInputRegistry("Order", driftConfig);
    expect(fields).toHaveLength(2);
    expect(fields.map((f) => f.key)).toEqual(["orderNumber", "total"]);
  });
});

// ---------------------------------------------------------------------------
// withLabels
// ---------------------------------------------------------------------------

describe("withLabels", () => {
  const fields: FieldDefinition[] = [
    { key: "orderNumber", label: "Order Number", graphqlPath: "orderNumber", type: "string" },
    { key: "total", label: "Total", graphqlPath: "total", type: "number" },
  ];

  it("returns new array with overridden labels", () => {
    const result = withLabels(fields, { total: "Amount" });
    expect(result.find((f) => f.key === "total")?.label).toBe("Amount");
    expect(result.find((f) => f.key === "orderNumber")?.label).toBe("Order Number");
  });

  it("does not mutate original", () => {
    withLabels(fields, { total: "Amount" });
    expect(fields[1].label).toBe("Total");
  });

  it("ignores keys not in fields", () => {
    const result = withLabels(fields, { nonExistent: "Label" });
    expect(result).toHaveLength(2);
  });
});
