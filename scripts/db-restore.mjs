// Puts the database back exactly as in a backup file. Erases what is there now.
// Usage (PowerShell):
//   $env:DATABASE_URL = "postgresql://..."; node scripts/db-restore.mjs ..\backups\grimorio-backup-XXXX.json --sim
// Without --sim it only shows what is in the file and stops.
import fs from 'node:fs';
import pg from 'pg';
import { counts, restoreAll } from './db/core.mjs';

const [file, flag] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) { console.error('Indique o arquivo de backup.'); process.exit(1); }
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log('Backup de', backup.made);
console.table(counts(backup));
if (flag !== '--sim') { console.log('Nada foi alterado. Para restaurar de verdade, rode de novo com --sim no final.'); process.exit(0); }
const url = process.env.DATABASE_URL;
if (!url) { console.error('Falta a variável DATABASE_URL.'); process.exit(1); }
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const done = await restoreAll(db, backup);
  console.log('Banco restaurado:');
  console.table(done);
} finally {
  await db.end();
}
