import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/App.tsx', 'utf8');

content = content.replace(/import exercisesData from "\.\/fixtures\/exercises\.json";\n/g, '');
content = content.replace(/import workoutsData from "\.\/fixtures\/workouts\.json";\n/g, '');
content = content.replace(/import plansData from "\.\/fixtures\/plans\.json";\n/g, '');
content = content.replace(/import protocolsData from "\.\/fixtures\/protocols\.json";\n/g, '');

content = content.replace(
  /function Dashboard\(\) \{/g, 
  `import { draftRepository } from "./repositories/DraftRepository";
import { catalogueRepository } from "./repositories/FirebaseCatalogueRepository";
import { entitlementRepository } from "./repositories/FirebaseEntitlementRepository";
import { Entitlement } from "./domain/entitlement";
import { Workout, Plan, Protocol } from "./domain/types";
import { Exercise } from "./domain/catalogue";

function Dashboard({ identity }: { identity: HumanIdentity }) {
  const [workoutsCount, setWorkoutsCount] = useState(0);
  const [plansCount, setPlansCount] = useState(0);
  useEffect(() => {
    draftRepository.listWorkoutDrafts(identity.humanUserId).then(d => setWorkoutsCount(d.length));
    draftRepository.listPlanDrafts(identity.humanUserId).then(d => setPlansCount(d.length));
  }, [identity.humanUserId]);`
);
content = content.replace(/\{workoutsData\.length\}/g, '{workoutsCount}');
content = content.replace(/\{plansData\.length\}/g, '{plansCount}');

content = content.replace(
  /function WorkoutsList\(\) \{/g, 
  `function WorkoutsList({ identity }: { identity: HumanIdentity }) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  useEffect(() => {
    draftRepository.listWorkoutDrafts(identity.humanUserId).then(setWorkouts);
  }, [identity.humanUserId]);`
);
content = content.replace(/workoutsData\.map/g, 'workouts.map');

content = content.replace(
  /function PlansList\(\) \{/g, 
  `function PlansList({ identity }: { identity: HumanIdentity }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    draftRepository.listPlanDrafts(identity.humanUserId).then(setPlans);
  }, [identity.humanUserId]);`
);
content = content.replace(/plansData\.map/g, 'plans.map');

content = content.replace(
  /function ExerciseLibrary\(\) \{/g, 
  `function ExerciseLibrary() {
  const [exercisesData, setExercises] = useState<Exercise[]>([]);
  useEffect(() => {
    catalogueRepository.getExercises().then(setExercises);
  }, []);`
);

content = content.replace(
  /function ProtocolLibrary\(\) \{/g, 
  `function ProtocolLibrary({ identity }: { identity: HumanIdentity }) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  useEffect(() => {
    draftRepository.listProtocolDrafts(identity.humanUserId).then(setProtocols);
  }, [identity.humanUserId]);`
);
content = content.replace(/protocolsData\.filter/g, 'protocols.filter');

content = content.replace(/<Dashboard \/>/g, '<Dashboard identity={identity} />');
content = content.replace(/<WorkoutsList \/>/g, '<WorkoutsList identity={identity} />');
content = content.replace(/<PlansList \/>/g, '<PlansList identity={identity} />');
content = content.replace(/<ProtocolLibrary \/>/g, '<ProtocolLibrary identity={identity} />');

content = content.replace(
  /function AccountSettings\(\{ identity \}: \{ identity: HumanIdentity \}\) \{/g, 
  `function AccountSettings({ identity }: { identity: HumanIdentity }) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  useEffect(() => {
    return entitlementRepository.onEntitlementChanged(identity.humanUserId, setEntitlement);
  }, [identity.humanUserId]);`
);
content = content.replace(
  /<div>\{identity\.email\}<\/div>\s*<\/div>/g, 
  `<div>{identity.email}</div>
        </div>
        <div className="mb-4">
          <div className="text-sm text-hv-text-muted">Entitlement</div>
          <div>{entitlement ? entitlement.state : "LOADING..."}</div>
        </div>`
);

writeFileSync('src/App.tsx', content);
