// Runs supabase/schema.sql on an in-process Postgres (PGlite) with a minimal stand-in for
// Supabase's auth schema, then checks the security rules as real users would hit them.
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

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
const P2 = '00000000-0000-0000-0000-00000000000c';
const OUT = '00000000-0000-0000-0000-00000000000d';

let db: PGlite;

/** Runs `sql` as the given user (role authenticated + JWT sub), like a browser request. */
async function as<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const fails = async (p: Promise<unknown>, msg: RegExp) => {
  await expect(p).rejects.toThrow(msg);
};

const sheet = (hp: number, temp = 0) => JSON.stringify({ name: 'x', hp: { current: hp, temp, maxBonus: 0 }, conditions: [], deathSaves: { success: 1, fail: 2 }, concentration: 'bless' });

let campaign = '';
let otherEditionCampaign = '';
let code = '';

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  // running it twice must be safe (the user re-runs it on every version)
  await db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  for (const [id, name] of [[GM, 'Mestre'], [P1, 'Ana'], [P2, 'Beto'], [OUT, 'Fora']]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, name + '@x.com', JSON.stringify({ display_name: name })]);
  }
  await as(P1, `insert into characters (id, owner, edition, name, data) values ('voss', $1, '2014', 'Voss', $2)`, [P1, sheet(30, 5)]);
  await as(P1, `insert into characters (id, owner, edition, name, data) values ('lyra', $1, '2024', 'Lyra', $2)`, [P1, sheet(10)]);
  await as(P2, `insert into characters (id, owner, edition, name, data) values ('beto', $1, '2014', 'Beto', $2)`, [P2, sheet(20)]);
  const [c] = await as<{ id: string; invite_code: string }>(GM, `insert into campaigns (name, edition) values ('Mesa', '2014') returning id, invite_code`);
  campaign = c.id;
  code = c.invite_code;
  const [o] = await as<{ id: string }>(GM, `insert into campaigns (name, edition) values ('Outra', '2024') returning id`);
  otherEditionCampaign = o.id;
});

describe('profiles & campaigns', () => {
  it('signup creates a profile with the display name', async () => {
    const rows = await as<{ display_name: string }>(P1, `select display_name from profiles where id = $1`, [P1]);
    expect(rows[0].display_name).toBe('Ana');
  });

  it('creator becomes gm member; invite joins as player; bad code is rejected', async () => {
    expect((await as(GM, `select role from campaign_members where campaign_id = $1`, [campaign]))[0]).toEqual({ role: 'gm' });
    await as(P1, `select join_campaign($1)`, [code]);
    await as(P2, `select join_campaign($1)`, [code]);
    await as(P1, `select join_campaign($1)`, [code]); // joining twice is harmless
    const roles = await as<{ role: string }>(GM, `select role from campaign_members where campaign_id = $1 order by role`, [campaign]);
    expect(roles.map((r) => r.role)).toEqual(['gm', 'player', 'player']);
    await fails(as(OUT, `select join_campaign('nope')`), /invalid_invite/);
  });

  it('outsiders cannot see the campaign or its members', async () => {
    expect(await as(OUT, `select * from campaigns where id = $1`, [campaign])).toEqual([]);
    expect(await as(OUT, `select * from campaign_members where campaign_id = $1`, [campaign])).toEqual([]);
  });

  it('choosing a character: must own it and match the edition', async () => {
    await fails(as(P1, `select set_member_character($1, 'lyra')`, [campaign]), /edition_mismatch/);
    await fails(as(P1, `select set_member_character($1, 'beto')`, [campaign]), /not_owner/);
    await as(P1, `select set_member_character($1, 'voss')`, [campaign]);
    await as(P2, `select set_member_character($1, 'beto')`, [campaign]);
    const rows = await as(GM, `select character_id from campaign_members where campaign_id = $1 and character_id is not null order by character_id`, [campaign]);
    expect(rows).toEqual([{ character_id: 'beto' }, { character_id: 'voss' }]);
  });

  it('only the gm regenerates the invite code', async () => {
    await fails(as(P1, `select new_invite_code($1)`, [campaign]), /forbidden/);
    const [r] = await as<{ new_invite_code: string }>(GM, `select new_invite_code($1)`, [campaign]);
    expect(r.new_invite_code).not.toBe(code);
    code = r.new_invite_code;
  });

  it('a campaign edition mismatch also blocks via the other campaign', async () => {
    await as(P1, `select join_campaign((select invite_code from campaigns where id = $1))`, [otherEditionCampaign]).catch(() => undefined);
    // P1 cannot read the other campaign's code (not a member), so joining that way fails
    expect(await as(P1, `select * from campaigns where id = $1`, [otherEditionCampaign])).toEqual([]);
  });
});

