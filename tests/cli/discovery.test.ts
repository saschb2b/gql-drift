import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import {
  matchPattern,
  matchesAny,
  filterTypeNames,
  discoverTypesFromEndpoint,
} from "../../src/cli/discovery.js";
import { discoverTypesFromSchema, loadSchemaFromFile } from "../../src/cli/schema.js";
import type { DriftConfig } from "../../src/core/types.js";

// ---------------------------------------------------------------------------
// matchPattern
// ---------------------------------------------------------------------------

describe("matchPattern", () => {
  it("matches exact name", () => {
    expect(matchPattern("Order", "Order")).toBe(true);
  });

  it("does not match different name", () => {
    expect(matchPattern("Order", "Customer")).toBe(false);
  });

  it("matches prefix wildcard", () => {
    expect(matchPattern("__Schema", "__*")).toBe(true);
    expect(matchPattern("__Type", "__*")).toBe(true);
    expect(matchPattern("Order", "__*")).toBe(false);
  });

  it("matches suffix wildcard", () => {
    expect(matchPattern("OrderConnection", "*Connection")).toBe(true);
    expect(matchPattern("Connection", "*Connection")).toBe(true);
    expect(matchPattern("Order", "*Connection")).toBe(false);
  });

  it("matches wildcard-only pattern", () => {
    expect(matchPattern("Anything", "*")).toBe(true);
  });

  it("matches middle wildcard", () => {
    expect(matchPattern("OrderPayload", "Order*Payload")).toBe(true);
    expect(matchPattern("OrderEdgePayload", "Order*Payload")).toBe(true);
    expect(matchPattern("CustomerPayload", "Order*Payload")).toBe(false);
  });

  it("handles special regex characters in pattern", () => {
    expect(matchPattern("My.Type", "My.Type")).toBe(true);
    expect(matchPattern("MyXType", "My.Type")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchesAny
// ---------------------------------------------------------------------------

describe("matchesAny", () => {
  it("returns true if any pattern matches", () => {
    expect(matchesAny("__Schema", ["__*", "*Connection"])).toBe(true);
    expect(matchesAny("OrderConnection", ["__*", "*Connection"])).toBe(true);
  });

  it("returns false if no pattern matches", () => {
    expect(matchesAny("Order", ["__*", "*Connection"])).toBe(false);
  });

  it("returns false for empty patterns", () => {
    expect(matchesAny("Order", [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterTypeNames
// ---------------------------------------------------------------------------

describe("filterTypeNames", () => {
  const allTypes = [
    "Customer",
    "CustomerConnection",
    "CustomerEdge",
    "Order",
    "OrderConnection",
    "OrderEdge",
    "PageInfo",
  ];

  it("returns all types when no exclude patterns", () => {
    expect(filterTypeNames(allTypes, [])).toEqual(allTypes);
  });

  it("excludes types matching patterns", () => {
    const result = filterTypeNames(allTypes, ["*Connection", "*Edge"]);
    expect(result).toEqual(["Customer", "Order", "PageInfo"]);
  });

  it("excludes exact name match", () => {
    const result = filterTypeNames(allTypes, ["PageInfo"]);
    expect(result).not.toContain("PageInfo");
    expect(result).toContain("Order");
  });
});

// ---------------------------------------------------------------------------
// discoverTypesFromEndpoint
// ---------------------------------------------------------------------------

describe("discoverTypesFromEndpoint", () => {
  const config: DriftConfig = { endpoint: "http://localhost:4000/graphql" };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("discovers OBJECT types, excluding builtins and root types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              __schema: {
                types: [
                  { name: "Query", kind: "OBJECT" },
                  { name: "Mutation", kind: "OBJECT" },
                  { name: "Order", kind: "OBJECT" },
                  { name: "Customer", kind: "OBJECT" },
                  { name: "__Schema", kind: "OBJECT" },
                  { name: "__Type", kind: "OBJECT" },
                  { name: "String", kind: "SCALAR" },
                  { name: "OrderStatus", kind: "ENUM" },
                  { name: "UpdateOrderInput", kind: "INPUT_OBJECT" },
                ],
                queryType: { name: "Query" },
                mutationType: { name: "Mutation" },
                subscriptionType: null,
              },
            },
          }),
      }),
    );

    const types = await discoverTypesFromEndpoint(config);
    expect(types).toEqual(["Customer", "Order"]);
  });

  it("handles custom root type names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              __schema: {
                types: [
                  { name: "RootQuery", kind: "OBJECT" },
                  { name: "Order", kind: "OBJECT" },
                ],
                queryType: { name: "RootQuery" },
                mutationType: null,
                subscriptionType: null,
              },
            },
          }),
      }),
    );

    const types = await discoverTypesFromEndpoint(config);
    expect(types).toEqual(["Order"]);
    expect(types).not.toContain("RootQuery");
  });

  it("throws when introspection is not available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      }),
    );

    await expect(discoverTypesFromEndpoint(config)).rejects.toThrow("__schema");
  });

  it("returns results sorted alphabetically", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              __schema: {
                types: [
                  { name: "Zebra", kind: "OBJECT" },
                  { name: "Apple", kind: "OBJECT" },
                  { name: "Mango", kind: "OBJECT" },
                ],
                queryType: null,
                mutationType: null,
                subscriptionType: null,
              },
            },
          }),
      }),
    );

    const types = await discoverTypesFromEndpoint(config);
    expect(types).toEqual(["Apple", "Mango", "Zebra"]);
  });
});

