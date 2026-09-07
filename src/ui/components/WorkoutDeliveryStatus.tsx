import React from 'react';
import { Link } from 'react-router';
import { DeliveryPresentation } from '../../domain/deliveryPresentation';

const destinationText: Record<string, string> = { NOT_YET_RECEIVED: 'Not yet received', RECEIVED: 'Received', DOWNLOADED: 'Downloaded', APPLIED: 'Applied', UNSUPPORTED_VERSION: 'Unsupported version', FAILED: 'Failed' };

export function WorkoutDeliveryStatus({ delivery, onRetry }: { delivery: DeliveryPresentation | null; onRetry?: () => void }) {
  if (!delivery) return null;
  return <section aria-labelledby="delivery-title" className="mb-4 rounded-lg border border-hv-border bg-hv-surface-1 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="delivery-title" className="font-semibold">{delivery.title}</h2><p className="mt-1 text-sm text-hv-text-muted">{delivery.detail}</p></div>
      {delivery.canRetry && onRetry && <button onClick={onRetry} className="rounded bg-hv-primary px-3 py-2 text-sm text-white">Retry sending this version</button>}
    </div>
    {delivery.destinations.length > 0 && <ul aria-label="Application delivery status" className="mt-3 grid gap-2 sm:grid-cols-2">
      {delivery.destinations.map(destination => <li key={destination.applicationId} className="rounded bg-hv-surface-2 px-3 py-2 text-sm"><span className="font-medium">{destination.label}</span>: {destinationText[destination.state]}{destination.reason ? ` — ${destination.reason}` : ''}</li>)}
    </ul>}
    {delivery.isConflict && <Link className="mt-3 inline-block text-sm text-hv-primary underline" to="/conflicts">Review this workout conflict in Conflict Centre</Link>}
    {delivery.versionId && <details className="mt-3 text-xs text-hv-text-muted"><summary className="cursor-pointer">Delivery details</summary><dl className="mt-2 break-all"><dt>Immutable version</dt><dd>{delivery.versionId}</dd><dt>Revision</dt><dd>{delivery.revision}</dd>{delivery.timestamp && <><dt>Queued/published</dt><dd>{delivery.timestamp}</dd></>}</dl></details>}
  </section>;
}