describe('characters', () => {
  it('party members read each other; outsiders do not', async () => {
    expect((await as(P2, `select id from characters where id = 'voss'`)).length).toBe(1);
    expect((await as(GM, `select id from characters where id = 'voss'`)).length).toBe(1);
    expect(await as(OUT, `select id from characters where id = 'voss'`)).toEqual([]);
    // Lyra is not linked to any campaign: only her owner sees her
    expect(await as(P2, `select id from characters where id = 'lyra'`)).toEqual([]);
  });

  it('nobody but the owner writes a sheet (not even the gm)', async () => {
    await as(P2, `update characters set name = 'hack' where id = 'voss'`);
    await as(GM, `update characters set name = 'hack' where id = 'voss'`);
    const [r] = await as<{ name: string }>(P1, `select name from characters where id = 'voss'`);
    expect(r.name).toBe('Voss');
  });

  it('gm_apply: damage eats temp hp first, floors at 0 and ends concentration', async () => {
    await fails(as(P2, `select gm_apply('voss', $1, -3, null, null, null, null)`, [campaign]), /forbidden/);
    const [r] = await as<{ gm_apply: { hp: { current: number; temp: number }; concentration?: string } }>(GM, `select gm_apply('voss', $1, -8, null, null, null, null)`, [campaign]);
    expect(r.gm_apply.hp).toMatchObject({ current: 27, temp: 0 });
    const [k] = await as<{ gm_apply: { hp: { current: number }; concentration?: string } }>(GM, `select gm_apply('voss', $1, -100, null, null, null, null)`, [campaign]);
    expect(k.gm_apply.hp.current).toBe(0);
    expect(k.gm_apply.concentration ?? null).toBeNull();
  });

  it('gm_apply: healing from 0 resets death saves and respects max; temp hp does not stack; conditions add/remove', async () => {
    const [h] = await as<{ gm_apply: { hp: { current: number; temp: number }; deathSaves: object; conditions: string[] } }>(GM, `select gm_apply('voss', $1, 50, 4, array['poisoned','prone'], null, 40)`, [campaign]);
    expect(h.gm_apply.hp).toMatchObject({ current: 40, temp: 4 });
    expect(h.gm_apply.deathSaves).toEqual({ success: 0, fail: 0 });
    const [t] = await as<{ gm_apply: { hp: { temp: number }; conditions: string[] } }>(GM, `select gm_apply('voss', $1, null, 2, array['poisoned'], array['prone'], null)`, [campaign]);
    expect(t.gm_apply.hp.temp).toBe(4);
    expect(t.gm_apply.conditions).toEqual(['poisoned']);
    const [row] = await as<{ version: number }>(P1, `select version from characters where id = 'voss'`);
    expect(row.version).toBeGreaterThan(1);
  });

  it('gm_apply refuses a character not in that campaign', async () => {
    await fails(as(GM, `select gm_apply('lyra', $1, -1, null, null, null, null)`, [campaign]), /forbidden/);
  });
});

