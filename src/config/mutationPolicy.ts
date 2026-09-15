export const READ_ONLY_ACCEPTANCE_PARAM = "acceptance";
export const READ_ONLY_ACCEPTANCE_VALUE = "read-only";
const SESSION_KEY = "hv1_read_only_acceptance";

export function isReadOnlyAcceptanceMode(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get(READ_ONLY_ACCEPTANCE_PARAM) === READ_ONLY_ACCEPTANCE_VALUE) sessionStorage.setItem(SESSION_KEY, "true");
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

export function assertMutationAllowed(action: string): void {
  if (isReadOnlyAcceptanceMode()) {
    throw new Error(`READ_ONLY_ACCEPTANCE_MUTATION_BLOCKED:${action}`);
  }
}
