import { describe, it, expect } from "vitest";
import { flatten, unflatten } from "../../src/core/flatten.js";
import type { FieldDefinition } from "../../src/core/types.js";

const fields: FieldDefinition[] = [
  { key: "orderNumber", label: "Order Number", graphqlPath: "orderNumber", type: "string" },
  { key: "status", label: "Status", graphqlPath: "status", type: "string" },
  { key: "total", label: "Total", graphqlPath: "total", type: "number" },
  { key: "shippingAddressCity", label: "City", graphqlPath: "shippingAddress.city", type: "string" },
  { key: "shippingAddressCountry", label: "Country", graphqlPath: "shippingAddress.country", type: "string" },
];

describe("flatten", () => {
  it("flattens a nested response to flat keys", () => {
    const data = {
      id: "1",
      orderNumber: "ORD-001",
      status: "shipped",
      total: 99.99,
      shippingAddress: {
        city: "Berlin",
        country: "DE",
      },
    };

    const result = flatten(data, fields);

    expect(result).toEqual({
      id: "1",
      orderNumber: "ORD-001",
      status: "shipped",
      total: 99.99,
      shippingAddressCity: "Berlin",
      shippingAddressCountry: "DE",
    });
  });

  it("preserves id", () => {
    const result = flatten({ id: "42" }, []);
    expect(result.id).toBe("42");
  });

  it("handles null nested objects gracefully", () => {
    const data = {
      id: "1",
      orderNumber: "ORD-001",
      status: "pending",
      total: 50,
      shippingAddress: null,
    };

    const result = flatten(data, fields);
    expect(result.shippingAddressCity).toBeUndefined();
    expect(result.shippingAddressCountry).toBeUndefined();
  });

  it("handles missing fields gracefully", () => {
    const data = { id: "1" };
    const result = flatten(data, fields);
    expect(result.id).toBe("1");
    expect(result.orderNumber).toBeUndefined();
  });
});

describe("unflatten", () => {
  it("unflattens flat keys to nested structure", () => {
    const flatData = {
      status: "shipped",
      shippingAddressCity: "Berlin",
      shippingAddressCountry: "DE",
    };

    const result = unflatten(flatData, fields);

    expect(result).toEqual({
      status: "shipped",
      shippingAddress: {
        city: "Berlin",
        country: "DE",
      },
    });
  });

  it("only includes keys present in flatData", () => {
    const flatData = { status: "shipped" };
    const result = unflatten(flatData, fields);
    expect(result).toEqual({ status: "shipped" });
    expect(result).not.toHaveProperty("orderNumber");
    expect(result).not.toHaveProperty("shippingAddress");
  });

  it("handles single top-level field", () => {
    const flatData = { total: 42 };
    const result = unflatten(flatData, fields);
    expect(result).toEqual({ total: 42 });
  });

  it("handles empty flatData", () => {
    const result = unflatten({}, fields);
    expect(result).toEqual({});
  });
});

describe("flatten + unflatten round-trip", () => {
  it("round-trips correctly for top-level fields", () => {
    const original = { status: "shipped", total: 99.99 };
    const topFields = fields.filter(
      (f) => !f.graphqlPath.includes("."),
    );

    const nested = unflatten(original, topFields);
    const flat = flatten({ id: "1", ...nested }, topFields);
    expect(flat.status).toBe("shipped");
    expect(flat.total).toBe(99.99);
  });

  it("round-trips correctly for nested fields", () => {
    const original = {
      shippingAddressCity: "Berlin",
      shippingAddressCountry: "DE",
    };
    const nestedFields = fields.filter((f) =>
      f.graphqlPath.includes("."),
    );

    const nested = unflatten(original, nestedFields);
    expect(nested).toEqual({
      shippingAddress: { city: "Berlin", country: "DE" },
    });

    const flat = flatten({ id: "1", ...nested }, nestedFields);
    expect(flat.shippingAddressCity).toBe("Berlin");
    expect(flat.shippingAddressCountry).toBe("DE");
  });
});
