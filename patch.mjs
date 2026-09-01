import fs from 'fs';
const file = 'src/ui/pages/WorkoutBuilder.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/    if \(validationErrors\.length > 0\) \{\n      setSaveStatus\("Unsaved"\);\n      return;\n    \}/g,
  `    if (validationErrors.length > 0) {
      console.log('VALIDATION ERRORS LENGTH:', validationErrors.length);
      console.log(JSON.stringify(validationErrors, null, 2));
      setSaveStatus("Unsaved");
      return;
    }`);

fs.writeFileSync(file, c);
