import type { FieldDefinition, MutationOperation } from "./types.js";
import { buildSelectionSet } from "./query-builder.js";

/**
 * Get the mutation name for a type and operation by convention.
 * e.g. getMutationName("Order", "update") -> "updateOrder"
 */
export function getMutationName(
  typeName: string,
  operation: MutationOperation,
): string {
  return `${operation}${typeName}`;
}

/**
 * Get the input type name for a type and operation by convention.
 * e.g. getInputTypeName("Order", "update") -> "UpdateOrderInput"
 */
export function getInputTypeName(
  typeName: string,
  operation: MutationOperation,
): string {
  const capitalizedOp =
    operation.charAt(0).toUpperCase() + operation.slice(1);
  return `${capitalizedOp}${typeName}Input`;
}

/**
 * Build a GraphQL update mutation string.
 *
 * Produces:
 * mutation UpdateOrder($id: ID!, $input: UpdateOrderInput!) {
 *   updateOrder(id: $id, input: $input) { id ... }
 * }
 */
export function buildUpdateMutation(
  typeName: string,
  returnFields: FieldDefinition[],
  inputTypeName?: string,
): string {
  const mutationName = getMutationName(typeName, "update");
  const inputType = inputTypeName ?? getInputTypeName(typeName, "update");

  const paths = ["id", ...returnFields.map((f) => f.graphqlPath)];
  const selections = buildSelectionSet(paths);

  const capitalized =
    mutationName.charAt(0).toUpperCase() + mutationName.slice(1);

  return `mutation ${capitalized}($id: ID!, $input: ${inputType}!) {
  ${mutationName}(id: $id, input: $input) {
    ${selections.join("\n    ")}
  }
}`;
}

/**
 * Build a GraphQL create mutation string.
 *
 * Produces:
 * mutation CreateOrder($input: CreateOrderInput!) {
 *   createOrder(input: $input) { id ... }
 * }
 */
export function buildCreateMutation(
  typeName: string,
  returnFields: FieldDefinition[],
  inputTypeName?: string,
): string {
  const mutationName = getMutationName(typeName, "create");
  const inputType = inputTypeName ?? getInputTypeName(typeName, "create");

  const paths = ["id", ...returnFields.map((f) => f.graphqlPath)];
  const selections = buildSelectionSet(paths);

  const capitalized =
    mutationName.charAt(0).toUpperCase() + mutationName.slice(1);

  return `mutation ${capitalized}($input: ${inputType}!) {
  ${mutationName}(input: $input) {
    ${selections.join("\n    ")}
  }
}`;
}
