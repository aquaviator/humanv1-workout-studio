import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { Plan } from "../../../domain/types";
import { referenceDiagnostic, timestampDiagnostic } from "../../../domain/presentation";
import { PlacementReconstructionStatus, PlanReconstructionStatus } from "../PlanReconstructionStatus";

const placement = { placementId: "placement-safe-1", dayOfWeek: 1, workoutId: "workout-archived", workoutVersionId: "editable:workout-archived", preferredMinuteOfDay: null, reminderEnabled: false, notes: "" };
const plan = (diagnostics = [] as Plan["reconstructionDiagnostics"]): Plan => ({ schemaVersion: "humanv1.plan/1", planId: "plan-1", title: "Safe plan", description: "", weeks: [{ weekId: "week-1", weekNumber: 1, label: "Week 1", placements: [placement] }], reconstructionDiagnostics: diagnostics });

describe("Plan editor reconstruction status", () => {
  it("does not show an attention banner for valid or timestamp-only plans", () => {
    const { rerender } = render(<PlanReconstructionStatus plan={plan()} />);
    expect(screen.queryByText("This plan needs attention")).not.toBeInTheDocument();
    rerender(<PlanReconstructionStatus plan={plan(timestampDiagnostic(null))} />);
    expect(screen.queryByText("This plan needs attention")).not.toBeInTheDocument();
  });
  it("shows one archived diagnostic at its exact placement with safe technical details", () => {
    const diagnostic = referenceDiagnostic("workout", placement.workoutId, { deletedAt: 1, name: "Archived Legs" })!;
    render(<PlanReconstructionStatus plan={plan([diagnostic, diagnostic])} />);
    expect(screen.getAllByText(/scheduled workout is archived/i)).toHaveLength(1);
    expect(screen.getByText(/Week 1, Monday · placement placement-safe-1/)).toBeInTheDocument();
    expect(screen.getByText("workout-archived")).toBeInTheDocument();
    expect(screen.getByText("ARCHIVED_PARENT")).toBeInTheDocument();
    expect(screen.getByText(/Archived Legs:/)).toBeInTheDocument();
    expect(screen.queryByText(/firestore|users\//i)).not.toBeInTheDocument();
  });
  it("distinguishes missing language and performs no write during safe inspection", () => {
    const write = vi.fn();
    render(<PlanReconstructionStatus plan={plan([referenceDiagnostic("workout", placement.workoutId, null)!])} />);
    expect(screen.getByText(/workout reference is absent/i)).toBeInTheDocument();
    expect(screen.queryByText(/scheduled workout is archived/i)).not.toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
  });
  it("retains the diagnostic across reconstruction and passes focused axe", async () => {
    const diagnostic = referenceDiagnostic("workout", placement.workoutId, { deletedAt: 1 })!;
    const { container, rerender } = render(<PlanReconstructionStatus plan={plan([diagnostic])} />);
    rerender(<PlanReconstructionStatus plan={structuredClone(plan([diagnostic]))} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Existing plan data has not been deleted");
    expect(await axe(container)).toHaveNoViolations();
  });
});
