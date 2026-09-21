import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { TriathlonResearchLibrary } from "../TriathlonResearchLibrary";

describe("TriathlonResearchLibrary athlete experience", () => {
  it("offers keyboard-operable plan choices and one selected plan", async () => {
    const user = userEvent.setup(); render(<TriathlonResearchLibrary onClone={vi.fn()} mutationDisabled />);
    const tabs = screen.getAllByRole("tab"); expect(tabs).toHaveLength(4); expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    tabs[0].focus(); await user.keyboard("{ArrowRight}"); expect(screen.getByRole("tab", { name: /Intermediate Half Ironman/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("renders friendly overview, chronological phases and workload", () => {
    render(<TriathlonResearchLibrary onClone={vi.fn()} mutationDisabled />);
    const athlete = screen.getByTestId("athlete-plan-experience");
    expect(athlete).toHaveTextContent("2 hr 5 min–8 hr 15 min");
    expect(athlete).toHaveTextContent("31 hr 30 min");
    const journey = screen.getByRole("list", { name: "Chronological plan phases" });
    expect(within(journey).getAllByText("Recovery Phase")).toHaveLength(2);
    expect(journey).toHaveTextContent("Weeks 1–2Foundation Phase");
    expect(journey).toHaveTextContent("Week 12Race Week");
    expect(journey).not.toHaveTextContent("peak enzymatic activity");
  });

  it("shows one week initially, all seven days, rest, friendly sessions and exact multi-session order", async () => {
    const user = userEvent.setup(); render(<TriathlonResearchLibrary onClone={vi.fn()} mutationDisabled />);
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Week 1 schedule" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Week 2 schedule" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem", { name: /schedule/ })).toHaveLength(7);
    expect(screen.getByText("Rest day")).toBeInTheDocument();
    expect(screen.getByLabelText(/Tuesday: Easy Aerobic Swim, 30 min/)).not.toHaveTextContent(/^1\./);
    await user.click(screen.getByRole("tab", { name: /Intermediate Ironman/ }));
    const ordered = screen.queryAllByLabelText(/session 1 of 2/); expect(ordered.length).toBeGreaterThan(0); expect(ordered[0]).toHaveTextContent(/^1\./);
  });

  it("hides internal values in the athlete view and keeps reviewer/evidence details closed", () => {
    render(<TriathlonResearchLibrary onClone={vi.fn()} mutationDisabled />);
    const athlete = screen.getByTestId("athlete-plan-experience");
    const reviewer = screen.getByTestId("reviewer-technical-details");
    expect(reviewer).not.toHaveAttribute("open");
    expect(screen.getByText("Plan methodology and evidence").parentElement).not.toHaveAttribute("open");
    const ordinary = athlete.textContent!.replace(reviewer.textContent!, "");
    for (const forbidden of ["phase_peak", "phase_base", "phase_deload", "DIRECT", "EXTRAPOLATED", "VERIFIED", "REQUIRES_VERIFICATION", "ref_", "assignmentId", "schemaVersion"]) expect(ordinary).not.toContain(forbidden);
    expect(reviewer).toHaveTextContent("phase_base");
  });

  it("preserves read-only safety and passes focused accessibility", async () => {
    const clone = vi.fn(); const { container } = render(<TriathlonResearchLibrary onClone={clone} mutationDisabled />);
    expect(screen.queryByRole("button", { name: /Use .*plan/i })).not.toBeInTheDocument(); expect(clone).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  }, 15_000);

  it("retains the governed writable copy action with athlete wording", async () => {
    const user = userEvent.setup(); const clone = vi.fn(async () => undefined); render(<TriathlonResearchLibrary onClone={clone} />);
    await user.click(screen.getByRole("button", { name: "Use First Half Ironman" })); expect(clone).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Use First Half Ironman" })); expect(clone).toHaveBeenCalledOnce();
  });
});
