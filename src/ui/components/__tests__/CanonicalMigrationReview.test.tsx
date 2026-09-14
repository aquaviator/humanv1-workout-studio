import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { planNormalization } from "../../../domain/normalization";
import { CanonicalMigrationReview } from "../CanonicalMigrationReview";

describe("CanonicalMigrationReview", () => {
  it("shows preview, preservation, review states and an accessible apply action", async () => {
    const owner = "human_fixture"; const plan = planNormalization(owner, [
      { entityType: "workout", globalId: "safe", humanUserId: owner, revision: 1, schemaVersion: "humanv1.workout/1", contentClass: "LEGACY_NORMALIZABLE", payload: { schemaVersion: "humanv1.workout/1", workoutId: "safe", blocks: [{}] } },
      { entityType: "workout", globalId: "empty", humanUserId: owner, revision: 1, schemaVersion: "humanv1.workout/1", contentClass: "LEGACY_INCOMPLETE", payload: { blocks: [] } },
      { entityType: "historical", globalId: "done", humanUserId: owner, revision: 1, schemaVersion: "humanv1.workout/1", contentClass: "HISTORICAL_EXECUTION", payload: {} },
    ]); const apply = vi.fn(); const { container } = render(<CanonicalMigrationReview plan={plan} onApply={apply} onOpenGuidedEditor={() => undefined} />);
    expect(screen.getByText("Safe format upgrade available")).toBeInTheDocument(); expect(screen.getByText("Needs your input")).toBeInTheDocument(); expect(screen.getByText("Historical record preserved")).toBeInTheDocument();
    expect(screen.getByText(/Missing executable blocks/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Open guided editor" })).toBeInTheDocument();
    expect(screen.getByText("0", { selector: "dd" })).toBeInTheDocument(); screen.getByRole("button", { name: "Apply approved safe upgrades" }).click(); expect(apply).toHaveBeenCalledOnce(); expect(await axe(container)).toHaveNoViolations();
  });
});
