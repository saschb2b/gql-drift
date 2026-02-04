import { describe, it, expect } from "vitest";
import {
  buildRegistry,
  getEditableFields,
  capitalize,
  formatLabel,
} from "../../src/core/registry.js";
import type {
  IntrospectionResult,
  FieldDefinition,
} from "../../src/core/types.js";

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
            enumValues: [
              { name: "PENDING" },
              { name: "SHIPPED" },
              { name: "DELIVERED" },
            ],
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
      fields: [
        { name: "customField", type: { name: "BigDecimal", kind: "SCALAR" } },
      ],
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
      fields: [
        { name: "unknownField", type: { name: "UnknownType", kind: "SCALAR" } },
      ],
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
