const fs = require('fs');
const file = 'src/ui/pages/__tests__/WorkoutBuilder.test.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  'blocks: []',
  `blocks: [{ blockId: 'test-block', type: 'EXERCISE', exerciseId: 'plank', exerciseNameSnapshot: 'Plank', efforts: [{ effortId: 'eff-1', effortType: 'TIMED', prescriptions: [{ prescriptionId: 'p1', metricKey: 'duration', targetValue: 60, canonicalUnit: 's', position: 0 }] }] }]`
);
fs.writeFileSync(file, content);
