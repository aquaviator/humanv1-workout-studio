import { readFileSync, writeFileSync } from 'fs';
let pb = readFileSync('src/ui/pages/PlanBuilder.tsx', 'utf8');
pb = pb.replace(/const initialPlan: Plan = \{[\s\S]*?\};/, 
`const initialPlan: Plan = {
    schemaVersion: "1",
    planId,
    title: "New Plan",
    description: "",
    weeks: [{
      weekId: uuidv4(),
      weekNumber: 1,
      label: "Week 1",
      placements: []
    }]
  };`);
writeFileSync('src/ui/pages/PlanBuilder.tsx', pb);
