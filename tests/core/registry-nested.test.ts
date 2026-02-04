import { describe, it, expect } from "vitest";
import { buildRegistry } from "../../src/core/registry.js";
import type { IntrospectionResult } from "../../src/core/types.js";

describe("buildRegistry with nestedTypes", () => {
  const orderType: IntrospectionResult = {
    name: "Order",
    fields: [
      { name: "id", type: { name: "ID", kind: "SCALAR" } },
      { name: "orderNumber", type: { name: "String", kind: "SCALAR" } },
      { name: "status", type: { name: "String", kind: "SCALAR" } },
      {
        name: "shippingAddress",
        type: { name: "Address", kind: "OBJECT" },
      },
      {
        name: "billingAddress",
        type: { name: "Address", kind: "OBJECT" },
      },
    ],
  };

  const addressType: IntrospectionResult = {
    name: "Address",
    fields: [
      { name: "id", type: { name: "ID", kind: "SCALAR" } },
      { name: "city", type: { name: "String", kind: "SCALAR" } },
      { name: "country", type: { name: "String", kind: "SCALAR" } },
      { name: "zip", type: { name: "String", kind: "SCALAR" } },
    ],
  };

  it("resolves nested OBJECT fields when nestedTypes is provided", () => {
    const fields = buildRegistry(orderType, {
      nestedTypes: { Address: addressType },
    });

    expect(fields).toContainEqual({
      key: "shippingAddressCity",
      label: "City",
      graphqlPath: "shippingAddress.city",
      type: "string",
    });

    expect(fields).toContainEqual({
      key: "shippingAddressCountry",
      label: "Country",
      graphqlPath: "shippingAddress.country",
      type: "string",
    });

    expect(fields).toContainEqual({
      key: "billingAddressCity",
      label: "City",
      graphqlPath: "billingAddress.city",
      type: "string",
    });
  });

  it("skips nested id fields", () => {
    const fields = buildRegistry(orderType, {
      nestedTypes: { Address: addressType },
    });

    expect(fields.find((f) => f.key === "shippingAddressId")).toBeUndefined();
    expect(fields.find((f) => f.key === "billingAddressId")).toBeUndefined();
  });

  it("includes both top-level and nested fields", () => {
    const fields = buildRegistry(orderType, {
      nestedTypes: { Address: addressType },
    });

    const keys = fields.map((f) => f.key);
    expect(keys).toContain("orderNumber");
    expect(keys).toContain("status");
    expect(keys).toContain("shippingAddressCity");
    expect(keys).toContain("billingAddressZip");
  });

  it("silently skips nested objects not in nestedTypes", () => {
    // No nestedTypes provided - OBJECT fields are just skipped
    const fields = buildRegistry(orderType);

    const keys = fields.map((f) => f.key);
    expect(keys).toContain("orderNumber");
    expect(keys).toContain("status");
    expect(keys).not.toContain("shippingAddressCity");
  });

  it("respects maxDepth", () => {
    const deepType: IntrospectionResult = {
      name: "Company",
      fields: [
        { name: "name", type: { name: "String", kind: "SCALAR" } },
        { name: "headquarters", type: { name: "Address", kind: "OBJECT" } },
      ],
    };

    // maxDepth 0: no nesting at all
    const fields0 = buildRegistry(deepType, {
      maxDepth: 0,
      nestedTypes: { Address: addressType },
    });
    expect(fields0.map((f) => f.key)).toEqual(["name"]);

    // maxDepth 1: one level of nesting
    const fields1 = buildRegistry(deepType, {
      maxDepth: 1,
      nestedTypes: { Address: addressType },
    });
    expect(fields1.map((f) => f.key)).toContain("headquartersCity");
  });

  it("handles NON_NULL wrapped OBJECT types", () => {
    const typeWithWrapped: IntrospectionResult = {
      name: "Order",
      fields: [
        {
          name: "shippingAddress",
          type: {
            name: null,
            kind: "NON_NULL",
            ofType: { name: "Address", kind: "OBJECT" },
          },
        },
      ],
    };

    const fields = buildRegistry(typeWithWrapped, {
      nestedTypes: { Address: addressType },
    });

    expect(fields).toContainEqual({
      key: "shippingAddressCity",
      label: "City",
      graphqlPath: "shippingAddress.city",
      type: "string",
    });
  });
});
