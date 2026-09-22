import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StarterPackCard } from "../StarterPackCard";

const mocks = vi.hoisted(() => ({ importPack: vi.fn(), readOnly: false }));
vi.mock("../../../repositories/StarterPackImportRepository", () => ({ starterPackImportRepository: {
  preview: () => ({ packId: "pack-1", name: "Recreational Multi-Sport Starter Pack", description: "Eight editable workouts.", intendedAudience: "Recreational athletes.", workoutNames: ["A","B","C","D","E","F","G","H"], workoutCount: 8, planName: "Ten weeks", weekCount: 10, placementCount: 57, disciplines: ["BIKE","RUN","STRENGTH"] }),
  operationState: vi.fn(async () => undefined), import: mocks.importPack,
} }));
vi.mock("../AcceptanceModeProvider", () => ({ useAcceptanceMode: () => ({ isReadOnlyAcceptance: mocks.readOnly, internalUrl: (value: string) => value }) }));
const identity = { firebaseUid: "uid", humanUserId: "human-owner", email: "athlete@example.com", displayName: "Athlete" } as any;

describe("StarterPackCard", () => {
  beforeEach(() => { mocks.readOnly = false; mocks.importPack.mockReset(); });
  it("previews counts and requires the exact named confirmation", () => {
    render(<StarterPackCard identity={identity}/>);
    fireEvent.click(screen.getByRole("button", { name: "Preview Starter Pack" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("8");
    expect(dialog).toHaveTextContent("10 weeks");
    const add = within(dialog).getByRole("button", { name: "Add Starter Pack" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type ADD STARTER PACK/), { target: { value: "ADD STARTER PACK" } });
    expect(add).toBeEnabled();
  });
  it("removes confirmation and mutation actions in read-only acceptance", () => {
    mocks.readOnly = true;
    render(<StarterPackCard identity={identity}/>);
    fireEvent.click(screen.getByRole("button", { name: "Preview Starter Pack" }));
    expect(screen.queryByLabelText(/Type ADD STARTER PACK/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Starter Pack" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("cannot create or change drafts");
    expect(mocks.importPack).not.toHaveBeenCalled();
  });
});
