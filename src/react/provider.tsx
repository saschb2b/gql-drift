import { createContext, useContext } from "react";
import type { DriftConfig } from "../core/types.js";

const DriftContext = createContext<DriftConfig | null>(null);

export interface DriftProviderProps {
  /** Drift configuration (endpoint, headers, etc.) */
  config: DriftConfig;
  children: React.ReactNode;
}

/**
 * Provides a default DriftConfig to all gql-drift hooks.
 *
 * ```tsx
 * <DriftProvider config={{ endpoint: "/graphql" }}>
 *   <App />
 * </DriftProvider>
 * ```
 */
export function DriftProvider({ config, children }: Readonly<DriftProviderProps>) {
  return <DriftContext.Provider value={config}>{children}</DriftContext.Provider>;
}

/**
 * Read the DriftConfig from the nearest DriftProvider.
 * Returns null if no provider is found (caller must handle).
 */
export function useDriftConfig(): DriftConfig | null {
  return useContext(DriftContext);
}
