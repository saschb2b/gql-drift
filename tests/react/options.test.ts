import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  driftQueryOptions,
  driftUpdateMutation,
  driftCreateMutation,
  driftQueryKey,
} from "../../src/react/options.js";
import type { DriftType, DriftConfig } from "../../src/core/types.js";

const config: DriftConfig = {
  endpoint: "http://localhost:4000/graphql",
};

const orderType: DriftType = {
  typeName: "Order",
  fields: [
    { key: "orderNumber", label: "Order Number", graphqlPath: "orderNumber", type: "string" },
    { key: "total", label: "Total", graphqlPath: "total", type: "number" },
    { key: "status", label: "Status", graphqlPath: "status", type: "enum", enumValues: ["PENDING", "SHIPPED"] },
  ],
  mutations: new Map([
    ["update", "updateOrder"],
    ["create", "createOrder"],
  ]),
  inputFields: [
    { key: "orderNumber", label: "Order Number", graphqlPath: "orderNumber", type: "string" },
    { key: "total", label: "Total", graphqlPath: "total", type: "number" },
  ],
  editableFields: [
    { key: "orderNumber", label: "Order Number", graphqlPath: "orderNumber", type: "string" },
    { key: "total", label: "Total", graphqlPath: "total", type: "number" },
  ],
};

describe("driftQueryKey", () => {
  it("returns a stable array with queryName, sorted keys, and filter", () => {
    const key = driftQueryKey({ type: orderType });
    expect(key).toEqual(["orders", ["orderNumber", "status", "total"], undefined]);
  });

  it("uses custom queryName if provided", () => {
    const key = driftQueryKey({ type: orderType, queryName: "allOrders" });
    expect(key[0]).toBe("allOrders");
  });

  it("defaults queryName from typeName (lowercase + s)", () => {
    const key = driftQueryKey({ type: orderType });
    expect(key[0]).toBe("orders");
  });

  it("includes filter in key", () => {
    const filter = { status: "PENDING" };
    const key = driftQueryKey({ type: orderType, filter });
    expect(key[2]).toEqual({ status: "PENDING" });
  });

  it("uses subset of fields when provided", () => {
    const key = driftQueryKey({
      type: orderType,
      fields: [orderType.fields[0]],
    });
    expect(key[1]).toEqual(["orderNumber"]);
  });

  it("produces stable keys for cache matching", () => {
    const key1 = driftQueryKey({ type: orderType });
    const key2 = driftQueryKey({ type: orderType });
    expect(key1).toEqual(key2);
  });
});

describe("driftQueryOptions", () => {
  it("returns queryKey and queryFn", () => {
    const opts = driftQueryOptions({ type: orderType, config });
    expect(opts.queryKey).toBeDefined();
    expect(typeof opts.queryFn).toBe("function");
  });

  it("queryKey matches driftQueryKey output", () => {
    const opts = driftQueryOptions({ type: orderType, config });
    const key = driftQueryKey({ type: orderType });
    expect(opts.queryKey).toEqual(key);
  });

  it("queryKey includes filter when provided", () => {
    const filter = { status: "PENDING" };
    const opts = driftQueryOptions({ type: orderType, config, filter });
    expect(opts.queryKey[2]).toEqual(filter);
  });

  it("queryFn calls fetch with correct endpoint", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        data: {
          orders: [
            { id: "1", orderNumber: "ORD-001", total: 99.99, status: "PENDING" },
          ],
        },
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const opts = driftQueryOptions({ type: orderType, config });
    const rows = await opts.queryFn({} as any);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/graphql",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );

    // Should return flattened rows
    expect(rows).toEqual([
      { id: "1", orderNumber: "ORD-001", total: 99.99, status: "PENDING" },
    ]);
  });

  it("returns empty array when response has no matching query name", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ data: { somethingElse: [] } }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const opts = driftQueryOptions({ type: orderType, config });
    const rows = await opts.queryFn({} as any);
    expect(rows).toEqual([]);
  });

  it("throws on GraphQL errors", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        errors: [{ message: "Not authorized" }],
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const opts = driftQueryOptions({ type: orderType, config });
    await expect(opts.queryFn({} as any)).rejects.toThrow("Not authorized");
  });

  it("throws on HTTP errors", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const opts = driftQueryOptions({ type: orderType, config });
    await expect(opts.queryFn({} as any)).rejects.toThrow("GraphQL request failed: 500");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe("driftUpdateMutation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns mutationFn", () => {
    const opts = driftUpdateMutation({ type: orderType, config });
    expect(typeof opts.mutationFn).toBe("function");
  });

  it("mutationFn sends update with unflattened input", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ data: { updateOrder: { id: "1" } } }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const opts = driftUpdateMutation({ type: orderType, config });
    await opts.mutationFn({ id: "1", values: { orderNumber: "NEW-001", total: 50 } });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/graphql",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("updateOrder"),
      }),
    );

    // Verify the body contains the unflattened input
    const callBody = JSON.parse(
      (globalThis.fetch as any).mock.calls[0][1].body,
    );
    expect(callBody.variables.id).toBe("1");
    expect(callBody.variables.input).toEqual({ orderNumber: "NEW-001", total: 50 });
  });
});

describe("driftCreateMutation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns mutationFn", () => {
    const opts = driftCreateMutation({ type: orderType, config });
    expect(typeof opts.mutationFn).toBe("function");
  });

  it("mutationFn sends create with unflattened input", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ data: { createOrder: { id: "2" } } }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const opts = driftCreateMutation({ type: orderType, config });
    await opts.mutationFn({ values: { orderNumber: "ORD-999", total: 42 } });

    const callBody = JSON.parse(
      (globalThis.fetch as any).mock.calls[0][1].body,
    );
    expect(callBody.variables.input).toEqual({ orderNumber: "ORD-999", total: 42 });
  });
});
