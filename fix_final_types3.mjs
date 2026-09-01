import fs from 'fs';
let content = fs.readFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', 'utf8');

content = content.replace(/phase: "WORK", targets: \[\] as any, exerciseSlotCount: 0, instructions: "" \}\]/g, 'phase: "WORK" as any, targets: [] as any, exerciseSlotCount: 0, instructions: "" }]');

content = content.replace(/await publicationRepository\.publish\('human_1', 'plan', 'plan_1', \{ title: "Plan 1" \}/g, "await publicationRepository.publish('human_1', 'plan', 'plan_1', { title: 'Plan 1' } as any");
content = content.replace(/await publicationRepository\.publish\('human_1', 'plan', 'plan_1', \{ title: 'Plan 1' \}/g, "await publicationRepository.publish('human_1', 'plan', 'plan_1', { title: 'Plan 1' } as any");


fs.writeFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', content);
