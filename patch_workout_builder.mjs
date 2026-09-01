import fs from 'fs';

let content = fs.readFileSync('src/ui/pages/WorkoutBuilder.tsx', 'utf8');

// replace publishStatus state string with typed sync record lookup
const imports = `import { useState, useMemo, useEffect } from "react";\nimport { syncManager, SyncRecord } from "../../repositories/SyncManager";`;
content = content.replace(/import \{ useState, useMemo, useEffect \} from "react";/, imports);

// replace publishStatus state
content = content.replace(/const \[publishStatus, setPublishStatus\] = useState\(''\);/, `const [syncRecord, setSyncRecord] = useState<SyncRecord | null>(null);
  
  useEffect(() => {
    if (!workout.workoutId) return;
    const fetchStatus = async () => {
      const records = await syncManager.listPublicationSyncRecords(identity.humanUserId, 'workout');
      const record = records.find(r => r.envelope.sourceDraftId === workout.workoutId);
      setSyncRecord(record || null);
    };
    fetchStatus();
    return syncManager.subscribe(fetchStatus);
  }, [workout.workoutId, identity.humanUserId]);
  
  const publishStatus = useMemo(() => {
    if (!syncRecord) return "Ready";
    switch (syncRecord.status) {
      case 'QUEUED': return "Queued—will send when connected";
      case 'SENDING': return "Sending";
      case 'SYNCED': return "Available in your apps";
      case 'CONFLICT': return "Conflict";
      case 'FAILED': return "Retry required";
      default: return "";
    }
  }, [syncRecord]);
`);

// replace handlePublish
const handlePublishNew = `const handlePublish = async () => {
    try {
      await publicationRepository.publish(identity.humanUserId, 'workout', workout.workoutId, workout, [workout.discipline]);
      setIsPublishModalOpen(false);
    } catch (e: any) {
      console.warn("Failed to publish", e.message);
    }
  };`;
content = content.replace(/const handlePublish = async \(\) => \{[\s\S]*?\};/, handlePublishNew);

fs.writeFileSync('src/ui/pages/WorkoutBuilder.tsx', content);