describe('rolls', () => {
  it('members see public rolls; hidden ones only the author and the gm', async () => {
    await as(P1, `insert into rolls (campaign_id, user_id, author, label, formula, rolls, total) values ($1, $2, 'Voss', 'Ataque', '1d20+5', '{12}', 17)`, [campaign, P1]);
    await as(P1, `insert into rolls (campaign_id, user_id, author, label, formula, rolls, total, hidden) values ($1, $2, 'Voss', 'Segredo', '1d20', '{3}', 3, true)`, [campaign, P1]);
    await as(GM, `insert into rolls (campaign_id, user_id, author, label, formula, rolls, total, hidden) values ($1, $2, 'Mestre', 'Goblin', '1d20+4', '{19}', 23, true)`, [campaign, GM]);
    const labels = async (u: string) => (await as<{ label: string }>(u, `select label from rolls where campaign_id = $1 order by label`, [campaign])).map((r) => r.label);
    expect(await labels(P2)).toEqual(['Ataque']);
    expect(await labels(P1)).toEqual(['Ataque', 'Segredo']);
    expect(await labels(GM)).toEqual(['Ataque', 'Goblin', 'Segredo']);
    expect(await labels(OUT)).toEqual([]);
  });

  it('cannot post as someone else or into a campaign you are not in', async () => {
    await fails(as(P2, `insert into rolls (campaign_id, user_id, author, label, formula, rolls, total) values ($1, $2, 'x', 'x', '1d20', '{1}', 1)`, [campaign, P1]), /row-level security/);
    await fails(as(OUT, `insert into rolls (campaign_id, user_id, author, label, formula, rolls, total) values ($1, $2, 'x', 'x', '1d20', '{1}', 1)`, [campaign, OUT]), /row-level security/);
  });

  it('keeps only the newest 200 rolls per campaign', async () => {
    for (let i = 0; i < 205; i++) await as(P1, `insert into rolls (campaign_id, user_id, author, label, formula, rolls, total) values ($1, $2, 'Voss', $3, '1d4', '{1}', 1)`, [campaign, P1, 'r' + i]);
    const [{ n }] = await as<{ n: number }>(GM, `select count(*)::int as n from rolls where campaign_id = $1`, [campaign]);
    expect(n).toBe(200);
  });
});

describe('combat', () => {
  let goblin = '';
  let hidden = '';
  it('hp_band thresholds', async () => {
    const band = async (c: number, m: number) => (await db.query<{ b: string }>(`select hp_band($1, $2) as b`, [c, m])).rows[0].b;
    expect(await band(60, 60)).toBe('ileso');
    expect(await band(30, 60)).toBe('ferido');
    expect(await band(15, 60)).toBe('sangrando');
    expect(await band(14, 60)).toBe('quase morto');
    expect(await band(0, 60)).toBe('caido');
  });

  it('only the gm manages combatants; players see visible ones and never the secrets', async () => {
    await fails(as(P1, `insert into combatants (campaign_id, kind, name) values ($1, 'monster', 'x')`, [campaign]), /row-level security/);
    [{ id: goblin }] = await as<{ id: string }>(GM, `insert into combatants (campaign_id, kind, name, initiative) values ($1, 'monster', 'Goblin', 12) returning id`, [campaign]);
    [{ id: hidden }] = await as<{ id: string }>(GM, `insert into combatants (campaign_id, kind, name, visible) values ($1, 'monster', 'Assassino', false) returning id`, [campaign]);
    await as(GM, `insert into combatant_secrets (combatant_id, campaign_id, hp_current, hp_max, ac) values ($1, $2, 7, 7, 15)`, [goblin, campaign]);
    expect((await as<{ name: string }>(P1, `select name from combatants where campaign_id = $1`, [campaign])).map((r) => r.name)).toEqual(['Goblin']);
    expect((await as(GM, `select name from combatants where campaign_id = $1`, [campaign])).length).toBe(2);
    expect(await as(P1, `select * from combatant_secrets`)).toEqual([]);
    expect(await as(OUT, `select * from combatants where id = $1`, [hidden])).toEqual([]);
  });

  it('changing secret hp updates the public band', async () => {
    await as(GM, `update combatant_secrets set hp_current = 1 where combatant_id = $1`, [goblin]);
    const [r] = await as<{ hp_band: string }>(P1, `select hp_band from combatants where id = $1`, [goblin]);
    expect(r.hp_band).toBe('quase morto');
  });

  it('encounter state is gm-only to write, readable by members', async () => {
    await as(GM, `insert into encounters (campaign_id, active, round, turn) values ($1, true, 1, 0) on conflict (campaign_id) do update set active = true`, [campaign]);
    await as(P1, `update encounters set round = 99 where campaign_id = $1`, [campaign]);
    const [e] = await as<{ round: number }>(P1, `select round from encounters where campaign_id = $1`, [campaign]);
    expect(e.round).toBe(1);
  });
});

