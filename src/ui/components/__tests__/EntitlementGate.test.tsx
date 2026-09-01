import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import EntitlementGate from '../EntitlementGate';

describe('EntitlementGate', () => {
  it('blocks expired accounts from authoring', () => {
    render(<MemoryRouter><EntitlementGate entitlement={{ state: 'EXPIRED' }}><div>Authoring tools</div></EntitlementGate></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Studio access expired' })).toBeInTheDocument();
    expect(screen.queryByText('Authoring tools')).not.toBeInTheDocument();
  });

  it('fails closed without presenting a false expired state when verification is unavailable', () => {
    render(<MemoryRouter><EntitlementGate entitlement={{ state: 'VERIFICATION_UNAVAILABLE' }}><div>Authoring tools</div></EntitlementGate></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Membership verification unavailable' })).toBeInTheDocument();
    expect(screen.queryByText('Studio access expired')).not.toBeInTheDocument();
    expect(screen.queryByText('Authoring tools')).not.toBeInTheDocument();
  });

  it('allows authoring for server-backed active access', () => {
    render(<MemoryRouter><EntitlementGate entitlement={{ state: 'TRIAL_ACTIVE' }}><div>Authoring tools</div></EntitlementGate></MemoryRouter>);
    expect(screen.getByText('Authoring tools')).toBeInTheDocument();
  });
});
