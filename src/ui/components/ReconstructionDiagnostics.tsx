import { ReconstructionDiagnostic } from "../../domain/presentation";

export default function ReconstructionDiagnostics({ diagnostics = [] }: { diagnostics?: ReconstructionDiagnostic[] }) {
  if (!diagnostics.length) return null;
  const structural = diagnostics.some(item => item.severity === "blocking");
  return <div role="status" aria-label="Reconstruction status" className="mt-3 rounded-md border border-hv-warning/40 bg-hv-surface-2 p-3 text-sm">
    <p className="font-medium">{structural ? "Some original details are unavailable" : "Timestamp unavailable"}</p>
    <details className="mt-2">
      <summary className="cursor-pointer text-hv-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-hv-primary rounded">Details</summary>
      <ul className="mt-2 space-y-2 text-xs text-hv-text-muted">
        {diagnostics.map((item, index) => <li key={`${item.category}_${item.referenceId ?? index}`}>
          <span className="font-medium text-hv-text">{item.entityType}</span>{item.referenceId ? ` · ${item.referenceId}` : ""}: {item.reason} {item.recommendedAction}
        </li>)}
      </ul>
    </details>
  </div>;
}
