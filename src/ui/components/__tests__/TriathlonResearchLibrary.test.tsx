import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { TriathlonResearchLibrary } from "../TriathlonResearchLibrary";

describe("TriathlonResearchLibrary", () => {
  it("is keyboard accessible and exposes research safety, phases, evidence and ordered days", async () => { const user = userEvent.setup(); const clone = vi.fn(); const { container } = render(<TriathlonResearchLibrary onClone={clone} />); expect(screen.getByText(/Sports-science review required/)).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Prerequisites" })).toBeInTheDocument(); await user.click(screen.getByRole("tab", { name: "Intermediate Ironman" })); await user.click(screen.getByText("Weeks, multiple-session ordering and race placeholders")); expect(screen.getByText(/1\. s_easy_30; 2\. str_int_40/)).toBeInTheDocument(); await user.click(screen.getByRole("button", { name: "Create user-owned research draft" })); expect(clone).toHaveBeenCalledOnce(); expect(await axe(container)).toHaveNoViolations(); });
});
