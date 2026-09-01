import fs from 'fs';
const file = 'src/ui/pages/WorkoutBuilder.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/      console\.log\('VALIDATION ERRORS LENGTH:', validationErrors\.length\);\n      console\.log\(JSON\.stringify\(validationErrors, null, 2\)\);\n/g, "");

fs.writeFileSync(file, c);
