// Copies every Grimório table to a dated JSON file OUTSIDE the repository.
// Usage (PowerShell), with the connection string from Supabase > Connect > Session pooler:
//   $env:DATABASE_URL = "postgresql://..."; node scripts/db-backup.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './db/connect.mjs';
import { counts, exportAll } from './db/core.mjs';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backups');
fs.mkdirSync(outDir, { recursive: true });

const db = await connect();
try {
  const b = await exportAll(db);
  const stamp = b.made.replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(outDir, `grimorio-backup-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(b));
  console.log('Backup salvo em', file);
  console.table(counts(b));
} finally {
  await db.end();
}
