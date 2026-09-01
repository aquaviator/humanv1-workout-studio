import fs from 'fs';
let content = fs.readFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', 'utf8');

content = content.replace(/\{(\s+)schemaVersion: "humanv1\.protocol\/1" as any,(\s+)summary: "" as any,(\s+)protocolType: "HIIT" as any,(\s+)status: "DRAFT" as any,(\s+)description: "" as any,(\s+)protocolId/g, '{ schemaVersion: "humanv1.protocol/1" as any, summary: "" as any, protocolType: "HIIT" as any, status: "DRAFT" as any, description: "" as any, suitability: [] as any, equipmentCapabilityKeys: [] as any, evidence: [] as any,$1protocolId');

content = content.replace(/\{(\s+)weekId: "w1",(\s+)placements/g, '{ weekNumber: 1 as any, label: "W1" as any,$1weekId: "w1",$2placements');

content = content.replace(/\{ title: "Plan 1" \}/g, '{ schemaVersion: "humanv1.plan/1" as any, planId: "plan_1" as any, description: "" as any, weeks: [] as any, title: "Plan 1" }');

fs.writeFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', content);
