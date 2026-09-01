import fs from 'fs';
const file = 'src/ui/pages/__tests__/WorkoutBuilder.test.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/import \{ MemoryRouter, Routes, Route \} from 'react-router';\nimport \{ MemoryRouter \} from 'react-router';/g, "import { MemoryRouter, Routes, Route } from 'react-router';");

fs.writeFileSync(file, c);
