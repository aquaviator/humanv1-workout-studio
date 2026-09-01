import fs from 'fs';

let content = `
import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { HumanIdentity } from "../../domain/identity";
import { publicationRepository } from "../../repositories/PublicationRepository";
import { PublishedEnvelope } from "../../domain/publication";
import { syncManager, SyncRecord } from "../../repositories/SyncManager";

export default function Dashboard({ identity }: { identity: HumanIdentity }) {
  const [published, setPublished] = useState<PublishedEnvelope<any>[]>([]);
  const [syncRecords, setSyncRecords] = useState<Record<string, SyncRecord>>({});

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const workouts = await publicationRepository.listPublishedVersions(identity.humanUserId, 'workout');
      const plans = await publicationRepository.listPublishedVersions(identity.humanUserId, 'plan');
      const protocols = await publicationRepository.listPublishedVersions(identity.humanUserId, 'protocol');
      
      const all = [...workouts, ...plans, ...protocols].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      
      if (mounted) setPublished(all);
      
      const wr = await syncManager.listPublicationSyncRecords(identity.humanUserId, 'workout');
      const pr = await syncManager.listPublicationSyncRecords(identity.humanUserId, 'plan');
      const tr = await syncManager.listPublicationSyncRecords(identity.humanUserId, 'protocol');
      
      const map: Record<string, SyncRecord> = {};
      [...wr, ...pr, ...tr].forEach(r => {
         map[(r.envelope as PublishedEnvelope<any>).versionId] = r;
      });
      if (mounted) setSyncRecords(map);
    };
    
    load();
    const unsub = syncManager.subscribe(load);
    return () => {
      mounted = false;
      unsub();
    };
  }, [identity.humanUserId]);

  const getStatus = (env: PublishedEnvelope<any>) => {
     const record = syncRecords[env.versionId];
     if (!record) return "Ready";
     switch (record.status) {
       case 'QUEUED': return "Queued";
       case 'SENDING': return "Sending";
       case 'SYNCED': return "Available";
       case 'CONFLICT': return "Conflict";
       case 'FAILED': return "Retry";
       default: return "";
     }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <p className="text-hv-text-muted mb-8">Welcome to your workspace, {identity.displayName}.</p>
      
      <div className="bg-hv-surface-1 border border-hv-border rounded-lg p-6">
         <h2 className="text-xl font-bold mb-4">Published Content</h2>
         {published.length === 0 ? (
           <p className="text-hv-text-muted text-sm">You have not published any content yet.</p>
         ) : (
           <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="border-b border-hv-border text-sm text-hv-text-muted uppercase tracking-wider">
                   <th className="py-2 px-3 font-semibold">Name</th>
                   <th className="py-2 px-3 font-semibold">Type</th>
                   <th className="py-2 px-3 font-semibold">Revision</th>
                   <th className="py-2 px-3 font-semibold">Tags</th>
                   <th className="py-2 px-3 font-semibold">Status</th>
                 </tr>
               </thead>
               <tbody className="text-sm">
                 {published.map(pub => (
                    <tr key={pub.versionId} className="border-b border-hv-border last:border-0 hover:bg-hv-surface-2">
                       <td className="py-3 px-3 font-medium">{pub.payload.title || 'Untitled'}</td>
                       <td className="py-3 px-3 capitalize">{pub.contentType}</td>
                       <td className="py-3 px-3">{pub.revision}</td>
                       <td className="py-3 px-3 text-hv-text-muted">{(pub.compatibleTags || []).join(', ')}</td>
                       <td className="py-3 px-3">
                         <span className={\`px-2 py-1 rounded text-xs font-medium \${getStatus(pub) === 'Available' ? 'bg-hv-primary/20 text-hv-primary' : 'bg-hv-surface-2'}\`}>
                           {getStatus(pub)}
                         </span>
                       </td>
                    </tr>
                 ))}
               </tbody>
             </table>
           </div>
         )}
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/ui/pages/Dashboard.tsx', content);
