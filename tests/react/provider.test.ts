import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { DriftProvider, useDriftConfig } from "../../src/react/provider.js";
import type { DriftConfig } from "../../src/core/types.js";

describe("DriftProvider + useDriftConfig", () => {
  it("returns null when no provider is present", () => {
    const { result } = renderHook(() => useDriftConfig());
    expect(result.current).toBeNull();
  });

  it("returns config from the nearest provider", () => {
    const config: DriftConfig = {
      endpoint: "http://localhost:4000/graphql",
      headers: { Authorization: "Bearer token" },
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(DriftProvider, { config }, children);

    const { result } = renderHook(() => useDriftConfig(), { wrapper });
    expect(result.current).toEqual(config);
    expect(result.current?.endpoint).toBe("http://localhost:4000/graphql");
    expect(result.current?.headers?.Authorization).toBe("Bearer token");
  });

  it("inner provider overrides outer provider", () => {
    const outerConfig: DriftConfig = { endpoint: "http://outer/graphql" };
    const innerConfig: DriftConfig = { endpoint: "http://inner/graphql" };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        DriftProvider,
        { config: outerConfig },
        createElement(DriftProvider, { config: innerConfig }, children),
      );

    const { result } = renderHook(() => useDriftConfig(), { wrapper });
    expect(result.current?.endpoint).toBe("http://inner/graphql");
  });
});
