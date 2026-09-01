import fs from 'fs';

let content = fs.readFileSync('src/ui/pages/ProtocolBuilder.tsx', 'utf8');

const imports = `import { useState, useMemo, useEffect } from "react";\nimport { syncManager, SyncRecord } from "../../repositories/SyncManager";`;
content = content.replace(/import \{ useState, useMemo, useEffect \} from "react";/, imports);

content = content.replace(/const \[publishStatus, setPublishStatus\] = useState<string>\(""\);/, `
  const [syncRecord, setSyncRecord] = useState<SyncRecord | null>(null);
  const [publishStatus, setPublishStatus] = useState<string>("");

  useEffect(() => {
    if (!protocol.protocolId) return;
    const fetchStatus = async () => {
      const records = await syncManager.listPublicationSyncRecords(identity.humanUserId, 'protocol');
      const record = records.find(r => r.envelope.sourceDraftId === protocol.protocolId);
      setSyncRecord(record || null);
    };
    fetchStatus();
    return syncManager.subscribe(fetchStatus);
  }, [protocol.protocolId, identity.humanUserId]);
  
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
      let time = 0;
      const compiledTimeline: any[] = [];
      for (const seg of protocol.segments) {
        for (let i = 0; i < seg.repeatCount; i++) {
           compiledTimeline.push({
             startTimeOffset: time,
             durationSeconds: seg.durationSeconds,
             phase: seg.phase,
             exerciseSlotCount: seg.exerciseSlotCount
           });
           time += seg.durationSeconds;
        }
      }
      await publicationRepository.publish(identity.humanUserId, 'protocol', protocol.protocolId, protocol, protocol.suitability, compiledTimeline);
      setIsPublishModalOpen(false);
      setPublishStatus("");
    } catch (e: any) {
      setPublishStatus("Error: " + e.message);
    }
  };
`;

content = content.replace(/const handlePublish = async \(\) => \{[\s\S]*?\};/, handlePublishNew);

content = content.replace(/\{publishStatus && <p className="mb-4 text-hv-primary">\{publishStatus\}<\/p>\}/, 
`            {displayPublishStatus && displayPublishStatus !== "Ready" && <p className="mb-4 text-hv-primary">{displayPublishStatus}</p>}`);

fs.writeFileSync('src/ui/pages/ProtocolBuilder.tsx', content);
