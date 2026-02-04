import { describe, it, expect, vi, beforeEach } from "vitest";
import { unwrapType, introspectType, discoverMutations } from "../../src/core/introspection.js";
import type { IntrospectionType, DriftConfig } from "../../src/core/types.js";

const config: DriftConfig = {
  endpoint: "http://localhost:4000/graphql",
};

describe("unwrapType", () => {
  it("returns a SCALAR type as-is", () => {
    const t: IntrospectionType = { name: "String", kind: "SCALAR" };
    expect(unwrapType(t)).toEqual({ name: "String", kind: "SCALAR" });
  });

  it("unwraps NON_NULL wrapper", () => {
    const t: IntrospectionType = {
      name: null,
      kind: "NON_NULL",
      ofType: { name: "String", kind: "SCALAR" },
    };
    expect(unwrapType(t)).toEqual({ name: "String", kind: "SCALAR" });
  });

  it("unwraps LIST wrapper", () => {
    const t: IntrospectionType = {
      name: null,
      kind: "LIST",
      ofType: { name: "String", kind: "SCALAR" },
    };
    expect(unwrapType(t)).toEqual({ name: "String", kind: "SCALAR" });
  });

  it("unwraps NON_NULL(LIST(NON_NULL(SCALAR)))", () => {
    const t: IntrospectionType = {
      name: null,
      kind: "NON_NULL",
      ofType: {
        name: null,
        kind: "LIST",
        ofType: {
          name: null,
          kind: "NON_NULL",
          ofType: { name: "Int", kind: "SCALAR" },
        },
      },
    };
    expect(unwrapType(t)).toEqual({ name: "Int", kind: "SCALAR" });
  });

  it("returns OBJECT type when unwrapped", () => {
    const t: IntrospectionType = {
      name: null,
      kind: "NON_NULL",
      ofType: { name: "Address", kind: "OBJECT" },
    };
    expect(unwrapType(t)).toEqual({ name: "Address", kind: "OBJECT" });
  });
});

describe("introspectType", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns introspection result on success", async () => {
    const mockResult = {
      name: "Order",
      fields: [
        { name: "id", type: { name: "ID", kind: "SCALAR" } },
        { name: "status", type: { name: "String", kind: "SCALAR" } },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __type: mockResult } }),
      }),
    );

    const result = await introspectType("Order", config);
    expect(result).toEqual(mockResult);
    expect(fetch).toHaveBeenCalledWith(
      config.endpoint,
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(introspectType("Order", config)).rejects.toThrow("500");
  });

  it("throws when type not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __type: null } }),
      }),
    );

    await expect(introspectType("NonExistent", config)).rejects.toThrow(
      'Type "NonExistent" not found',
    );
  });

  it("throws on GraphQL errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            errors: [{ message: "Introspection disabled" }],
          }),
      }),
    );

    await expect(introspectType("Order", config)).rejects.toThrow("Introspection disabled");
  });

  it("passes custom headers", async () => {
    const authConfig: DriftConfig = {
      endpoint: "http://localhost:4000/graphql",
      headers: { Authorization: "Bearer token123" },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { __type: { name: "Order", fields: [] } },
          }),
      }),
    );

    await introspectType("Order", authConfig);

    expect(fetch).toHaveBeenCalledWith(
      authConfig.endpoint,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token123",
        }),
      }),
    );
  });
});

describe("discoverMutations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("discovers available mutations by naming convention", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              __type: {
                name: "Mutation",
                fields: [
                  { name: "updateOrder", type: { name: null, kind: "OBJECT" } },
                  { name: "deleteOrder", type: { name: null, kind: "OBJECT" } },
                  { name: "createCustomer", type: { name: null, kind: "OBJECT" } },
                ],
              },
            },
          }),
      }),
    );

    const result = await discoverMutations("Order", config);
    expect(result.get("update")).toBe("updateOrder");
    expect(result.get("delete")).toBe("deleteOrder");
    expect(result.has("create")).toBe(false);
  });

  it("throws when Mutation type cannot be introspected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __type: null } }),
      }),
    );

    await expect(discoverMutations("Order", config)).rejects.toThrow(
      /Could not introspect Mutation type/,
    );
  });

  it("returns empty map when no mutations match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              __type: {
                name: "Mutation",
                fields: [{ name: "doSomething", type: { name: null, kind: "OBJECT" } }],
              },
            },
          }),
      }),
    );

    const result = await discoverMutations("Order", config);
    expect(result.size).toBe(0);
  });
});
