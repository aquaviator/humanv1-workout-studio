export interface ResearchSessionSummary { sessionId: string; name: string; variableDuration: boolean; totalDurationMinutes: number; discipline: string }

export const evidenceDirectnessLabel = (value: string): string => ({ DIRECT: "Direct evidence", EXTRAPOLATED: "Applied from related evidence" }[value] ?? "Evidence relationship unavailable");
export const evidenceVerificationLabel = (value: string): string => ({ VERIFIED: "Verified source", REQUIRES_VERIFICATION: "Further verification required" }[value] ?? "Verification status unavailable");

export function researchSessionPresentation(sessionId: string, sessions: ResearchSessionSummary[]) {
  const session = sessions.find(item => item.sessionId === sessionId);
  if (!session) return { available: false as const, title: "Session details unavailable", duration: "Duration unavailable", discipline: undefined };
  return { available: true as const, title: session.name, duration: session.variableDuration ? "Variable duration" : `${session.totalDurationMinutes} min`, discipline: session.discipline };
}

export function presentationSafePhasePurpose(value?: string): { text?: string; editorialDiagnostic?: string } {
  if (!value) return {};
  if (/peak enzymatic activity/i.test(value)) return { text: "Reduce training volume while retaining selected intensity before the event.", editorialDiagnostic: "The source objective contains an unsupported specific outcome and remains available in technical details for sports-science review." };
  return { text: value };
}
