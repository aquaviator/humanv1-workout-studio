import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/ui/pages/__tests__/Acceptance.test.tsx', 'utf8');

// Insert a beforeAll or beforeEach to seed the draft repository.
content = `
import { draftRepository } from '../../../repositories/DraftRepository';
import workoutsData from '../../../fixtures/workouts.json';
import plansData from '../../../fixtures/plans.json';
import protocolsData from '../../../fixtures/protocols.json';

${content}
`;

content = content.replace(
  /beforeEach\(\(\) => \{/g,
  `beforeEach(async () => {
    // Seed draft repo with fixtures for tests
    await Promise.all(workoutsData.map((w: any) => draftRepository.saveWorkoutDraft('human_1', w)));
    await Promise.all(plansData.map((p: any) => draftRepository.savePlanDraft('human_1', p)));
    await Promise.all(protocolsData.map((p: any) => draftRepository.saveProtocolDraft('human_1', p)));`
);

writeFileSync('src/ui/pages/__tests__/Acceptance.test.tsx', content);
