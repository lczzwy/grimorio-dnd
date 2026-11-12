// The backup/restore scripts (scripts/db) run here on an in-memory copy of the real schema:
// back up, break the data, restore, and the result must match the backup row by row.
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error plain .mjs module shared with the command-line scripts
import { exportAll, restoreAll, TABLES } from '../scripts/db/core.mjs';

const AUTH_STUB = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
`;
const GM = '00000000-0000-0000-0000-00000000000a';
const P1 = '00000000-0000-0000-0000-00000000000b';

let db: PGlite;
const q = (sql: string, p: unknown[] = []) => db.query(sql, p);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'gm@x', '{"display_name":"Mestre"}'), ($2, 'p1@x', '{"display_name":"Ana"}')`, [GM, P1]);
  const sheet = { name: 'Voss', hp: { current: 17, temp: 2, maxBonus: 0 }, classes: [{ classId: 'hb-mystic', level: 3 }], feats: ['hb-a', 'hb-b'], resources: [{ uid: 'r', name: 'Psi Points', max: 14, used: 3, reset: 'long' }], inventory: [{ uid: 'i', name: 'Adaga', qty: 2 }], base: { str: 8, dex: 14, con: 12, int: 16, wis: 13, cha: 10 } };
  await q(`insert into characters (id, owner, edition, name, data, version) values ('c1', $1, '2014', 'Voss', $2, 7)`, [P1, JSON.stringify(sheet)]);
  const camp = (await q(`insert into campaigns (name, edition, gm) values ('Mesa', '2014', $1) returning id`, [GM])).rows[0] as { id: string };
  await q(`insert into campaign_members (campaign_id, user_id, role, character_id, color) values ($1, $2, 'player', 'c1', '#aabbcc')`, [camp.id, P1]);
  await q(`insert into campaign_homebrew (campaign_id, kind, id, item, updated_by, created_by) values ($1, 'classes', 'hb-x', '{"name":"X","hitDie":8}', $2, $2)`, [camp.id, GM]);
  const fighter = (await q(`insert into combatants (campaign_id, kind, name, initiative, conditions, effects) values ($1, 'monster', 'Orc', 12, '{poisoned}', '[{"id":"e","name":"Bênção"}]') returning id`, [camp.id])).rows[0] as { id: string };
  await q(`insert into combatant_secrets (combatant_id, campaign_id, hp_current, hp_max) values ($1, $2, 5, 15)`, [fighter.id, camp.id]);
  await q(`update encounters set active = true, round = 3, turn = 1, turn_id = $2 where campaign_id = $1`, [camp.id, fighter.id]);
  await q(`insert into rolls (campaign_id, user_id, author, label, formula, rolls, total) values ($1, $2, 'Ana', 'Ataque', '1d20+5', '{14}', 19)`, [camp.id, P1]);
  await q(`insert into chat_messages (campaign_id, user_id, author, body) values ($1, $2, 'Ana', 'olá')`, [camp.id, P1]);
  // a name changed after the message: the restore must keep the message as it was
  await q(`update profiles set display_name = 'Ana Clara' where id = $1`, [P1]);
  await q(`insert into creatures (owner, name, data) values ($1, 'Lobo', '{"hp":11}')`, [GM]);
  const map = (await q(`insert into campaign_maps (campaign_id, name, image_url, width, height, grid_size, active) values ($1, 'Cripta', 'https://x/m.webp', 800, 800, 70.5, true) returning id`, [camp.id])).rows[0] as { id: string };
  await q(`insert into map_tokens (campaign_id, map_id, name, x, y, hidden, combatant_id, character_id) values ($1, $2, 'Orc', 123.25, 456.5, true, $3, 'c1')`, [camp.id, map.id, fighter.id]);
  await q(`insert into map_drawings (campaign_id, map_id, author, points) values ($1, $2, $3, '[1,2,3,4]')`, [camp.id, map.id, GM]);
});

describe('backup and restore', () => {
  it('backs up every table the site writes', async () => {
    const b = await exportAll(db);
    expect(Object.keys(b.tables)).toEqual(TABLES);
    for (const t of TABLES) {
      expect(b.tables[t].length, t).toBeGreaterThan(0);
      // whole rows, not one column (a table alias once matched the tokens' "x" column)
      for (const row of b.tables[t]) expect(row !== null && typeof row === 'object' && !Array.isArray(row), t).toBe(true);
    }
    expect(b.tables.map_tokens[0]).toMatchObject({ name: 'Orc', x: 123.25, y: 456.5, hidden: true });
  });

  it('puts the database back exactly as in the backup after it was changed', async () => {
    const before = await exportAll(db);
    // break things: a sheet changed (as a migration would), rows deleted, rows added
    await q(`update characters set data = jsonb_set(data, '{hp,current}', '1'), version = 99 where id = 'c1'`);
    await q(`delete from map_drawings`);
    await q(`delete from combatants`);
    await q(`insert into chat_messages (campaign_id, user_id, body) select campaign_id, user_id, 'novo' from campaign_members limit 1`);
    await q(`insert into characters (id, owner, edition, data) values ('c2', $1, '2024', '{}')`, [GM]);
    const broken = await exportAll(db);
    expect(broken.tables).not.toEqual(before.tables);

    await restoreAll(db, before);
    const after = await exportAll(db);
    expect(after.tables).toEqual(before.tables);
  });

  it('leaves the triggers on again after restoring', async () => {
    const m = (await q(`select campaign_id, user_id from campaign_members where role = 'player'`)).rows[0] as { campaign_id: string; user_id: string };
    const r = (await q(`insert into chat_messages (campaign_id, user_id, author, body) values ($1, $2, 'falso', 'oi') returning author`, [m.campaign_id, m.user_id])).rows[0] as { author: string };
    expect(r.author).toBe('Ana Clara');
  });

  it('a failed restore changes nothing', async () => {
    const before = await exportAll(db);
    const bad = JSON.parse(JSON.stringify(before));
    bad.tables.campaign_members.push({ ...bad.tables.campaign_members[0], role: 'rei' }); // breaks a check
    await expect(restoreAll(db, bad)).rejects.toThrow();
    expect((await exportAll(db)).tables).toEqual(before.tables);
  });

  it('refuses a file that is not a backup', async () => {
    await expect(restoreAll(db, { tables: {} })).rejects.toThrow(/não é um backup/);
  });
});
