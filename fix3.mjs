import fs from 'fs';
const file = 'src/ui/pages/__tests__/WorkoutBuilder.test.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/    const tread = \(await screen.findAllByText\('Treadmill Run'\)\)\[0\];\n    fireEvent.click\(tread\);\n\n    await waitFor\(\(\) => expect\(screen.getByLabelText\('Move Treadmill Run up'\)\).toBeEnabled\(\)\);/g,
  `    const tread = (await screen.findAllByText('Treadmill Run'))[0];
    fireEvent.click(tread);

    await waitFor(() => expect(screen.getAllByText('Treadmill Run').length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getByLabelText('Move Treadmill Run up')).toBeEnabled());`);

fs.writeFileSync(file, c);
