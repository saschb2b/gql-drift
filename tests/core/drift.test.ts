import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDrift } from "../../src/core/drift.js";
import type { DriftConfig } from "../../src/core/types.js";

const config: DriftConfig = {
  endpoint: "http://localhost:4000/graphql",
};

// Mock introspection responses
const orderTypeResponse = {
  data: {
    __type: {
      name: "Order",
      fields: [
        { name: "id", type: { name: "ID", kind: "SCALAR" } },
        { name: "orderNumber", type: { name: "String", kind: "SCALAR" } },
        { name: "status", type: { name: "String", kind: "SCALAR" } },
        { name: "total", type: { name: "Float", kind: "SCALAR" } },
      ],
    },
  },
};

const mutationTypeResponse = {
  data: {
    __type: {
      name: "Mutation",
      fields: [
        { name: "updateOrder", type: { name: "Order", kind: "OBJECT" } },
        { name: "createOrder", type: { name: "Order", kind: "OBJECT" } },
      ],
    },
  },
};

const updateOrderInputResponse = {
  data: {
    __type: {
      name: "UpdateOrderInput",
      fields: [
        { name: "status", type: { name: "String", kind: "SCALAR" } },
        { name: "total", type: { name: "Float", kind: "SCALAR" } },
      ],
    },
  },
};

function mockFetchForIntrospection() {
  return vi.fn().mockImplementation((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const typeName = body.variables?.typeName;

    let responseData;
    if (typeName === "Order") {
      responseData = orderTypeResponse;
    } else if (typeName === "Mutation") {
      responseData = mutationTypeResponse;
    } else if (typeName === "UpdateOrderInput") {
      responseData = updateOrderInputResponse;
    } else {
      responseData = { data: { __type: null } };
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(responseData),
    });
  });
}

