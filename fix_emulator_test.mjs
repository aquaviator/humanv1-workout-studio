import fs from 'fs';

let content = fs.readFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', 'utf8');

// Fix schemaVersion number to string
content = content.replace(/schemaVersion: 1,/g, 'schemaVersion: "humanv1.workout/1",');

// Fix missing properties in mock protocols/plans
content = content.replace(/\{ protocolId: "protocol1", title: "Intervals", segments: \[\] \}/g, '{ schemaVersion: "humanv1.protocol/1", protocolId: "protocol1", title: "Intervals", description: "", summary: "", protocolType: "HIIT", status: "DRAFT", segments: [] } as any');

content = content.replace(/\{ planId: "plan1", weeks: \[ \{ weekId: "w1", placements: \[ \{ placementId: "p1", workoutId: "test_wk1", workoutVersionId: "wk1_v1" \} \] \} \] \}/g, '{ schemaVersion: "humanv1.plan/1", planId: "plan1", title: "Plan", description: "", weeks: [ { weekId: "w1", placements: [ { placementId: "p1", workoutId: "test_wk1", workoutVersionId: "wk1_v1" } as any ] } ] } as any');

content = content.replace(/\{ title: "Plan 1" \}/g, '{ schemaVersion: "humanv1.plan/1", planId: "plan1", title: "Plan 1", description: "", weeks: [] } as any');

content = content.replace(/\{ protocolId: "protocol1", title: "Intervals", segments: \[[\s\S]*?\] \}/g, function(match) {
    if (match.includes('as any')) return match;
    return match.replace(/\{ protocolId: "protocol1"/, '{ schemaVersion: "humanv1.protocol/1", protocolId: "protocol1", summary: "", protocolType: "HIIT", status: "DRAFT", description: "",') + ' as any';
});

fs.writeFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', content);
