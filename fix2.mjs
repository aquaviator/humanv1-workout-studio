import fs from 'fs';
const file = 'src/ui/pages/__tests__/WorkoutBuilder.test.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/  it\('adds, reorders and removes exercises inside a superset', async \(\) => \{[\s\S]*?expect\(screen\.queryByLabelText\('Remove Bench Press from superset'\)\)\.not\.toBeInTheDocument\(\);\n  \}\);/g,
  `  it('adds, reorders and removes exercises inside a superset', async () => {
    render(<MemoryRouter><WorkoutBuilder identity={mockIdentity} /></MemoryRouter>);
    fireEvent.click(screen.getByText('Add Superset'));
    fireEvent.click(screen.getByText('Add exercise to superset'));
    
    const bench = (await screen.findAllByText('Bench Press'))[0];
    fireEvent.click(bench);
    await waitFor(() => expect(screen.getAllByText('Bench Press').length).toBeGreaterThan(1));
    
    fireEvent.click(screen.getByText('Add exercise to superset'));
    const tread = (await screen.findAllByText('Treadmill Run'))[0];
    fireEvent.click(tread);

    await waitFor(() => expect(screen.getAllByText('Treadmill Run').length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getByLabelText('Move Treadmill Run up')).toBeEnabled());
    fireEvent.click(screen.getByLabelText('Move Treadmill Run up'));
    fireEvent.click(screen.getByLabelText('Remove Bench Press from superset'));
    expect(screen.queryByLabelText('Remove Bench Press from superset')).not.toBeInTheDocument();
  });`);

fs.writeFileSync(file, c);
