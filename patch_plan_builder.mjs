import fs from 'fs';

let content = fs.readFileSync('src/ui/pages/PlanBuilder.tsx', 'utf8');

const imports = `import { useState, useMemo, useEffect } from "react";\nimport { syncManager, SyncRecord } from "../../repositories/SyncManager";`;
content = content.replace(/import \{ useState, useMemo, useEffect \} from "react";/, imports);

content = content.replace(/const \[publishStatus, setPublishStatus\] = useState<string>\(""\);/, `
  const [syncRecord, setSyncRecord] = useState<SyncRecord | null>(null);
  const [draftDependencies, setDraftDependencies] = useState<any[]>([]);
  const [publishStatus, setPublishStatus] = useState<string>("");

  useEffect(() => {
    if (!plan.planId) return;
    const fetchStatus = async () => {
      const records = await syncManager.listPublicationSyncRecords(identity.humanUserId, 'plan');
      const record = records.find(r => r.envelope.sourceDraftId === plan.planId);
      setSyncRecord(record || null);
    };
    fetchStatus();
    return syncManager.subscribe(fetchStatus);
  }, [plan.planId, identity.humanUserId]);
  
  const displayPublishStatus = useMemo(() => {
    if (publishStatus) return publishStatus;
    if (!syncRecord) return "Ready";
    switch (syncRecord.status) {
      case 'QUEUED': return "Queued—will send when connected";
      case 'SENDING': return "Sending";
      case 'SYNCED': return "Available in your apps";
      case 'CONFLICT': return "Conflict";
      case 'FAILED': return "Retry required";
      default: return "";
    }
  }, [syncRecord, publishStatus]);
`);

const handlePublishNew = `const handlePublish = async () => {
    try {
      setPublishStatus("Publishing...");
      
      const newPlan = JSON.parse(JSON.stringify(plan));
      
      for (const week of newPlan.weeks) {
         for (const placement of week.placements) {
             const workout = availableWorkouts.find(w => w.workoutId === placement.workoutId);
             if (!workout) throw new Error(\`Missing workout reference\`);
             const pubs = await publicationRepository.listPublishedVersions(identity.humanUserId, 'workout', workout.workoutId);
             
             let pub = pubs[0];
             if (!pub || pub.publicationState === 'TOMBSTONED') {
                 pub = await publicationRepository.publish(identity.humanUserId, 'workout', workout.workoutId, workout, [workout.discipline]);
             }
             placement.versionId = pub.versionId;
         }
      }
      
      await publicationRepository.publish(identity.humanUserId, 'plan', newPlan.planId, newPlan, ['PLAN']);
      setIsPublishModalOpen(false);
      setPublishStatus("");
    } catch (e: any) {
      setPublishStatus("Error: " + e.message);
    }
  };

  const handleOpenPublish = async () => {
      const deps: any[] = [];
      for (const week of plan.weeks) {
         for (const placement of week.placements) {
             const workout = availableWorkouts.find(w => w.workoutId === placement.workoutId);
             if (workout) {
                 const pubs = await publicationRepository.listPublishedVersions(identity.humanUserId, 'workout', workout.workoutId);
                 if (pubs.length === 0 || pubs[0].publicationState === 'TOMBSTONED') {
                     if (!deps.find(d => d.workoutId === workout.workoutId)) deps.push(workout);
                 }
             }
         }
      }
      setDraftDependencies(deps);
      setIsPublishModalOpen(true);
  };
`;

content = content.replace(/const handlePublish = async \(\) => \{[\s\S]*?\};/, handlePublishNew);

content = content.replace(/onClick=\{handlePublish\}/, `onClick={handleOpenPublish}`);
content = content.replace(/onClick=\{\(\) => setIsPublishModalOpen\(true\)\}/g, `onClick={handleOpenPublish}`);

content = content.replace(/<p><span className="font-semibold text-hv-text">Weeks:<\/span> \{plan.weeks.length\}<\/p>\s*<p><span className="font-semibold text-hv-text">Placements:<\/span> \{plan.weeks.reduce\(\(acc, w\) => acc \+ w.placements.length, 0\)\}<\/p>/, 
`              <p><span className="font-semibold text-hv-text">Weeks:</span> {plan.weeks.length}</p>
              <p><span className="font-semibold text-hv-text">Placements:</span> {plan.weeks.reduce((acc, w) => acc + w.placements.length, 0)}</p>
              {draftDependencies.length > 0 && (
                  <div className="mt-4">
                      <p className="font-semibold text-hv-text">Workouts that will be published automatically:</p>
                      <ul className="list-disc pl-5">
                          {draftDependencies.map(d => <li key={d.workoutId}>{d.title}</li>)}
                      </ul>
                  </div>
              )}`);
              
content = content.replace(/\{publishStatus && <p className="mb-4 text-hv-primary">\{publishStatus\}<\/p>\}/, 
`            {displayPublishStatus && displayPublishStatus !== "Ready" && <p className="mb-4 text-hv-primary">{displayPublishStatus}</p>}`);

fs.writeFileSync('src/ui/pages/PlanBuilder.tsx', content);
