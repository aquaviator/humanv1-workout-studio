import { readFileSync, writeFileSync } from 'fs';

// WorkoutBuilder.tsx
let wb = readFileSync('src/ui/pages/WorkoutBuilder.tsx', 'utf8');
wb = wb.replace(/import exercisesData from "\.\.\/\.\.\/fixtures\/exercises\.json";\n/g, 
`import { catalogueRepository } from "../../repositories/FirebaseCatalogueRepository";
import { Exercise } from "../../domain/catalogue";\n`);
wb = wb.replace(/export default function WorkoutBuilder\(\{ identity \}: \{ identity: HumanIdentity \}\) \{/,
`export default function WorkoutBuilder({ identity }: { identity: HumanIdentity }) {
  const [exercisesData, setExercisesData] = React.useState<Exercise[]>([]);
  React.useEffect(() => { catalogueRepository.getExercises().then(setExercisesData); }, []);`);
writeFileSync('src/ui/pages/WorkoutBuilder.tsx', wb);

// PlanBuilder.tsx
let pb = readFileSync('src/ui/pages/PlanBuilder.tsx', 'utf8');
pb = pb.replace(/import plansData from "\.\.\/\.\.\/fixtures\/plans\.json";\n/g, '');
pb = pb.replace(/import workoutsData from "\.\.\/\.\.\/fixtures\/workouts\.json";\n/g, 
`import { draftRepository } from "../../repositories/DraftRepository";
import { Workout } from "../../domain/types";\n`);
pb = pb.replace(/export default function PlanBuilder\(\{ identity \}: \{ identity: HumanIdentity \}\) \{/,
`export default function PlanBuilder({ identity }: { identity: HumanIdentity }) {
  const [workoutsData, setWorkoutsData] = React.useState<Workout[]>([]);
  React.useEffect(() => { draftRepository.listWorkoutDrafts(identity.humanUserId).then(setWorkoutsData); }, [identity.humanUserId]);`);
writeFileSync('src/ui/pages/PlanBuilder.tsx', pb);
