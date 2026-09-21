import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { TriathlonResearchLibrary } from "../TriathlonResearchLibrary";

describe("TriathlonResearchLibrary", () => {
  it("inspects accessibly without writing and confirms one cloud copy", async () => { const user = userEvent.setup(); const clone = vi.fn(async () => undefined); const { container } = render(<TriathlonResearchLibrary onClone={clone} />); expect(screen.getByText(/Sports-science review required/)).toBeInTheDocument(); await user.click(screen.getByRole("tab", { name: "Intermediate Ironman" })); await user.click(screen.getByText("Weeks, multiple-session ordering and race placeholders")); expect(clone).not.toHaveBeenCalled(); expect(await axe(container)).toHaveNoViolations(); await user.click(screen.getByTestId("create-research-copy-intermediate-ironman-16-week")); expect(clone).not.toHaveBeenCalled(); expect(screen.getByText(/creates new cloud data/i)).toBeInTheDocument(); await user.click(screen.getByRole("button", { name: "Create cloud copy of Intermediate Ironman" })); expect(clone).toHaveBeenCalledOnce(); });
  it("keeps inspection available but removes mutation controls in read-only acceptance", async () => { const user = userEvent.setup(); const clone = vi.fn(); render(<TriathlonResearchLibrary onClone={clone} mutationDisabled />); await user.click(screen.getByRole("tab", { name: "Intermediate Half Ironman" })); await user.click(screen.getByText("Evidence and limitations")); expect(screen.getByText(/Evidence supports general training principles/)).toBeInTheDocument(); expect(screen.queryByTestId(/create-research-copy/)).not.toBeInTheDocument(); expect(clone).not.toHaveBeenCalled(); });
  it("renders an accessible, wrapping phase timeline with names and truthful boundaries", async () => {
    const clone = vi.fn();
    const { container } = render(<TriathlonResearchLibrary onClone={clone} mutationDisabled />);
    const timeline = screen.getByRole("list", { name: "Plan phase timeline" });
    expect(timeline).toHaveClass("break-words");
    expect(screen.getByText("Foundation Base").parentElement).toHaveTextContent("Foundation Base — Weeks 1–2");
    expect(screen.getByText("Recovery Block").parentElement).toHaveTextContent("Weeks 4, 8 · Includes recovery");
    expect(screen.getByText("Exponential Taper").parentElement).toHaveTextContent("Week 11 · Taper");
    expect(screen.getByText("Event Execution").parentElement).toHaveTextContent("Week 12 · Event");
    expect(container.textContent).not.toMatch(/\d+\.\s*:/);
    expect(clone).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});
