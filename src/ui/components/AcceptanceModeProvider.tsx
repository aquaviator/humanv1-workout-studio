import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import {
  acceptanceUrl,
  isReadOnlyAcceptanceMode,
  READ_ONLY_ACCEPTANCE_MESSAGE,
  restoreAcceptanceUrl,
} from "../../config/mutationPolicy";

interface AcceptanceModeValue {
  isReadOnlyAcceptance: boolean;
  internalUrl(path: string): string;
}

const AcceptanceModeContext = createContext<AcceptanceModeValue>({
  isReadOnlyAcceptance: false,
  internalUrl: path => path,
});

// This is deliberately conservative: any accidentally exposed control whose
// accessible name starts with a write verb is removed as a second UI defence.
const mutationLabel = /^(create|edit|rename|duplicate|archive|restore|delete|copy to studio|save(?:\s|$)|publish|send to|retry(?:\s|$)|keep studio|keep app|resolve|import|seed|add exercise|add block|remove(?:\s|$))/i;

function protectMutationControls(root: ParentNode = document) {
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = anchor.getAttribute("href");
    if (href) anchor.setAttribute("href", acceptanceUrl(href));
  }
  for (const element of root.querySelectorAll<HTMLElement>("button, a, input[type=submit], input[type=button], [role=button]")) {
    const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || "";
    if (element.dataset.mutationControl === "true" || mutationLabel.test(label)) {
      element.hidden = true;
      element.setAttribute("aria-disabled", "true");
      element.dataset.readOnlyAcceptanceBlocked = "true";
    }
  }
}

export function AcceptanceModeProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [isReadOnlyAcceptance, setReadOnlyAcceptance] = useState(() => isReadOnlyAcceptanceMode());

  useEffect(() => {
    const active = isReadOnlyAcceptanceMode();
    setReadOnlyAcceptance(active);
    if (active) restoreAcceptanceUrl();
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!isReadOnlyAcceptance) return;
    document.documentElement.dataset.acceptanceMode = "read-only";
    protectMutationControls();
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof HTMLElement) protectMutationControls(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const blockAccidentalMutation = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button, a, input, [role=button]") : null;
      if (target?.dataset.readOnlyAcceptanceBlocked === "true" || target?.dataset.mutationControl === "true") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", blockAccidentalMutation, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", blockAccidentalMutation, true);
      delete document.documentElement.dataset.acceptanceMode;
    };
  }, [isReadOnlyAcceptance, location.pathname]);

  const value = useMemo<AcceptanceModeValue>(() => ({
    isReadOnlyAcceptance,
    internalUrl: path => isReadOnlyAcceptance ? acceptanceUrl(path) : path,
  }), [isReadOnlyAcceptance]);

  return <AcceptanceModeContext.Provider value={value}>{children}</AcceptanceModeContext.Provider>;
}

export function useAcceptanceMode(): AcceptanceModeValue {
  return useContext(AcceptanceModeContext);
}

export function AcceptanceModeBanner() {
  const { isReadOnlyAcceptance } = useAcceptanceMode();
  return isReadOnlyAcceptance
    ? <div role="status" className="mx-4 mt-4 rounded border border-hv-border p-4 text-sm text-hv-text-muted">{READ_ONLY_ACCEPTANCE_MESSAGE}</div>
    : null;
}
