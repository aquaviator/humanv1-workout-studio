import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { TriathlonResearchLibrary } from "../TriathlonResearchLibrary";

describe("TriathlonResearchLibrary", () => {
  it("inspects without writing and confirms one cloud copy", async () => { const user = userEvent.setup(); const clone = vi.fn(async () => undefined); render(<TriathlonResearchLibrary onClone={clone} />); expect(screen.getByText(/Sports-science review required/)).toBeInTheDocument(); await user.click(screen.getByRole("tab", { name: "Intermediate Ironman" })); await user.click(screen.getByText("Weeks, sessions and race placeholders")); expect(clone).not.toHaveBeenCalled(); await user.click(screen.getByTestId("create-research-copy-intermediate-ironman-16-week")); expect(clone).not.toHaveBeenCalled(); expect(screen.getByText(/creates new cloud data/i)).toBeInTheDocument(); await user.click(screen.getByRole("button", { name: "Create cloud copy of Intermediate Ironman" })); expect(clone).toHaveBeenCalledOnce(); });
  it("keeps inspection available but removes mutation controls in read-only acceptance", async () => { const user = userEvent.setup(); const clone = vi.fn(); render(<TriathlonResearchLibrary onClone={clone} mutationDisabled />); await user.click(screen.getByRole("tab", { name: "Intermediate Half Ironman" })); await user.click(screen.getByText("Evidence and limitations")); expect(screen.getByText(/Evidence supports general training principles/)).toBeInTheDocument(); expect(screen.queryByTestId(/create-research-copy/)).not.toBeInTheDocument(); expect(clone).not.toHaveBeenCalled(); });
  it("renders an accessible, wrapping phase timeline with names and truthful boundaries", async () => {
    const clone = vi.fn();
    const { container } = render(<TriathlonResearchLibrary onClone={clone} mutationDisabled />);
    const timeline = screen.getByRole("list", { name: "Plan phase timeline" });
    expect(timeline).toHaveClass("break-words");
    expect(screen.getByRole("heading", { name: "Weeks 1–2 — Foundation Base" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Week 4 — Recovery Block" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Week 8 — Recovery Block" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Week 11 — Exponential Taper" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Week 12 — Event Execution" })).toBeInTheDocument();
    expect(timeline.textContent).not.toContain("peak enzymatic activity");
    expect(timeline).toHaveTextContent("Reduce training volume while retaining selected intensity before the event.");
    expect(container.textContent).not.toMatch(/\d+\.\s*:/);
    expect(clone).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  }, 15_000);
  it("shows athlete-friendly sessions, omits zero totals and keeps stable IDs collapsed", async () => {
    const user = userEvent.setup(); render(<TriathlonResearchLibrary onClone={vi.fn()} mutationDisabled />);
    expect(screen.queryByText("0 minutes")).not.toBeInTheDocument();
    await user.click(screen.getByText("Weeks, sessions and race placeholders"));
    expect(screen.getAllByText("Easy Aerobic Swim").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/TUESDAY: Easy Aerobic Swim, 30 min/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: "Intermediate Ironman" }));
    expect(screen.getAllByLabelText(/session 1 of 2/).length).toBeGreaterThan(0);
  });
});
