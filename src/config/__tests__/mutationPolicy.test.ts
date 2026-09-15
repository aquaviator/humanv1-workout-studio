import { afterEach, describe, expect, it } from 'vitest';
import { assertMutationAllowed, isReadOnlyAcceptanceMode } from '../mutationPolicy';

describe('read-only acceptance mutation boundary', () => {
  afterEach(() => { window.history.replaceState({}, '', '/'); sessionStorage.clear(); });
  it('allows normal user mutation mode', () => { expect(isReadOnlyAcceptanceMode()).toBe(false); expect(() => assertMutationAllowed('save')).not.toThrow(); });
  it('fails closed for attempted mutation in acceptance mode', () => { window.history.replaceState({}, '', '/plans?acceptance=read-only'); expect(isReadOnlyAcceptanceMode()).toBe(true); expect(() => assertMutationAllowed('savePlanDraft')).toThrow('READ_ONLY_ACCEPTANCE_MUTATION_BLOCKED:savePlanDraft'); });
  it('persists across client-side navigation for the tab', () => { window.history.replaceState({}, '', '/plans?acceptance=read-only'); expect(isReadOnlyAcceptanceMode()).toBe(true); window.history.replaceState({}, '', '/plans/example'); expect(() => assertMutationAllowed('savePlanDraft')).toThrow('READ_ONLY_ACCEPTANCE_MUTATION_BLOCKED:savePlanDraft'); });
});