// ---------------------------------------------------------------------------
// discoverTypesFromSchema
// ---------------------------------------------------------------------------

const TMP_DIR = resolve(__dirname, "__tmp_discovery_test__");
const SCHEMA_PATH = resolve(TMP_DIR, "test.graphql");

const SDL = `
  type Query {
    orders: [Order!]!
    customers: [Customer!]!
  }

  type Mutation {
    updateOrder(id: ID!, input: UpdateOrderInput!): Order
  }

  type Subscription {
    orderCreated: Order
  }

  type Order {
    id: ID!
    orderNumber: String!
    total: Float!
    status: OrderStatus!
    customer: Customer
  }

  type Customer {
    id: ID!
    name: String!
    email: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type OrderConnection {
    edges: [OrderEdge!]!
    pageInfo: PageInfo!
  }

  type OrderEdge {
    node: Order!
    cursor: String!
  }

  enum OrderStatus { PENDING SHIPPED DELIVERED }

  input UpdateOrderInput { orderNumber: String total: Float }
`;

describe("discoverTypesFromSchema", () => {
  beforeAll(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(SCHEMA_PATH, SDL);
  });

  afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("discovers all OBJECT types excluding root types", () => {
    const schema = loadSchemaFromFile(SCHEMA_PATH);
    const types = discoverTypesFromSchema(schema);

    expect(types).toContain("Order");
    expect(types).toContain("Customer");
    expect(types).toContain("PageInfo");
    expect(types).toContain("OrderConnection");
    expect(types).toContain("OrderEdge");

    // Root types excluded
    expect(types).not.toContain("Query");
    expect(types).not.toContain("Mutation");
    expect(types).not.toContain("Subscription");

    // Non-OBJECT types excluded
    expect(types).not.toContain("OrderStatus"); // ENUM
    expect(types).not.toContain("UpdateOrderInput"); // INPUT_OBJECT
    expect(types).not.toContain("String"); // SCALAR
  });

  it("returns results sorted alphabetically", () => {
    const schema = loadSchemaFromFile(SCHEMA_PATH);
    const types = discoverTypesFromSchema(schema);
    const sorted = [...types].sort((a, b) => a.localeCompare(b));
    expect(types).toEqual(sorted);
  });

  it("works with filterTypeNames to apply exclude patterns", () => {
    const schema = loadSchemaFromFile(SCHEMA_PATH);
    const allTypes = discoverTypesFromSchema(schema);
    const filtered = filterTypeNames(allTypes, ["*Connection", "*Edge", "PageInfo"]);

    expect(filtered).toEqual(["Customer", "Order"]);
  });
});
