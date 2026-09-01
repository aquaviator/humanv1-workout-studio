import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const contract = JSON.parse(await readFile(resolve(root, 'firestore.rules.contract.json'), 'utf8'));
const normalizedHash = buffer => createHash('sha256')
  .update(buffer.toString('utf8').replace(/\r\n/g, '\n'))
  .digest('hex');
const localRules = await readFile(resolve(root, 'firestore.rules'));
const localHash = normalizedHash(localRules);

if (localHash !== contract.sha256) {
  throw new Error(`Workout Studio rules diverged from ${contract.ownerRepository}: expected ${contract.sha256}, received ${localHash}`);
}

if (process.env.HV1_SHARED_RULES_PATH) {
  const ownerRules = await readFile(resolve(process.env.HV1_SHARED_RULES_PATH));
  const ownerHash = normalizedHash(ownerRules);
  if (ownerHash !== localHash) {
    throw new Error(`Governed rules source does not match Workout Studio: ${ownerHash} != ${localHash}`);
  }
}

console.log(`Firestore rules compatibility verified: ${localHash}`);
