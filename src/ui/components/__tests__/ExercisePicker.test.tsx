import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExercisePicker } from '../ExercisePicker';
import { expect, test, vi } from 'vitest';

const mockExercises = [
  {
    exerciseId: "ex1",
    name: "Bench Press",
    aliases: ["Barbell Bench Press"],
    category: "Strength",
    equipment: ["Barbell"],
    muscleArea: ["Chest"],
    movementPattern: ["Horizontal Push"]
  },
  {
    exerciseId: "ex2",
    name: "Plank",
    aliases: ["Forearm Plank"],
    category: "Mobility",
    equipment: ["Bodyweight"],
    muscleArea: ["Core"],
    movementPattern: ["Core Isometric"]
  },
  {
    exerciseId: "ex3",
    name: "Développé Couché", // Testing accents
    aliases: [],
    category: "Strength",
    equipment: ["Barbell"],
    muscleArea: ["Chest"],
    movementPattern: ["Horizontal Push"]
  },
  {
    exerciseId: "ex4",
    name: "pull up", // Testing case
    aliases: ["chin-up"], // Testing punctuation
    category: "Strength",
    equipment: ["Bodyweight"],
    muscleArea: ["Back"],
    movementPattern: ["Vertical Pull"]
  }
];

const largeMockExercises = Array.from({ length: 150 }).map((_, i) => ({
  exerciseId: `large_ex_${i}`,
  name: `Dummy Exercise ${i}`,
  category: "Strength",
  equipment: ["Dumbbell"]
}));

test('search normalization (case, accents, punctuation)', async () => {
  const onSelect = vi.fn();
  render(<ExercisePicker exercises={mockExercises as any} onSelect={onSelect} onClose={() => {}} />);
  
  const searchInput = screen.getByPlaceholderText(/Search exercises/i);
  
  // Test case insensitivity and punctuation
  await userEvent.type(searchInput, 'CHIN UP');
  expect(screen.getByText('pull up')).toBeInTheDocument();
  expect(screen.queryByText('Bench Press')).not.toBeInTheDocument();
  
  await userEvent.clear(searchInput);
  
  // Test accents
  await userEvent.type(searchInput, 'developpe');
  expect(screen.getByText('Développé Couché')).toBeInTheDocument();
  expect(screen.queryByText('Bench Press')).not.toBeInTheDocument();
});

test('filter semantics (OR within group, AND between groups)', async () => {
  const onSelect = vi.fn();
  render(<ExercisePicker exercises={mockExercises as any} onSelect={onSelect} onClose={() => {}} />);
  
  // Click category 'Strength' -> Should show ex1, ex3, ex4
  fireEvent.click(screen.getByRole('button', { name: 'Strength' }));
  expect(screen.getByText('Bench Press')).toBeInTheDocument();
  expect(screen.getByText('pull up')).toBeInTheDocument();
  expect(screen.queryByText('Plank')).not.toBeInTheDocument();
  
  // Click category 'Mobility' -> Should show ex1, ex2, ex3, ex4 (OR within category)
  fireEvent.click(screen.getByRole('button', { name: 'Mobility' }));
  expect(screen.getByText('Plank')).toBeInTheDocument();
  
  // Expand advanced
  fireEvent.click(screen.getByText(/Filters/));
  
  // Click equipment 'Bodyweight' -> Should show Plank and Pull up (AND between groups)
  fireEvent.click(screen.getAllByRole('button', { name: 'Bodyweight' })[0]); 
  expect(screen.queryByText('Bench Press')).not.toBeInTheDocument();
  expect(screen.getByText('Plank')).toBeInTheDocument();
  expect(screen.getByText('pull up')).toBeInTheDocument();
});

test('empty-state recovery', async () => {
  const onSelect = vi.fn();
  render(<ExercisePicker exercises={mockExercises as any} onSelect={onSelect} onClose={() => {}} />);
  
  const searchInput = screen.getByPlaceholderText(/Search exercises/i);
  await userEvent.type(searchInput, 'NonExistentExercisexyz');
  
  expect(screen.getByText(/No exercises found/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Clear all filters/i })).toBeInTheDocument();
  
  fireEvent.click(screen.getByRole('button', { name: /Clear all filters/i }));
  expect(screen.getByText('Bench Press')).toBeInTheDocument();
  expect(searchInput).toHaveValue('');
});

test('large catalogues render efficiently via slicing', async () => {
  const onSelect = vi.fn();
  render(<ExercisePicker exercises={largeMockExercises as any} onSelect={onSelect} onClose={() => {}} />);
  
  // Default visible count is 20
  expect(screen.getAllByText(/Dummy Exercise/).length).toBe(20);
});

test('keyboard operation for add action', async () => {
  const onSelect = vi.fn();
  render(<ExercisePicker exercises={mockExercises as any} onSelect={onSelect} onClose={() => {}} />);
  
  const addBtn = screen.getByRole('button', { name: /Bench Press/i });
  addBtn.focus();
  await userEvent.keyboard('{Enter}');
  
  expect(onSelect).toHaveBeenCalledWith('ex1', 'Bench Press');
});
