import fs from 'fs';
const file = 'src/domain/validation/workoutValidation.ts';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/function checkExerciseBlock\(\n  block: ExerciseBlock,\n  parentBlockId: string,\n  errors: ValidationError\[\],\n  catalogue: Exercise\[\],\n  checkId: \(id: string, ctx: string\) => void\n\) \{\n  checkId\(block.blockId, "EXERCISE"\);/g,
  `function checkExerciseBlock(
  block: ExerciseBlock,
  parentBlockId: string,
  errors: ValidationError[],
  catalogue: Exercise[],
  checkId: (id: string, ctx: string) => void
) {
  if (parentBlockId !== block.blockId) {
    checkId(block.blockId, "EXERCISE");
  }`);

fs.writeFileSync(file, c);
