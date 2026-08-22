import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', 'utf8');

// Add sign in to second test
content = content.replace(
  "const entRepo = new FirebaseEntitlementRepository();",
  "await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');\n    const entRepo = new FirebaseEntitlementRepository();"
);

// Add sign in to third test
content = content.replace(
  "const draftRepo = new DraftRepository();",
  "await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');\n    const draftRepo = new DraftRepository();"
);

writeFileSync('src/repositories/__tests__/EmulatorAcceptance.test.ts', content);
