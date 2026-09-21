export const READ_ONLY_ACCEPTANCE_PARAM = "acceptance";
export const READ_ONLY_ACCEPTANCE_VALUE = "read-only";
export const READ_ONLY_ACCEPTANCE_SESSION_KEY = "humanv1.acceptance.read-only.v1";

export const READ_ONLY_ACCEPTANCE_MESSAGE =
  "Read-only acceptance mode: creation, editing, synchronization and publication controls are unavailable.";

export function acceptanceUrl(input: string): string {
  if (typeof window === "undefined" || !isReadOnlyAcceptanceMode()) return input;
  const url = new URL(input, window.location.origin);
  if (url.origin !== window.location.origin) return input;
  url.searchParams.set(READ_ONLY_ACCEPTANCE_PARAM, READ_ONLY_ACCEPTANCE_VALUE);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function restoreAcceptanceUrl(): boolean {
  if (typeof window === "undefined" || !isReadOnlyAcceptanceMode()) return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get(READ_ONLY_ACCEPTANCE_PARAM) === READ_ONLY_ACCEPTANCE_VALUE) return false;
  url.searchParams.set(READ_ONLY_ACCEPTANCE_PARAM, READ_ONLY_ACCEPTANCE_VALUE);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function isReadOnlyAcceptanceMode(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get(READ_ONLY_ACCEPTANCE_PARAM) === READ_ONLY_ACCEPTANCE_VALUE) {
    sessionStorage.setItem(READ_ONLY_ACCEPTANCE_SESSION_KEY, READ_ONLY_ACCEPTANCE_VALUE);
  }
  return sessionStorage.getItem(READ_ONLY_ACCEPTANCE_SESSION_KEY) === READ_ONLY_ACCEPTANCE_VALUE;
}

export function assertMutationAllowed(action: string): void {
  if (isReadOnlyAcceptanceMode()) {
    throw new Error(`READ_ONLY_ACCEPTANCE_MUTATION_BLOCKED:${action}`);
  }
}
