import fs from 'fs';

for (const file of ['src/ui/pages/PlanBuilder.tsx', 'src/ui/pages/ProtocolBuilder.tsx', 'src/ui/pages/WorkoutBuilder.tsx']) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Fix sourceDraftId cast
    content = content.replace(/r.envelope.sourceDraftId === (plan\.planId|protocol\.protocolId|workout\.workoutId)/g, 
        '(r.envelope as PublishedEnvelope<any>).sourceDraftId === $1');
        
    // Fix subscribe return
    content = content.replace(/return syncManager\.subscribe\(fetchStatus\);/g, 
        'const unsub = syncManager.subscribe(fetchStatus); return () => { unsub(); };');

    // Remove duplicate useMemo
    content = content.replace(/import \{ useMemo \} from "react";\n/, '');
    
    // Missing PublishedEnvelope import
    if (!content.includes('PublishedEnvelope')) {
        content = content.replace(/import \{ syncManager, SyncRecord \} from "\.\.\/\.\.\/repositories\/SyncManager";/, 
        'import { syncManager, SyncRecord } from "../../repositories/SyncManager";\nimport { PublishedEnvelope } from "../../domain/publication";');
    }

    fs.writeFileSync(file, content);
}
