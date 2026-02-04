import type { DriftConfig } from "./types.js";

/**
 * Execute a GraphQL request using either the custom fetcher or the built-in fetch.
 * Returns the `data` portion of the GraphQL response.
 */
export async function gqlFetch(
  config: DriftConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  if (config.fetcher) {
    return config.fetcher({ query, variables });
  }

  const res = await globalThis.fetch(config.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...config.headers },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {
    data?: unknown;
    errors?: { message: string }[];
  };

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join(", "));
  }

  return json.data;
}
