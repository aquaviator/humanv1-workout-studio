import { afterEach, describe, expect, it } from 'vitest';
import { acceptanceUrl, assertMutationAllowed, isReadOnlyAcceptanceMode, restoreAcceptanceUrl } from '../mutationPolicy';

describe('read-only acceptance mutation boundary', () => {
  afterEach(() => { window.history.replaceState({}, '', '/'); sessionStorage.clear(); });
  it('allows normal user mutation mode', () => { expect(isReadOnlyAcceptanceMode()).toBe(false); expect(() => assertMutationAllowed('save')).not.toThrow(); });
  it('fails closed for attempted mutation in acceptance mode', () => { window.history.replaceState({}, '', '/plans?acceptance=read-only'); expect(isReadOnlyAcceptanceMode()).toBe(true); expect(() => assertMutationAllowed('savePlanDraft')).toThrow('READ_ONLY_ACCEPTANCE_MUTATION_BLOCKED:savePlanDraft'); });
  it('persists across client-side navigation for the tab', () => { window.history.replaceState({}, '', '/plans?acceptance=read-only'); expect(isReadOnlyAcceptanceMode()).toBe(true); window.history.replaceState({}, '', '/plans/example'); expect(() => assertMutationAllowed('savePlanDraft')).toThrow('READ_ONLY_ACCEPTANCE_MUTATION_BLOCKED:savePlanDraft'); });
  it('restores the truthful URL without losing safe query values or fragments', () => {
    window.history.replaceState({}, '', '/plans?acceptance=read-only');
    expect(isReadOnlyAcceptanceMode()).toBe(true);
    window.history.replaceState({}, '', '/workouts?view=archived#item');
    expect(restoreAcceptanceUrl()).toBe(true);
    expect(window.location.href).toContain('/workouts?view=archived&acceptance=read-only#item');
    expect(restoreAcceptanceUrl()).toBe(false);
  });
  it('preserves the mode only for same-origin links', () => {
    window.history.replaceState({}, '', '/plans?acceptance=read-only');
    expect(isReadOnlyAcceptanceMode()).toBe(true);
    expect(acceptanceUrl('/workouts?view=all#top')).toBe('/workouts?view=all&acceptance=read-only#top');
    expect(acceptanceUrl('https://example.com/help')).toBe('https://example.com/help');
  });
  it('does not leak into a cleared tab session', () => {
    window.history.replaceState({}, '', '/plans?acceptance=read-only');
    expect(isReadOnlyAcceptanceMode()).toBe(true);
    sessionStorage.clear();
    window.history.replaceState({}, '', '/plans');
    expect(isReadOnlyAcceptanceMode()).toBe(false);
  });
});
