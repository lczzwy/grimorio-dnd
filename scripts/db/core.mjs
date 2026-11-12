// Backup and restore of the Grimório tables (everything in "public" the site writes).
// Works with any client that has `query(sql, params) -> { rows }` (node-postgres or PGlite),
// so the very same code is tested on an in-memory copy before it ever touches the real database.

/** In foreign-key order: a row only points at rows inserted before it. */
export const TABLES = [
  'profiles', 'characters', 'creatures', 'campaigns', 'campaign_members', 'campaign_homebrew',
  'encounters', 'combatants', 'combatant_secrets', 'rolls', 'chat_messages',
  'campaign_maps', 'map_tokens', 'map_drawings',
];

/** Tables that exist in this database (an older schema may lack the newest ones). */
async function present(db) {
  const r = await db.query(`select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)`, [TABLES]);
  const have = new Set(r.rows.map((x) => x.table_name));
  return TABLES.filter((t) => have.has(t));
}

/** Every row of every table, as plain JSON (jsonb, arrays and timestamps keep full precision). */
export async function exportAll(db) {
  const tables = {};
  for (const t of await present(db)) {
    const r = await db.query(`select coalesce(json_agg(bk_row order by bk_row::text), '[]'::json) as rows from public.${t} bk_row`);
    tables[t] = typeof r.rows[0].rows === 'string' ? JSON.parse(r.rows[0].rows) : r.rows[0].rows;
  }
  return { app: 'grimorio', kind: 'backup', made: new Date().toISOString(), tables };
}

export const counts = (b) => Object.fromEntries(Object.entries(b.tables).map(([t, rows]) => [t, rows.length]));

/**
 * Puts the database back exactly as in the backup, in one transaction: if anything fails,
 * nothing changes. Triggers are switched off meanwhile so they don't rewrite restored rows
 * (chat author names, the GM row a new campaign creates, the roll and drawing trims).
 */
export async function restoreAll(db, backup) {
  if (backup?.app !== 'grimorio' || backup?.kind !== 'backup' || !backup.tables) throw new Error('Este arquivo não é um backup do Grimório.');
  const tables = (await present(db)).filter((t) => t in backup.tables);
  const list = tables.map((t) => 'public.' + t).join(', ');
  await db.query('begin');
  try {
    for (const t of tables) await db.query(`alter table public.${t} disable trigger user`);
    await db.query(`truncate table ${list}`);
    for (const t of tables) {
      const rows = backup.tables[t];
      if (!rows.length) continue;
      // in chunks: a big table in one parameter is fine, but keeps memory flat
      for (let i = 0; i < rows.length; i += 500) {
        try {
          await db.query(`insert into public.${t} select * from json_populate_recordset(null::public.${t}, $1::text::json)`, [JSON.stringify(rows.slice(i, i + 500))]);
        } catch (e) {
          throw new Error(`Restaurando ${t}: ${e.message}`);
        }
      }
    }
    for (const t of tables) await db.query(`alter table public.${t} enable trigger user`);
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
  return Object.fromEntries(tables.map((t) => [t, backup.tables[t].length]));
}
