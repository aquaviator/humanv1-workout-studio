const fs = require('fs');
const file = 'src/ui/pages/__tests__/WorkoutBuilder.test.tsx';
let c = fs.readFileSync(file, 'utf8');

const testToAdd = `
  it('saves, reopens, and idempotently maintains the workout ID', async () => {
    const { draftRepository } = await import('../../../repositories/DraftRepository');
    const workoutId = 'test-reopen-id';
    const mockDraft = {
      workoutId,
      schemaVersion: 'humanv1.workout/1',
      title: 'Reopened Workout',
      discipline: 'STRENGTH',
      catalogueReleaseId: 'v1',
      tags: [],
      blocks: [{ blockId: 'test-block', type: 'EXERCISE', exerciseId: 'plank', exerciseNameSnapshot: 'Plank', efforts: [{ effortId: 'eff-1', effortType: 'TIMED', prescriptions: [{ prescriptionId: 'p1', metricKey: 'duration', targetValue: 60, canonicalUnit: 's', position: 0 }] }] }]
    };
    await draftRepository.saveWorkoutDraft(mockIdentity.humanUserId, mockDraft);

    render(
      <MemoryRouter initialEntries={['/workouts/' + workoutId]}>
        <Routes>
          <Route path="/workouts/:workoutId" element={<WorkoutBuilder identity={mockIdentity} />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Reopened Workout')).toBeInTheDocument();
    });

    const titleInput = screen.getByDisplayValue('Reopened Workout');
    fireEvent.change(titleInput, { target: { value: 'Modified Title' } });

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    }, { timeout: 3000 });

    const savedDraft = await draftRepository.getWorkoutDraft(mockIdentity.humanUserId, workoutId);
    expect(savedDraft).not.toBeNull();
    expect(savedDraft?.title).toBe('Modified Title');
    expect(savedDraft?.workoutId).toBe(workoutId);
  });
`;

c = c.replace(/  \}\);\n\}\);/, "  });\n" + testToAdd + "\n});\n");
fs.writeFileSync(file, c);
