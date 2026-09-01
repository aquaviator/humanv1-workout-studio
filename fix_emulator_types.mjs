import fs from 'fs';
let content = fs.readFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', 'utf8');

content = content.replace(/\{(\s+)protocolId: "proto_1",(\s+)title: "My Proto",/g, '{ schemaVersion: "humanv1.protocol/1" as any, summary: "" as any, protocolType: "HIIT" as any, status: "DRAFT" as any, description: "" as any,$1protocolId: "proto_1",$2title: "My Proto",');

content = content.replace(/\{(\s+)planId: "plan_1",(\s+)weeks:/g, '{ schemaVersion: "humanv1.plan/1" as any, description: "" as any, title: "Plan" as any,$1planId: "plan_1",$2weeks:');

content = content.replace(/\{(\s+)title: "Plan 1"(\s+)\}/g, '{ schemaVersion: "humanv1.plan/1" as any, planId: "plan_1" as any, description: "" as any, weeks: [] as any,$1title: "Plan 1"$2}');

fs.writeFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', content);
