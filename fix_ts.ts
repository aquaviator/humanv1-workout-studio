import { readFileSync, writeFileSync } from 'fs';

let fb = readFileSync('src/config/firebase.ts', 'utf8');
fb = fb.replace("connectFirestoreEmulator(db, env.emulator.firestoreHost);", "const [host, port] = env.emulator.firestoreHost.split(':');\n  connectFirestoreEmulator(db, host, parseInt(port, 10));");
writeFileSync('src/config/firebase.ts', fb);

let cat = readFileSync('src/domain/catalogue.ts', 'utf8');
if (!cat.includes('metricProfile')) {
  cat = cat.replace('aliases: string[];', 'aliases: string[];\n  metricProfile?: any;');
  writeFileSync('src/domain/catalogue.ts', cat);
}

let pb = readFileSync('src/ui/pages/PlanBuilder.tsx', 'utf8');
pb = pb.replace(/import \{ draftRepository \} from "\.\.\/\.\.\/repositories\/DraftRepository";\nimport \{ draftRepository \}/g, 'import { draftRepository }');
pb = pb.replace(/plansData/g, '[]');
writeFileSync('src/ui/pages/PlanBuilder.tsx', pb);
