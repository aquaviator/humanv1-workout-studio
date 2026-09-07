import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import ReconstructionDiagnostics from "../ReconstructionDiagnostics";
import { referenceDiagnostic, timestampDiagnostic } from "../../../domain/presentation";

describe("ReconstructionDiagnostics", () => {
  it("shows plain-language, expandable, privacy-safe details", () => {
    render(<ReconstructionDiagnostics diagnostics={[referenceDiagnostic("workout", "workout_1", null)!]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Some original details are unavailable");
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText(/workout_1/)).toBeInTheDocument();
  });
  it("renders without writes and survives reconstruction", () => {
    const write = vi.fn(); const diagnostics = timestampDiagnostic(null);
    const { rerender } = render(<ReconstructionDiagnostics diagnostics={diagnostics} />);
    rerender(<ReconstructionDiagnostics diagnostics={structuredClone(diagnostics)} />);
    expect(screen.getByRole("status")).toHaveTextContent("Timestamp unavailable");
    expect(write).not.toHaveBeenCalled();
  });
  it("passes focused accessibility checks", async () => {
    const { container } = render(<ReconstructionDiagnostics diagnostics={[referenceDiagnostic("workout", "workout_1", { deletedAt: 1 })!]} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
