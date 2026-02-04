import { describe, it, expect } from "vitest";
import {
  buildUpdateMutation,
  buildCreateMutation,
  getMutationName,
  getInputTypeName,
} from "../../src/core/mutation-builder.js";
import type { FieldDefinition } from "../../src/core/types.js";

describe("getMutationName", () => {
  it("builds update mutation name", () => {
    expect(getMutationName("Order", "update")).toBe("updateOrder");
  });

  it("builds create mutation name", () => {
    expect(getMutationName("Order", "create")).toBe("createOrder");
  });

  it("builds delete mutation name", () => {
    expect(getMutationName("Order", "delete")).toBe("deleteOrder");
  });
});

describe("getInputTypeName", () => {
  it("builds update input type name", () => {
    expect(getInputTypeName("Order", "update")).toBe("UpdateOrderInput");
  });

  it("builds create input type name", () => {
    expect(getInputTypeName("Order", "create")).toBe("CreateOrderInput");
  });

  it("builds delete input type name", () => {
    expect(getInputTypeName("Order", "delete")).toBe("DeleteOrderInput");
  });
});

describe("buildUpdateMutation", () => {
  const fields: FieldDefinition[] = [
    { key: "status", label: "Status", graphqlPath: "status", type: "string" },
    { key: "total", label: "Total", graphqlPath: "total", type: "number" },
  ];

  it("builds an update mutation with default input type name", () => {
    const mutation = buildUpdateMutation("Order", fields);
    expect(mutation).toContain("mutation UpdateOrder");
    expect(mutation).toContain("$id: ID!");
    expect(mutation).toContain("$input: UpdateOrderInput!");
    expect(mutation).toContain("updateOrder(id: $id, input: $input)");
    expect(mutation).toContain("id");
    expect(mutation).toContain("status");
    expect(mutation).toContain("total");
  });

  it("uses custom input type name", () => {
    const mutation = buildUpdateMutation("Order", fields, "CustomInput");
    expect(mutation).toContain("$input: CustomInput!");
  });

  it("handles nested return fields", () => {
    const nestedFields: FieldDefinition[] = [
      ...fields,
      { key: "shippingAddressCity", label: "City", graphqlPath: "shippingAddress.city", type: "string" },
    ];

    const mutation = buildUpdateMutation("Order", nestedFields);
    expect(mutation).toContain("shippingAddress { city }");
  });

  it("produces valid mutation shape", () => {
    const mutation = buildUpdateMutation("Order", fields);
    expect(mutation).toMatchInlineSnapshot(`
      "mutation UpdateOrder($id: ID!, $input: UpdateOrderInput!) {
        updateOrder(id: $id, input: $input) {
          id
          status
          total
        }
      }"
    `);
  });
});

describe("buildCreateMutation", () => {
  const fields: FieldDefinition[] = [
    { key: "orderNumber", label: "Order Number", graphqlPath: "orderNumber", type: "string" },
    { key: "status", label: "Status", graphqlPath: "status", type: "string" },
  ];

  it("builds a create mutation without $id parameter", () => {
    const mutation = buildCreateMutation("Order", fields);
    expect(mutation).toContain("mutation CreateOrder");
    expect(mutation).toContain("$input: CreateOrderInput!");
    expect(mutation).toContain("createOrder(input: $input)");
    expect(mutation).not.toContain("$id");
  });

  it("produces valid mutation shape", () => {
    const mutation = buildCreateMutation("Order", fields);
    expect(mutation).toMatchInlineSnapshot(`
      "mutation CreateOrder($input: CreateOrderInput!) {
        createOrder(input: $input) {
          id
          orderNumber
          status
        }
      }"
    `);
  });
});
