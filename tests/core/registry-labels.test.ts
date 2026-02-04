import { describe, it, expect } from "vitest";
import { buildRegistry, withLabels } from "../../src/core/registry.js";
import type { IntrospectionResult, FieldDefinition } from "../../src/core/types.js";

const mockIntrospection: IntrospectionResult = {
  name: "Order",
  fields: [
    { name: "orderNumber", type: { name: "String", kind: "SCALAR" } },
    { name: "customerName", type: { name: "String", kind: "SCALAR" } },
    { name: "createdAt", type: { name: "DateTime", kind: "SCALAR" } },
  ],
};

describe("buildRegistry with labels option", () => {
  it("overrides auto-generated labels", () => {
    const fields = buildRegistry(mockIntrospection, {
      labels: {
        orderNumber: "Order #",
        createdAt: "Created",
      },
    });

    expect(fields.find((f) => f.key === "orderNumber")?.label).toBe("Order #");
    expect(fields.find((f) => f.key === "createdAt")?.label).toBe("Created");
    // customerName keeps its auto-generated label
    expect(fields.find((f) => f.key === "customerName")?.label).toBe("Customer Name");
  });

  it("ignores labels for non-existent keys", () => {
    const fields = buildRegistry(mockIntrospection, {
      labels: { nonExistent: "Should Not Appear" },
    });

    expect(fields.find((f) => f.label === "Should Not Appear")).toBeUndefined();
  });
});

describe("withLabels", () => {
  const fields: FieldDefinition[] = [
    { key: "orderNumber", label: "Order Number", graphqlPath: "orderNumber", type: "string" },
    { key: "status", label: "Status", graphqlPath: "status", type: "enum", enumValues: ["PENDING"] },
    { key: "createdAt", label: "Created At", graphqlPath: "createdAt", type: "date" },
  ];

  it("returns new array with overridden labels", () => {
    const result = withLabels(fields, {
      orderNumber: "Order #",
      createdAt: "Created",
    });

    expect(result).not.toBe(fields); // new array
    expect(result[0].label).toBe("Order #");
    expect(result[1].label).toBe("Status"); // unchanged
    expect(result[2].label).toBe("Created");
  });

  it("does not mutate original array", () => {
    withLabels(fields, { orderNumber: "Changed" });
    expect(fields[0].label).toBe("Order Number");
  });

  it("preserves all other field properties", () => {
    const result = withLabels(fields, { status: "Order Status" });
    expect(result[1]).toEqual({
      key: "status",
      label: "Order Status",
      graphqlPath: "status",
      type: "enum",
      enumValues: ["PENDING"],
    });
  });
});
