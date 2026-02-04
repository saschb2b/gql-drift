import { describe, it, expect, vi, afterEach } from "vitest";
import { gqlFetch } from "../../src/core/fetch.js";
import type { DriftConfig } from "../../src/core/types.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gqlFetch", () => {
  describe("default fetch (no custom fetcher)", () => {
    it("calls globalThis.fetch with correct endpoint and body", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: { orders: [] } }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

      const config: DriftConfig = { endpoint: "http://localhost:4000/graphql" };
      await gqlFetch(config, "query { orders { id } }");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:4000/graphql",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("orders"),
        }),
      );
    });

    it("includes custom headers", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: {} }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

      const config: DriftConfig = {
        endpoint: "http://localhost:4000/graphql",
        headers: { Authorization: "Bearer token123" },
      };
      await gqlFetch(config, "query { orders { id } }");

      const callHeaders = (globalThis.fetch as any).mock.calls[0][1].headers;
      expect(callHeaders.Authorization).toBe("Bearer token123");
      expect(callHeaders["Content-Type"]).toBe("application/json");
    });

    it("returns data portion of response", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: { orders: [{ id: "1" }] } }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

      const config: DriftConfig = { endpoint: "http://localhost:4000/graphql" };
      const result = await gqlFetch(config, "query { orders { id } }");

      expect(result).toEqual({ orders: [{ id: "1" }] });
    });

    it("throws on HTTP error", async () => {
      const mockResponse = { ok: false, status: 500, statusText: "Internal Server Error" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

      const config: DriftConfig = { endpoint: "http://localhost:4000/graphql" };
      await expect(gqlFetch(config, "query { orders { id } }")).rejects.toThrow(
        "GraphQL request failed: 500",
      );
    });

    it("throws on GraphQL errors", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ errors: [{ message: "Field not found" }] }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

      const config: DriftConfig = { endpoint: "http://localhost:4000/graphql" };
      await expect(gqlFetch(config, "query { orders { id } }")).rejects.toThrow(
        "Field not found",
      );
    });

    it("passes variables to the request body", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ data: {} }),
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

      const config: DriftConfig = { endpoint: "http://localhost:4000/graphql" };
      await gqlFetch(config, "query ($id: ID!) { order(id: $id) { id } }", { id: "123" });

      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
      expect(body.variables).toEqual({ id: "123" });
    });
  });

  describe("custom fetcher", () => {
    it("calls the custom fetcher instead of globalThis.fetch", async () => {
      const customFetcher = vi.fn().mockResolvedValue({ orders: [{ id: "1" }] });
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const config: DriftConfig = {
        endpoint: "http://localhost:4000/graphql",
        fetcher: customFetcher,
      };
      const result = await gqlFetch(config, "query { orders { id } }", { limit: 10 });

      expect(customFetcher).toHaveBeenCalledWith({
        query: "query { orders { id } }",
        variables: { limit: 10 },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ orders: [{ id: "1" }] });
    });

    it("propagates errors from custom fetcher", async () => {
      const customFetcher = vi.fn().mockRejectedValue(new Error("Auth failed"));

      const config: DriftConfig = {
        endpoint: "http://localhost:4000/graphql",
        fetcher: customFetcher,
      };
      await expect(gqlFetch(config, "query { orders { id } }")).rejects.toThrow(
        "Auth failed",
      );
    });

    it("works with graphql-request style client", async () => {
      // Simulate a graphql-request client
      const mockClient = {
        request: vi.fn().mockResolvedValue({ orders: [{ id: "1", orderNumber: "ORD-001" }] }),
      };

      const config: DriftConfig = {
        endpoint: "http://localhost:4000/graphql",
        fetcher: ({ query, variables }) => mockClient.request(query, variables),
      };

      const result = await gqlFetch(config, "query { orders { id orderNumber } }");

      expect(mockClient.request).toHaveBeenCalledWith(
        "query { orders { id orderNumber } }",
        undefined,
      );
      expect(result).toEqual({ orders: [{ id: "1", orderNumber: "ORD-001" }] });
    });
  });
});