describe("createDrift", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a client with bound config", () => {
    const drift = createDrift(config);
    expect(drift.config).toBe(config);
  });

  it("exposes lower-level helpers", () => {
    const drift = createDrift(config);
    expect(typeof drift.buildQuery).toBe("function");
    expect(typeof drift.buildUpdateMutation).toBe("function");
    expect(typeof drift.buildCreateMutation).toBe("function");
    expect(typeof drift.flatten).toBe("function");
    expect(typeof drift.unflatten).toBe("function");
  });

  describe("type()", () => {
    it("introspects and returns a DriftType", async () => {
      vi.stubGlobal("fetch", mockFetchForIntrospection());

      const drift = createDrift(config);
      const order = await drift.type("Order");

      expect(order.typeName).toBe("Order");
      expect(order.fields.length).toBeGreaterThan(0);
      expect(order.fields.find((f) => f.key === "id")).toBeUndefined();
      expect(order.fields.find((f) => f.key === "orderNumber")).toBeDefined();
      expect(order.fields.find((f) => f.key === "status")).toBeDefined();
      expect(order.fields.find((f) => f.key === "total")?.type).toBe("number");
    });

    it("discovers mutations", async () => {
      vi.stubGlobal("fetch", mockFetchForIntrospection());

      const drift = createDrift(config);
      const order = await drift.type("Order");

      expect(order.mutations.get("update")).toBe("updateOrder");
      expect(order.mutations.get("create")).toBe("createOrder");
    });

    it("resolves editable fields", async () => {
      vi.stubGlobal("fetch", mockFetchForIntrospection());

      const drift = createDrift(config);
      const order = await drift.type("Order");

      expect(order.editableFields.length).toBe(2);
      expect(order.editableFields.map((f) => f.key)).toEqual(["status", "total"]);
    });

    it("caches type resolution", async () => {
      const mockFetch = mockFetchForIntrospection();
      vi.stubGlobal("fetch", mockFetch);

      const drift = createDrift(config);
      const order1 = await drift.type("Order");
      const order2 = await drift.type("Order");

      expect(order1).toBe(order2);
      // Should not make additional introspection calls for the second request
    });
  });

  describe("query()", () => {
    it("delegates to buildQuery", () => {
      const drift = createDrift(config);
      const fields = [
        { key: "status", label: "Status", graphqlPath: "status", type: "string" as const },
      ];
      const result = drift.query("orders", fields);
      expect(result).toContain("orders");
      expect(result).toContain("status");
      expect(result).toContain("id");
    });
  });

  describe("fetch()", () => {
    it("builds query, fetches, and returns flattened rows", async () => {
      const mockFetch = mockFetchForIntrospection();

      // After introspection calls, the next call will be the data query
      mockFetch.mockImplementation((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);

        // Introspection queries have variables.typeName
        if (body.variables?.typeName) {
          const typeName = body.variables.typeName;
          let responseData;
          if (typeName === "Order") responseData = orderTypeResponse;
          else if (typeName === "Mutation") responseData = mutationTypeResponse;
          else if (typeName === "UpdateOrderInput") responseData = updateOrderInputResponse;
          else responseData = { data: { __type: null } };
          return Promise.resolve({ ok: true, json: () => Promise.resolve(responseData) });
        }

        // Data query
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                orders: [
                  { id: "1", orderNumber: "ORD-001", status: "shipped", total: 99.99 },
                  { id: "2", orderNumber: "ORD-002", status: "pending", total: 50.0 },
                ],
              },
            }),
        });
      });

      vi.stubGlobal("fetch", mockFetch);

      const drift = createDrift(config);
      const order = await drift.type("Order");
      const { rows } = await drift.fetch("orders", order);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        id: "1",
        orderNumber: "ORD-001",
        status: "shipped",
        total: 99.99,
      });
      expect(rows[1].id).toBe("2");
    });

    it("fetches with a subset of fields", async () => {
      const mockFetch = vi.fn();

      // Handle introspection
      mockFetch.mockImplementation((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.variables?.typeName) {
          const typeName = body.variables.typeName;
          let responseData;
          if (typeName === "Order") responseData = orderTypeResponse;
          else if (typeName === "Mutation") responseData = mutationTypeResponse;
          else if (typeName === "UpdateOrderInput") responseData = updateOrderInputResponse;
          else responseData = { data: { __type: null } };
          return Promise.resolve({ ok: true, json: () => Promise.resolve(responseData) });
        }

        // Check the query only has the requested fields
        expect(body.query).toContain("status");
        expect(body.query).not.toContain("orderNumber");

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { orders: [{ id: "1", status: "shipped" }] },
            }),
        });
      });

      vi.stubGlobal("fetch", mockFetch);

      const drift = createDrift(config);
      const order = await drift.type("Order");
      const statusOnly = order.fields.filter((f) => f.key === "status");
      const { rows } = await drift.fetch("orders", order, { fields: statusOnly });

      expect(rows[0]).toEqual({ id: "1", status: "shipped" });
    });
  });

  describe("update()", () => {
    it("unflattens values and sends mutation", async () => {
      const mockFetch = vi.fn();

      mockFetch.mockImplementation((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.variables?.typeName) {
          const typeName = body.variables.typeName;
          let responseData;
          if (typeName === "Order") responseData = orderTypeResponse;
          else if (typeName === "Mutation") responseData = mutationTypeResponse;
          else if (typeName === "UpdateOrderInput") responseData = updateOrderInputResponse;
          else responseData = { data: { __type: null } };
          return Promise.resolve({ ok: true, json: () => Promise.resolve(responseData) });
        }

        // Mutation call
        expect(body.query).toContain("updateOrder");
        expect(body.variables.id).toBe("1");
        expect(body.variables.input).toEqual({ status: "shipped" });

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { updateOrder: { id: "1", status: "shipped" } },
            }),
        });
      });

      vi.stubGlobal("fetch", mockFetch);

      const drift = createDrift(config);
      const order = await drift.type("Order");
      const result = await drift.update(order, {
        id: "1",
        values: { status: "shipped" },
      });

      expect(result).toBeDefined();
    });

    it("throws when id is missing for update", async () => {
      vi.stubGlobal("fetch", mockFetchForIntrospection());

      const drift = createDrift(config);
      const order = await drift.type("Order");

      await expect(drift.update(order, { values: { status: "shipped" } })).rejects.toThrow(
        "Update requires an id",
      );
    });
  });

  describe("create()", () => {
    it("sends create mutation without id", async () => {
      const mockFetch = vi.fn();

      mockFetch.mockImplementation((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.variables?.typeName) {
          const typeName = body.variables.typeName;
          let responseData;
          if (typeName === "Order") responseData = orderTypeResponse;
          else if (typeName === "Mutation") responseData = mutationTypeResponse;
          else if (typeName === "UpdateOrderInput") responseData = updateOrderInputResponse;
          else responseData = { data: { __type: null } };
          return Promise.resolve({ ok: true, json: () => Promise.resolve(responseData) });
        }

        expect(body.query).toContain("createOrder");
        expect(body.variables.id).toBeUndefined();

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { createOrder: { id: "3", status: "pending", total: 0 } },
            }),
        });
      });

      vi.stubGlobal("fetch", mockFetch);

      const drift = createDrift(config);
      const order = await drift.type("Order");
      const result = await drift.create(order, {
        values: { status: "pending", total: 0 },
      });

      expect(result).toBeDefined();
    });
  });

  describe("type() with mutation discovery failure", () => {
    it("falls back to empty mutations when discovery fails", async () => {
      const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        const typeName = body.variables?.typeName;

        if (typeName === "Order") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(orderTypeResponse),
          });
        }

        // Mutation and input introspection both fail
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { __type: null } }),
        });
      });

      vi.stubGlobal("fetch", mockFetch);

      const drift = createDrift(config);
      const order = await drift.type("Order");

      expect(order.typeName).toBe("Order");
      expect(order.mutations.size).toBe(0);
      expect(order.inputFields).toEqual([]);
      expect(order.editableFields).toEqual([]);
    });
  });
});
