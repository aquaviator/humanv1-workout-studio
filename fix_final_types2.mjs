import fs from 'fs';
let content = fs.readFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', 'utf8');

content = content.replace(/segments: \[\{ segmentId: "s1", repeatCount: 2, durationSeconds: 30, phase: "WORK" \}\]/g, 'segments: [{ segmentId: "s1", repeatCount: 2, durationSeconds: 30, phase: "WORK", targets: [] as any, exerciseSlotCount: 0, instructions: "" }]');

content = content.replace(/\{ title: 'Plan 1' \}/g, "{ title: 'Plan 1' } as any");

fs.writeFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', content);
