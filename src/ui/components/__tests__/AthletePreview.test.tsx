import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Workout } from "../../../domain/types";
import { AthletePreview } from "../AthletePreview";

const workout: Workout = {
  schemaVersion: "humanv1.workout/1",
  workoutId: "workout-preview",
  title: "Preview workout",
  discipline: "STRENGTH",
  catalogueReleaseId: "release-1",
  tags: [],
  blocks: [],
};

describe("AthletePreview narrative", () => {
  it("shows athlete-facing description and purpose without internal provenance", () => {
    render(<AthletePreview workout={{ ...workout, description: "A complete session.", purpose: "Develop durable strength.", draftOrigin: "GOVERNED_IMPORT" }} catalogue={[]} />);
    expect(screen.getByText("A complete session.")).toBeInTheDocument();
    expect(screen.getByText(/Develop durable strength/)).toBeInTheDocument();
    expect(screen.queryByText("GOVERNED_IMPORT")).not.toBeInTheDocument();
  });

  it("reports legacy missing narrative honestly", () => {
    render(<AthletePreview workout={workout} catalogue={[]} />);
    expect(screen.getByText("Description unavailable.")).toBeInTheDocument();
    expect(screen.getByText(/Not recorded/)).toBeInTheDocument();
  });
});
