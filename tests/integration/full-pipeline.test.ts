import { describe, it, expect } from "vitest";
import { buildRegistry } from "../../src/core/registry.js";
import { buildQuery } from "../../src/core/query-builder.js";
import { buildUpdateMutation, buildCreateMutation } from "../../src/core/mutation-builder.js";
import { flatten, unflatten } from "../../src/core/flatten.js";
import type { IntrospectionResult, FieldDefinition } from "../../src/core/types.js";

/**
 * Full pipeline integration test:
 * introspection mock -> registry -> query/mutation build -> flatten/unflatten
 */
describe("full pipeline", () => {
  // Mock introspection result for an "Order" type
  const mockIntrospection: IntrospectionResult = {
    name: "Order",
    fields: [
      { name: "id", type: { name: "ID", kind: "SCALAR" } },
      {
        name: "orderNumber",
        type: {
          name: null,
          kind: "NON_NULL",
          ofType: { name: "String", kind: "SCALAR" },
        },
      },
      { name: "customerName", type: { name: "String", kind: "SCALAR" } },
      { name: "status", type: { name: "String", kind: "SCALAR" } },
      { name: "total", type: { name: "Float", kind: "SCALAR" } },
      { name: "currency", type: { name: "String", kind: "SCALAR" } },
      { name: "createdAt", type: { name: "DateTime", kind: "SCALAR" } },
    ],
  };

  it("builds a registry from introspection", () => {
    const fields = buildRegistry(mockIntrospection);

    expect(fields.length).toBeGreaterThan(0);
    expect(fields.find((f) => f.key === "id")).toBeUndefined();
    expect(fields.find((f) => f.key === "orderNumber")).toBeDefined();
    expect(fields.find((f) => f.key === "total")?.type).toBe("number");
    expect(fields.find((f) => f.key === "createdAt")?.type).toBe("date");
  });

  it("builds a query from registry fields", () => {
    const fields = buildRegistry(mockIntrospection);
    const selected = fields.filter((f) => ["orderNumber", "status", "total"].includes(f.key));

    const query = buildQuery("orders", selected, { filter: "OrderFilter" });

    expect(query).toContain("query Orders($filter: OrderFilter)");
    expect(query).toContain("id");
    expect(query).toContain("orderNumber");
    expect(query).toContain("status");
    expect(query).toContain("total");
    expect(query).not.toContain("customerName");
    expect(query).not.toContain("createdAt");
  });

  it("flattens API response and round-trips through unflatten", () => {
    const fields: FieldDefinition[] = [
      { key: "orderNumber", label: "Order Number", graphqlPath: "orderNumber", type: "string" },
      { key: "status", label: "Status", graphqlPath: "status", type: "string" },
      {
        key: "shippingAddressCity",
        label: "City",
        graphqlPath: "shippingAddress.city",
        type: "string",
      },
      {
        key: "shippingAddressCountry",
        label: "Country",
        graphqlPath: "shippingAddress.country",
        type: "string",
      },
    ];

    // Simulate API response
    const apiResponse = {
      id: "order-1",
      orderNumber: "ORD-001",
      status: "shipped",
      shippingAddress: {
        city: "Berlin",
        country: "DE",
      },
    };

    // Flatten for UI
    const flat = flatten(apiResponse, fields);
    expect(flat.id).toBe("order-1");
    expect(flat.shippingAddressCity).toBe("Berlin");

    // User edits a value
    const edited = { ...flat, shippingAddressCity: "Munich" };
    delete edited.id;

    // Unflatten for mutation
    const input = unflatten(edited, fields);
    expect(input).toEqual({
      orderNumber: "ORD-001",
      status: "shipped",
      shippingAddress: {
        city: "Munich",
        country: "DE",
      },
    });
  });

  it("builds update mutation from registry", () => {
    const fields = buildRegistry(mockIntrospection);
    const selected = fields.filter((f) => ["status", "total"].includes(f.key));

    const mutation = buildUpdateMutation("Order", selected);

    expect(mutation).toContain("mutation UpdateOrder($id: ID!, $input: UpdateOrderInput!)");
    expect(mutation).toContain("updateOrder(id: $id, input: $input)");
    expect(mutation).toContain("id");
    expect(mutation).toContain("status");
    expect(mutation).toContain("total");
  });

  it("builds create mutation from registry", () => {
    const fields = buildRegistry(mockIntrospection);
    const selected = fields.filter((f) => ["orderNumber", "status"].includes(f.key));

    const mutation = buildCreateMutation("Order", selected);

    expect(mutation).toContain("mutation CreateOrder($input: CreateOrderInput!)");
    expect(mutation).toContain("createOrder(input: $input)");
    expect(mutation).not.toContain("$id");
  });

  it("end-to-end: introspect -> select -> query -> flatten -> edit -> unflatten -> mutation", () => {
    // 1. Build registry from introspection
    const registry = buildRegistry(mockIntrospection);
    expect(registry.length).toBeGreaterThan(0);

    // 2. User selects fields
    const selected = registry.filter((f) => ["orderNumber", "status", "total"].includes(f.key));
    expect(selected).toHaveLength(3);

    // 3. Build query
    const query = buildQuery("orders", selected);
    expect(query).toContain("orders");

    // 4. Simulate API response & flatten
    const apiRow = { id: "1", orderNumber: "ORD-001", status: "pending", total: 100 };
    const flat = flatten(apiRow, selected);
    expect(flat.orderNumber).toBe("ORD-001");

    // 5. User edits
    const editedFlat = { status: "shipped", total: 150 };

    // 6. Unflatten for mutation input
    const input = unflatten(editedFlat, selected);
    expect(input).toEqual({ status: "shipped", total: 150 });

    // 7. Build mutation
    const mutation = buildUpdateMutation("Order", selected);
    expect(mutation).toContain("updateOrder");
  });
});
