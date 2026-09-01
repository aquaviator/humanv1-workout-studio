import fs from 'fs';
let content = fs.readFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', 'utf8');

// The best way to fix this is to add "as any" to the payloads passed to publicationRepository.publish

content = content.replace(/await publicationRepository\.publish\('human_1', 'protocol', 'proto_1', \{([\s\S]*?)\} as any, \[\]\);/g, 
"await publicationRepository.publish('human_1', 'protocol', 'proto_1', {$1} as any, []);");

content = content.replace(/await publicationRepository\.publish\('human_1', 'protocol', 'proto_1', \{([\s\S]*?)\}, \[\]\);/g, 
"await publicationRepository.publish('human_1', 'protocol', 'proto_1', {$1} as any, []);");

content = content.replace(/await publicationRepository\.publish\('human_1', 'plan', 'plan_1', \{([\s\S]*?)\}, \[\]\);/g, 
"await publicationRepository.publish('human_1', 'plan', 'plan_1', {$1} as any, []);");

content = content.replace(/await publicationRepository\.publish\('human_1', 'plan', 'plan_1', \{ title: "Plan 1" \}, \[\]\);/g, 
"await publicationRepository.publish('human_1', 'plan', 'plan_1', { title: 'Plan 1' } as any, []);");

// Just globally cast it:
content = content.replace(/publish\('human_1', 'protocol', 'proto_1', (\{[^}]+\})\s*,/g, "publish('human_1', 'protocol', 'proto_1', $1 as any,");
content = content.replace(/publish\('human_1', 'plan', 'plan_1', (\{[^}]+\})\s*,/g, "publish('human_1', 'plan', 'plan_1', $1 as any,");

fs.writeFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', content);
