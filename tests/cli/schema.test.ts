import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  loadSchemaFromFile,
  introspectTypeFromSchema,
  discoverMutationsFromSchema,
} from "../../src/cli/schema.js";

const TMP_DIR = resolve(__dirname, "__tmp_schema_test__");
const SCHEMA_PATH = resolve(TMP_DIR, "test.graphql");

const SDL = `
  type Query {
    orders: [Order!]!
    customers: [Customer!]!
  }

  type Mutation {
    updateOrder(id: ID!, input: UpdateOrderInput!): Order
    createOrder(input: CreateOrderInput!): Order
    deleteOrder(id: ID!): Boolean
  }

  type Order {
    id: ID!
    orderNumber: String!
    total: Float!
    status: OrderStatus!
    customer: Customer
    createdAt: String
  }

  type Customer {
    id: ID!
    name: String!
    email: String!
  }

  enum OrderStatus {
    PENDING
    SHIPPED
    DELIVERED
    CANCELLED
  }

  input UpdateOrderInput {
    orderNumber: String
    total: Float
    status: OrderStatus
  }

  input CreateOrderInput {
    orderNumber: String!
    total: Float!
    status: OrderStatus!
  }
`;

describe("schema parsing", () => {
  beforeAll(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(SCHEMA_PATH, SDL);
  });

  afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  describe("loadSchemaFromFile", () => {
    it("loads and parses a valid SDL file", () => {
      const schema = loadSchemaFromFile(SCHEMA_PATH);
      expect(schema).toBeDefined();
    });

    it("throws on non-existent file", () => {
      expect(() => loadSchemaFromFile("/nonexistent.graphql")).toThrow();
    });

    it("throws on invalid SDL content", () => {
      const badPath = resolve(TMP_DIR, "bad.graphql");
      writeFileSync(badPath, "not valid graphql {{{");
      expect(() => loadSchemaFromFile(badPath)).toThrow(/Failed to parse schema file/);
    });
  });

  describe("introspectTypeFromSchema", () => {
    it("introspects a type and returns its fields", () => {
      const schema = loadSchemaFromFile(SCHEMA_PATH);
      const result = introspectTypeFromSchema("Order", schema);

      expect(result).toBeDefined();
      expect(result.fields).toBeInstanceOf(Array);

      const fieldNames = result.fields.map((f) => f.name);
      expect(fieldNames).toContain("id");
      expect(fieldNames).toContain("orderNumber");
      expect(fieldNames).toContain("total");
      expect(fieldNames).toContain("status");
      expect(fieldNames).toContain("customer");
      expect(fieldNames).toContain("createdAt");
    });

    it("returns enum type info for enum fields", () => {
      const schema = loadSchemaFromFile(SCHEMA_PATH);
      const result = introspectTypeFromSchema("Order", schema);

      const statusField = result.fields.find((f) => f.name === "status");
      expect(statusField).toBeDefined();

      // The status field should have ENUM kind somewhere in its type chain
      const type = statusField!.type;
      // NON_NULL wraps the ENUM
      const unwrapped = type.ofType ?? type;
      expect(unwrapped.kind).toBe("ENUM");
      expect(unwrapped.enumValues).toBeDefined();
      expect(unwrapped.enumValues!.map((e) => e.name)).toEqual([
        "PENDING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
      ]);
    });

    it("throws for non-existent type", () => {
      const schema = loadSchemaFromFile(SCHEMA_PATH);
      expect(() => introspectTypeFromSchema("NonExistent", schema)).toThrow(/not found in schema/);
    });

    it("introspects nested OBJECT types", () => {
      const schema = loadSchemaFromFile(SCHEMA_PATH);
      const result = introspectTypeFromSchema("Order", schema);

      const customerField = result.fields.find((f) => f.name === "customer");
      expect(customerField).toBeDefined();

      const type = customerField!.type;
      expect(type.kind).toBe("OBJECT");
      expect(type.name).toBe("Customer");
    });
  });

  describe("discoverMutationsFromSchema", () => {
    it("discovers all mutations for Order", () => {
      const schema = loadSchemaFromFile(SCHEMA_PATH);
      const mutations = discoverMutationsFromSchema("Order", schema);

      expect(mutations.get("update")).toBe("updateOrder");
      expect(mutations.get("create")).toBe("createOrder");
      expect(mutations.get("delete")).toBe("deleteOrder");
    });

    it("returns empty map for types without mutations", () => {
      const schema = loadSchemaFromFile(SCHEMA_PATH);
      const mutations = discoverMutationsFromSchema("Customer", schema);

      expect(mutations.size).toBe(0);
    });

    it("handles schemas without Mutation type", () => {
      const noMutationPath = resolve(TMP_DIR, "no-mutation.graphql");
      writeFileSync(noMutationPath, "type Query { hello: String }\ntype Foo { id: ID! }");

      const schema = loadSchemaFromFile(noMutationPath);
      const mutations = discoverMutationsFromSchema("Foo", schema);
      expect(mutations.size).toBe(0);
    });
  });
});
