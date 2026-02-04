import type { FieldDefinition } from "./types.js";

/**
 * Build a selection set string from field paths.
 * Groups nested paths: "shippingAddress.city" + "shippingAddress.country"
 * becomes "shippingAddress { city country }".
 */
export function buildSelectionSet(paths: string[]): string[] {
  const roots: string[] = [];
  const nested = new Map<string, string[]>();

  for (const path of paths) {
    const dot = path.indexOf(".");
    if (dot === -1) {
      roots.push(path);
    } else {
      const parent = path.slice(0, dot);
      const child = path.slice(dot + 1);
      if (!nested.has(parent)) nested.set(parent, []);
      nested.get(parent)!.push(child);
    }
  }

  return [
    ...roots,
    ...[...nested.entries()].map(([parent, children]) => `${parent} { ${children.join(" ")} }`),
  ];
}

export interface BuildQueryOptions {
  /** Filter type name for the query, e.g. "OrderFilter" */
  filter?: string;
  /** Additional variable declarations, e.g. "$limit: Int" */
  variables?: string;
}

/**
 * Build a GraphQL query string from a query name and field definitions.
 *
 * Always includes `id` in the selection. Groups nested paths into
 * sub-selections automatically.
 */
export function buildQuery(
  queryName: string,
  fields: FieldDefinition[],
  options?: BuildQueryOptions,
): string {
  const paths = ["id", ...fields.map((f) => f.graphqlPath)];
  const selections = buildSelectionSet(paths);

  // Build variable declarations
  const varParts: string[] = [];
  const argParts: string[] = [];

  if (options?.filter) {
    varParts.push(`$filter: ${options.filter}`);
    argParts.push("filter: $filter");
  }
  if (options?.variables) {
    varParts.push(options.variables);
  }

  const varStr = varParts.length > 0 ? `(${varParts.join(", ")})` : "";
  const argStr = argParts.length > 0 ? `(${argParts.join(", ")})` : "";

  const capitalized = queryName.charAt(0).toUpperCase() + queryName.slice(1);

  return `query ${capitalized}${varStr} {
  ${queryName}${argStr} {
    ${selections.join("\n    ")}
  }
}`;
}
