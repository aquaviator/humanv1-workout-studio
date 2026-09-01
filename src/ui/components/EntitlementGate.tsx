import React from 'react';
import { Link } from 'react-router';
import { Entitlement, permitsStudioAuthoring } from '../../domain/entitlement';

export default function EntitlementGate({ entitlement, children }: { entitlement: Entitlement | null; children: React.ReactNode }) {
  if (!entitlement || entitlement.state === 'CHECKING') {
    return <div className="p-8 text-hv-text-muted">Checking membership…</div>;
  }

  if (permitsStudioAuthoring(entitlement.state)) return <>{children}</>;

  const unavailable = entitlement.state === 'VERIFICATION_UNAVAILABLE';
  return (
    <div className="p-8">
      <div className="max-w-xl bg-hv-surface-1 border border-hv-border rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-3">{unavailable ? 'Membership verification unavailable' : 'Studio access expired'}</h1>
        <p className="text-hv-text-muted mb-6">
          {unavailable
            ? 'Workout authoring is unavailable until your server-backed membership can be verified.'
            : 'Your introductory or subscribed access has ended. Your existing account remains available.'}
        </p>
        <Link className="text-hv-primary font-medium" to="/account">Open account settings</Link>
      </div>
    </div>
  );
}
