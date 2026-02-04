import { describe, it, expect } from "vitest";
import { buildQuery, buildSelectionSet } from "../../src/core/query-builder.js";
import type { FieldDefinition } from "../../src/core/types.js";

describe("buildSelectionSet", () => {
  it("returns root fields as-is", () => {
    expect(buildSelectionSet(["id", "status", "total"])).toEqual(["id", "status", "total"]);
  });

  it("groups nested paths", () => {
    const result = buildSelectionSet([
      "id",
      "status",
      "shippingAddress.city",
      "shippingAddress.country",
    ]);

    expect(result).toContain("id");
    expect(result).toContain("status");
    expect(result).toContain("shippingAddress { city country }");
  });

  it("handles multiple nested groups", () => {
    const result = buildSelectionSet([
      "shippingAddress.city",
      "billingAddress.street",
      "billingAddress.zip",
    ]);

    expect(result).toContain("shippingAddress { city }");
    expect(result).toContain("billingAddress { street zip }");
  });
});

describe("buildQuery", () => {
  const fields: FieldDefinition[] = [
    { key: "orderNumber", label: "Order Number", graphqlPath: "orderNumber", type: "string" },
    { key: "status", label: "Status", graphqlPath: "status", type: "string" },
    { key: "total", label: "Total", graphqlPath: "total", type: "number" },
  ];

  it("builds a basic query with id always included", () => {
    const query = buildQuery("orders", fields);
    expect(query).toContain("query Orders");
    expect(query).toContain("orders");
    expect(query).toContain("id");
    expect(query).toContain("orderNumber");
    expect(query).toContain("status");
    expect(query).toContain("total");
  });

  it("includes filter type when specified", () => {
    const query = buildQuery("orders", fields, { filter: "OrderFilter" });
    expect(query).toContain("$filter: OrderFilter");
    expect(query).toContain("filter: $filter");
  });

  it("groups nested fields correctly", () => {
    const nestedFields: FieldDefinition[] = [
      ...fields,
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

    const query = buildQuery("orders", nestedFields);
    expect(query).toContain("shippingAddress { city country }");
    expect(query).not.toContain("shippingAddress.city");
  });

  it("produces valid query shape", () => {
    const query = buildQuery("orders", fields);
    expect(query).toMatchInlineSnapshot(`
      "query Orders {
        orders {
          id
          orderNumber
          status
          total
        }
      }"
    `);
  });

  it("handles empty fields (still includes id)", () => {
    const query = buildQuery("orders", []);
    expect(query).toContain("id");
  });

  it("includes additional variable declarations", () => {
    const query = buildQuery("orders", fields, { variables: "$limit: Int" });
    expect(query).toContain("$limit: Int");
    expect(query).toContain("query Orders($limit: Int)");
  });

  it("combines filter and additional variables", () => {
    const query = buildQuery("orders", fields, {
      filter: "OrderFilter",
      variables: "$limit: Int",
    });
    expect(query).toContain("$filter: OrderFilter, $limit: Int");
    expect(query).toContain("filter: $filter");
  });
});