describe('campaign homebrew', () => {
  it('members publish and read; outsiders see nothing; only author or gm delete', async () => {
    await as(P1, `insert into campaign_homebrew (campaign_id, kind, id, item) values ($1, 'feats', 'hb-x', '{"id":"hb-x","name":"X","desc":"x"}')`, [campaign]);
    expect((await as(P2, `select id from campaign_homebrew where campaign_id = $1`, [campaign])).length).toBe(1);
    expect(await as(OUT, `select id from campaign_homebrew`)).toEqual([]);
    await as(P2, `delete from campaign_homebrew where campaign_id = $1`, [campaign]);
    expect((await as(GM, `select id from campaign_homebrew where campaign_id = $1`, [campaign])).length).toBe(1);
    await as(GM, `delete from campaign_homebrew where campaign_id = $1`, [campaign]);
    expect(await as(GM, `select id from campaign_homebrew where campaign_id = $1`, [campaign])).toEqual([]);
  });
});

describe('chat & player colours', () => {
  it('members chat; outsiders can neither read nor post; nobody posts as someone else', async () => {
    await as(P1, `insert into chat_messages (campaign_id, author, body) values ($1, 'Ana', 'oi mesa')`, [campaign]);
    expect((await as<{ body: string }>(P2, `select body from chat_messages where campaign_id = $1`, [campaign])).map((r) => r.body)).toEqual(['oi mesa']);
    expect(await as(OUT, `select id from chat_messages`)).toEqual([]);
    await fails(as(OUT, `insert into chat_messages (campaign_id, body) values ($1, 'intruso')`, [campaign]), /row-level security/);
    await fails(as(P2, `insert into chat_messages (campaign_id, user_id, body) values ($1, $2, 'fingindo')`, [campaign, P1]), /row-level security/);
    await fails(as(P1, `insert into chat_messages (campaign_id, body) values ($1, '')`, [campaign]), /check constraint/);
  });

  it('only the author or the gm deletes a message', async () => {
    await as(P2, `delete from chat_messages where campaign_id = $1`, [campaign]);
    expect((await as(P1, `select id from chat_messages where campaign_id = $1`, [campaign])).length).toBe(1);
    await as(GM, `delete from chat_messages where campaign_id = $1`, [campaign]);
    expect(await as(P1, `select id from chat_messages where campaign_id = $1`, [campaign])).toEqual([]);
  });

  it('each member sets only their own colour, in #rrggbb form', async () => {
    await as(P1, `select set_member_color($1, '#c8423a')`, [campaign]);
    const rows = await as<{ user_id: string; color: string | null }>(P2, `select user_id, color from campaign_members where campaign_id = $1`, [campaign]);
    expect(rows.find((r) => r.user_id === P1)?.color).toBe('#c8423a');
    expect(rows.find((r) => r.user_id === P2)?.color).toBeNull();
    await fails(as(P1, `select set_member_color($1, 'red; drop table x')`, [campaign]), /bad_color/);
    await fails(as(OUT, `select set_member_color($1, '#000000')`, [campaign]), /forbidden/);
  });
});
