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
-- a minimal stand-in for Supabase Storage (buckets + objects with RLS)
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated, anon;
grant select on storage.buckets to authenticated, anon;
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

describe('rolls (drawn by the server)', () => {
  type Roll = { id: string; user_id: string; author: string; label: string; formula: string; rolls: number[]; dropped: number[] | null; total: number; kind: string | null; hidden: boolean };
  const roll = async (u: string, formula: string, o: { label?: string; mode?: string; crit?: boolean; hidden?: boolean } = {}) =>
    (await as<Roll>(u, `select * from roll_dice($1, $2, $3, $4, $5, $6)`, [campaign, formula, o.label ?? 'Teste', o.mode ?? 'normal', o.crit ?? false, o.hidden ?? false]))[0];

  it('draws in range, adds the modifier and signs with the real profile name', async () => {
    for (let i = 0; i < 30; i++) {
      const r = await roll(P1, '2d6+3');
      expect(r.rolls).toHaveLength(2);
      for (const v of r.rolls) expect(v >= 1 && v <= 6).toBe(true);
      expect(r.total).toBe(r.rolls[0] + r.rolls[1] + 3);
      expect(r.user_id).toBe(P1);
      expect(r.author).toBe('Ana');
    }
    const spaced = await roll(P1, ' 1D20 + 2 ');
    expect(spaced.formula).toBe('1d20+2');
    expect(spaced.total).toBe(spaced.rolls[0] + 2);
    const neg = await roll(P1, '1d20-1d4-2');
    expect(neg.total).toBe(neg.rolls[0] - neg.rolls[1] - 2);
  });

  it('advantage keeps the higher d20, disadvantage the lower; natural 20/1 are marked', async () => {
    for (let i = 0; i < 20; i++) {
      const a = await roll(P1, '1d20+5', { mode: 'adv' });
      expect(a.dropped).toHaveLength(1);
      expect(a.rolls[0]).toBeGreaterThanOrEqual(a.dropped![0]);
      expect(a.total).toBe(a.rolls[0] + 5);
      expect(a.kind).toBe(a.rolls[0] === 20 ? 'crit' : a.rolls[0] === 1 ? 'fumble' : 'adv');
      const d = await roll(P1, '1d20', { mode: 'dis' });
      expect(d.rolls[0]).toBeLessThanOrEqual(d.dropped![0]);
    }
    // advantage only applies to a roll that starts with a single d20
    expect((await roll(P1, '2d6', { mode: 'adv' })).dropped).toBeNull();
  });

  it('a critical doubles every die', async () => {
    const r = await roll(P1, '1d8+1d6+3', { crit: true });
    expect(r.rolls).toHaveLength(4);
    expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0) + 3);
  });

  it('rejects garbage, huge rolls and outsiders', async () => {
    await fails(roll(P1, 'banana'), /bad_formula/);
    await fails(roll(P1, '5'), /bad_formula/);
    await fails(roll(P1, '1d20;drop table rolls'), /bad_formula/);
    await fails(roll(P1, '101d6'), /bad_formula/);
    await fails(roll(P1, '1d1001'), /bad_formula/);
    await fails(roll(OUT, '1d20'), /forbidden/);
  });

  it('nobody can write a roll straight into the table or change it afterwards', async () => {
    await fails(as(P1, `insert into rolls (campaign_id, user_id, label, formula, rolls, total) values ($1, $2, 'x', '1d20', '{20}', 20)`, [campaign, P1]), /permission denied/);
    const r = await roll(P1, '1d20');
    await fails(as(P1, `update rolls set total = 99 where id = $1`, [r.id]), /permission denied/);
    await fails(as(GM, `update rolls set total = 99 where id = $1`, [r.id]), /permission denied/);
    expect((await as<{ total: number }>(GM, `select total from rolls where id = $1`, [r.id]))[0].total).toBe(r.total);
  });

  it('hidden rolls: only the author and the gm see them; only they can reveal', async () => {
    const mine = await roll(P1, '1d20', { label: 'Segredo', hidden: true });
    const gm = await roll(GM, '1d20+4', { label: 'Goblin', hidden: true });
    const seen = async (u: string, id: string) => (await as(u, `select id from rolls where id = $1`, [id])).length === 1;
    expect(await seen(P2, mine.id)).toBe(false);
    expect(await seen(P1, mine.id)).toBe(true);
    expect(await seen(GM, mine.id)).toBe(true);
    expect(await seen(P1, gm.id)).toBe(false);
    await fails(as(P2, `select reveal_roll($1)`, [mine.id]), /forbidden/);
    await as(P1, `select reveal_roll($1)`, [mine.id]);
    expect(await seen(P2, mine.id)).toBe(true);
    await as(GM, `select reveal_roll($1)`, [gm.id]);
    expect(await seen(P2, gm.id)).toBe(true);
  });

  it('keeps only the newest 200 rolls per campaign', async () => {
    for (let i = 0; i < 205; i++) await roll(P1, '1d4', { label: 'r' + i });
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

describe('initiative from the table', () => {
  it('a player records initiative only from a d20 roll the server made for them', async () => {
    const r = (await as<{ id: string; total: number }>(P1, `select id, total from roll_dice($1, '1d20+4', 'Iniciativa', 'normal', false, false)`, [campaign]))[0];
    await fails(as(OUT, `select roll_my_initiative($1, $2)`, [campaign, r.id]), /forbidden/);
    await fails(as(P2, `select roll_my_initiative($1, $2)`, [campaign, r.id]), /bad_roll/); // someone else's roll
    const dmg = (await as<{ id: string }>(P1, `select id from roll_dice($1, '2d6', 'Dano', 'normal', false, false)`, [campaign]))[0];
    await fails(as(P1, `select roll_my_initiative($1, $2)`, [campaign, dmg.id]), /bad_roll/); // not an initiative roll
    await as(P1, `select roll_my_initiative($1, $2)`, [campaign, r.id]);
    const mine = () => as<{ name: string; initiative: number; kind: string }>(GM, `select name, initiative, kind from combatants where campaign_id = $1 and character_id = 'voss'`, [campaign]);
    expect(await mine()).toEqual([{ name: 'Voss', initiative: r.total, kind: 'player' }]);
    // rolling again updates the same entry instead of adding another
    const again = (await as<{ id: string; total: number }>(P1, `select id, total from roll_dice($1, '1d20+4', 'Iniciativa', 'normal', false, false)`, [campaign]))[0];
    await as(P1, `select roll_my_initiative($1, $2)`, [campaign, again.id]);
    expect(await mine()).toEqual([{ name: 'Voss', initiative: again.total, kind: 'player' }]);
    // the old "send a number" version is gone
    await fails(as(P1, `select roll_my_initiative($1, 30)`, [campaign]), /function|does not exist|invalid input/);
    // still no direct write access to the combat for players
    await as(P1, `update combatants set initiative = 30 where campaign_id = $1`, [campaign]);
    expect((await mine())[0].initiative).toBe(again.total);
  });

  it('the gm can call for initiative; players only read it', async () => {
    await as(GM, `insert into encounters (campaign_id, init_call) values ($1, true) on conflict (campaign_id) do update set init_call = true`, [campaign]);
    expect((await as<{ init_call: boolean }>(P2, `select init_call from encounters where campaign_id = $1`, [campaign]))[0].init_call).toBe(true);
    await fails(as(P2, `update encounters set init_call = false where campaign_id = $1 returning 1`, [campaign]).then((r) => { if (!r.length) throw new Error('row-level security'); }), /row-level security/);
  });
});

describe("gm's bestiary", () => {
  it('each user sees and edits only their own creatures', async () => {
    await as(GM, `insert into creatures (name, data) values ('Lobo Sombrio', '{"hp": 22}')`);
    expect((await as<{ name: string }>(GM, `select name from creatures`)).map((r) => r.name)).toEqual(['Lobo Sombrio']);
    expect(await as(P1, `select * from creatures`)).toEqual([]);
    await fails(as(P1, `insert into creatures (owner, name, data) values ($1, 'Falso', '{}')`, [GM]), /row-level security/);
    await as(P1, `update creatures set name = 'Hackeado'`);
    await as(P1, `delete from creatures`);
    expect((await as<{ name: string }>(GM, `select name from creatures`)).map((r) => r.name)).toEqual(['Lobo Sombrio']);
    await fails(as(GM, `insert into creatures (name, data) values ('', '{}')`), /check constraint/);
  });
});

describe('phase 2: each one only touches what is theirs', () => {
  const item = (name: string) => JSON.stringify({ id: 'hb-p2', name, desc: 'x' });
  const nameOf = async () => (await as<{ item: { name: string }; created_by: string }>(GM, `select item, created_by from campaign_homebrew where campaign_id = $1 and id = 'hb-p2'`, [campaign]))[0];

  it('campaign homebrew: only the original author or the gm edit and delete an item', async () => {
    await as(P1, `insert into campaign_homebrew (campaign_id, kind, id, item) values ($1, 'feats', 'hb-p2', $2)`, [campaign, item('Original')]);
    expect((await nameOf()).created_by).toBe(P1);
    // another player cannot overwrite it, neither by update nor by upsert
    await as(P2, `update campaign_homebrew set item = $2 where campaign_id = $1 and id = 'hb-p2'`, [campaign, item('Sabotado')]);
    await fails(as(P2, `insert into campaign_homebrew (campaign_id, kind, id, item) values ($1, 'feats', 'hb-p2', $2) on conflict (campaign_id, kind, id) do update set item = excluded.item, updated_by = excluded.updated_by`, [campaign, item('Sabotado')]), /row-level security/);
    expect((await nameOf()).item.name).toBe('Original');
    // the author can, and so can the gm; authorship stays with whoever created it
    await as(P1, `update campaign_homebrew set item = $2, updated_by = $3 where campaign_id = $1 and id = 'hb-p2'`, [campaign, item('Revisado'), P1]);
    expect((await nameOf()).item.name).toBe('Revisado');
    await as(GM, `update campaign_homebrew set item = $2, updated_by = $3 where campaign_id = $1 and id = 'hb-p2'`, [campaign, item('Do mestre'), GM]);
    expect(await nameOf()).toMatchObject({ item: { name: 'Do mestre' }, created_by: P1 });
    // nobody can claim someone else's item as their own creation
    await fails(as(P2, `insert into campaign_homebrew (campaign_id, kind, id, item, created_by) values ($1, 'feats', 'hb-p2b', $2, $3)`, [campaign, item('X'), P1]), /row-level security/);
    // deleting: not the other player, yes the author
    await as(P2, `delete from campaign_homebrew where campaign_id = $1 and id = 'hb-p2'`, [campaign]);
    expect(await nameOf()).toBeTruthy();
    await as(P1, `delete from campaign_homebrew where campaign_id = $1 and id = 'hb-p2'`, [campaign]);
    expect(await nameOf()).toBeUndefined();
  });

  it('chat: the author name comes from the profile, not from the browser', async () => {
    const [m] = await as<{ author: string }>(P1, `insert into chat_messages (campaign_id, author, body) values ($1, 'Mestre Falso', 'oi') returning author`, [campaign]);
    expect(m.author).toBe('Ana');
  });

  it('a player who swaps character or leaves the campaign also leaves the fight', async () => {
    await as(P2, `insert into characters (id, owner, edition, name, data) values ('beto2', $1, '2014', 'Beto II', $2)`, [P2, sheet(12)]);
    await as(P2, `select set_member_character($1, 'beto')`, [campaign]);
    await as(GM, `insert into combatants (campaign_id, kind, character_id, name) values ($1, 'player', 'beto', 'Beto')`, [campaign]);
    const inFight = async () => (await as<{ character_id: string }>(GM, `select character_id from combatants where campaign_id = $1 and kind = 'player' order by character_id`, [campaign])).map((r) => r.character_id);
    expect(await inFight()).toContain('beto');
    // swapping character takes the old one out of the order
    await as(P2, `select set_member_character($1, 'beto2')`, [campaign]);
    expect(await inFight()).not.toContain('beto');
    await as(GM, `insert into combatants (campaign_id, kind, character_id, name) values ($1, 'player', 'beto2', 'Beto II')`, [campaign]);
    // leaving (or being removed) takes the current one out; other players stay
    const before = (await inFight()).filter((c) => c !== 'beto2');
    await as(GM, `delete from campaign_members where campaign_id = $1 and user_id = $2`, [campaign, P2]);
    expect(await inFight()).toEqual(before);
  });
});

describe('phase 3: profile names from Discord', () => {
  const profileOf = async (id: string) => (await db.query<{ display_name: string }>(`select display_name from profiles where id = $1`, [id])).rows[0]?.display_name;
  it('uses the Discord display name, then the username, then the e-mail', async () => {
    const a = '00000000-0000-0000-0000-0000000000d1';
    const b = '00000000-0000-0000-0000-0000000000d2';
    const c = '00000000-0000-0000-0000-0000000000d3';
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'lucas@discord.test', $2)`, [a, JSON.stringify({ full_name: 'lucas_rpg#0', name: 'lucas_rpg#0', custom_claims: { global_name: 'Lucas' } })]);
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'bia@discord.test', $2)`, [b, JSON.stringify({ full_name: 'bia_dm#0' })]);
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'caio@mail.test', '{}')`, [c]);
    expect(await profileOf(a)).toBe('Lucas');
    expect(await profileOf(b)).toBe('bia_dm');
    expect(await profileOf(c)).toBe('caio');
  });
});

describe('phase 4: saving a sheet checks the version', () => {
  type Res = { status: 'ok' | 'conflict'; version: number; data?: { hp: { current: number } } };
  const save = async (u: string, id: string, hp: number, base: number | null) =>
    (await as<{ r: Res }>(u, `select save_character($1, '2014', 'Novo', $2, $3) as r`, [id, sheet(hp), base]))[0].r;

  it('creates, then saves only on top of the version it last saw', async () => {
    expect(await save(P1, 'novo', 30, null)).toEqual({ status: 'ok', version: 1 });
    expect(await save(P1, 'novo', 28, 1)).toEqual({ status: 'ok', version: 2 });
    // the GM applies damage: the version moves on
    await as(P1, `select set_member_character($1, 'novo')`, [campaign]);
    await as(GM, `select gm_apply('novo', $1, -10, null, null, null, null)`, [campaign]);
    // the player's device still thinks it is on version 2: no overwrite, it gets the server copy back
    const c = await save(P1, 'novo', 28, 2);
    expect(c.status).toBe('conflict');
    expect(c.version).toBe(3);
    expect(c.data!.hp.current).toBe(18);
    expect((await as<{ hp: number }>(GM, `select (data->'hp'->>'current')::int as hp from characters where id = 'novo'`))[0].hp).toBe(18);
    // after merging, saving on top of version 3 works
    expect(await save(P1, 'novo', 18, 3)).toEqual({ status: 'ok', version: 4 });
  });

  it('an existing sheet with an unknown version is a conflict, never a blind overwrite', async () => {
    expect((await save(P1, 'novo', 1, null)).status).toBe('conflict');
  });

  it("nobody saves over someone else's sheet, even with the same id", async () => {
    await fails(save(P2, 'novo', 1, 99), /not_owner/);
    await fails(save(OUT, 'novo', 1, 99), /not_owner/);
  });
});

describe('phase 5: a table that lasts', () => {
  /** Runs `sql` as a visitor who is not signed in. */
  const anon = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
    try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec(`reset role;`); }
  };

  it('keep-alive: anyone can ping the database', async () => {
    expect((await anon<{ ok: boolean }>(`select ping() as ok`))[0].ok).toBe(true);
  });

  it('chat: more than 5 messages in 3 seconds from the same person is refused', async () => {
    for (let i = 0; i < 5; i++) await as(GM, `insert into chat_messages (campaign_id, body) values ($1, $2)`, [campaign, 'msg ' + i]);
    await fails(as(GM, `insert into chat_messages (campaign_id, body) values ($1, 'spam')`, [campaign]), /too_fast/);
  });

  it('chat: only the newest 500 messages per campaign are kept', async () => {
    await db.query(`insert into chat_messages (campaign_id, user_id, body, created_at)
      select $1, $2, 'velha ' || g, clock_timestamp() - (g || ' seconds')::interval from generate_series(1, 520) g`, [campaign, GM]);
    await db.query(`insert into chat_messages (campaign_id, user_id, body) values ($1, $2, 'nova')`, [campaign, GM]);
    const [{ n }] = await as<{ n: number }>(GM, `select count(*)::int as n from chat_messages where campaign_id = $1`, [campaign]);
    expect(n).toBe(500);
    expect((await as(GM, `select 1 from chat_messages where campaign_id = $1 and body = 'nova'`, [campaign])).length).toBe(1);
  });

  it('photos: a public bucket where each person writes only in their own folder', async () => {
    const [b] = (await db.query<{ public: boolean; file_size_limit: number }>(`select public, file_size_limit from storage.buckets where id = 'portraits'`)).rows;
    expect(b.public).toBe(true);
    expect(Number(b.file_size_limit)).toBeLessThanOrEqual(1024 * 1024);
    await as(P1, `insert into storage.objects (bucket_id, name) values ('portraits', $1)`, [P1 + '/voss.jpg']);
    await fails(as(P1, `insert into storage.objects (bucket_id, name) values ('portraits', $1)`, [GM + '/falsa.jpg']), /row-level security/);
    await fails(anon(`insert into storage.objects (bucket_id, name) values ('portraits', 'x/y.jpg')`), /row-level security/);
    await as(GM, `delete from storage.objects where name = $1`, [P1 + '/voss.jpg']); // not GM's file: nothing happens
    expect((await db.query(`select 1 from storage.objects where name = $1`, [P1 + '/voss.jpg'])).rows.length).toBe(1);
    await as(P1, `delete from storage.objects where name = $1`, [P1 + '/voss.jpg']);
    expect((await db.query(`select 1 from storage.objects where name = $1`, [P1 + '/voss.jpg'])).rows.length).toBe(0);
  });

  it('error log: anyone can report, nobody can read it from the site, and it stays small', async () => {
    await as(P1, `insert into client_errors (message, url) values ('Quebrou a ficha', '#/2014/c/voss')`);
    await anon(`insert into client_errors (message) values ('Erro sem login')`);
    await fails(as(P1, `select * from client_errors`), /permission denied/);
    await fails(as(GM, `select * from client_errors`), /permission denied/);
    const [r] = (await db.query<{ user_id: string }>(`select user_id from client_errors where message = 'Quebrou a ficha'`)).rows;
    expect(r.user_id).toBe(P1);
    await fails(as(P1, `insert into client_errors (message) values ($1)`, ['x'.repeat(3000)]), /check constraint/);
    await db.query(`insert into client_errors (message) select 'e' || g from generate_series(1, 1010) g`);
    const [{ n }] = (await db.query<{ n: number }>(`select count(*)::int as n from client_errors`)).rows;
    expect(n).toBeLessThanOrEqual(1000);
  });
});

describe('phase 8a: battle map', () => {
  const img = 'https://x/maps/a.png';
  it('only the GM adds maps; members see them; outsiders do not', async () => {
    const [m] = await as<{ id: string }>(GM, `insert into campaign_maps (campaign_id, name, image_url, width, height) values ($1, 'Cripta', $2, 1400, 1000) returning id`, [campaign, img]);
    expect(m.id).toBeTruthy();
    await fails(as(P1, `insert into campaign_maps (campaign_id, image_url, width, height) values ($1, $2, 10, 10)`, [campaign, img]), /row-level security/);
    expect(await as(P1, `select name from campaign_maps where campaign_id = $1`, [campaign])).toEqual([{ name: 'Cripta' }]);
    expect(await as(OUT, `select 1 from campaign_maps where campaign_id = $1`, [campaign])).toEqual([]);
    const upd = await as(P1, `update campaign_maps set grid_size = 20 where campaign_id = $1 returning id`, [campaign]);
    expect(upd).toEqual([]);
  });
  it('one active map at a time, switched only by the GM', async () => {
    const [b] = await as<{ id: string }>(GM, `insert into campaign_maps (campaign_id, name, image_url, width, height) values ($1, 'Floresta', $2, 800, 600) returning id`, [campaign, img]);
    const [a] = await as<{ id: string }>(GM, `select id from campaign_maps where campaign_id = $1 and name = 'Cripta'`, [campaign]);
    await as(GM, `select set_active_map($1, $2)`, [campaign, a.id]);
    await as(GM, `select set_active_map($1, $2)`, [campaign, b.id]);
    expect(await as(P1, `select name from campaign_maps where campaign_id = $1 and active`, [campaign])).toEqual([{ name: 'Floresta' }]);
    await fails(as(P1, `select set_active_map($1, $2)`, [campaign, a.id]), /not_gm/);
    await as(GM, `select set_active_map($1, null)`, [campaign]);
    expect(await as(P1, `select 1 from campaign_maps where campaign_id = $1 and active`, [campaign])).toEqual([]);
  });
  it('map images: only the GM of that campaign writes in its folder', async () => {
    await as(GM, `insert into storage.objects (bucket_id, name) values ('maps', $1)`, [`${campaign}/a.png`]);
    await fails(as(P1, `insert into storage.objects (bucket_id, name) values ('maps', $1)`, [`${campaign}/b.png`]), /row-level security/);
    await fails(as(GM, `insert into storage.objects (bucket_id, name) values ('maps', 'not-a-uuid/c.png')`), /row-level security/);
  });
});

describe('phase 8b: tokens', () => {
  let map = '';
  let mine = '';
  let foe = '';
  it('the GM places tokens; players see only the visible ones', async () => {
    [{ id: map }] = await as<{ id: string }>(GM, `insert into campaign_maps (campaign_id, image_url, width, height) values ($1, 'u', 1000, 1000) returning id`, [campaign]);
    [{ id: mine }] = await as<{ id: string }>(GM, `insert into map_tokens (campaign_id, map_id, name, owner, color) values ($1, $2, 'Voss', $3, 'ally') returning id`, [campaign, map, P1]);
    [{ id: foe }] = await as<{ id: string }>(GM, `insert into map_tokens (campaign_id, map_id, name, color, hidden) values ($1, $2, 'Goblin', 'enemy', true) returning id`, [campaign, map]);
    await fails(as(P1, `insert into map_tokens (campaign_id, map_id) values ($1, $2)`, [campaign, map]), /row-level security/);
    expect((await as(P1, `select name from map_tokens where map_id = $1`, [map])).map((r) => r.name)).toEqual(['Voss']);
    expect(await as(OUT, `select 1 from map_tokens where map_id = $1`, [map])).toEqual([]);
  });
  it('a player moves only their own token; the GM moves any, in groups', async () => {
    await as(P1, `select move_tokens($1, $2, $3)`, [[mine], [150], [250]]);
    expect(await as(GM, `select x, y from map_tokens where id = $1`, [mine])).toEqual([{ x: 150, y: 250 }]);
    await fails(as(P2, `select move_tokens($1, $2, $3)`, [[mine], [1], [1]]), /not_allowed/);
    await fails(as(P1, `select move_tokens($1, $2, $3)`, [[mine, foe], [1, 1], [1, 1]]), /not_allowed/);
    expect(await as(GM, `select x from map_tokens where id = $1`, [mine])).toEqual([{ x: 150 }]);
    await as(GM, `select move_tokens($1, $2, $3)`, [[mine, foe], [10, 20], [30, 40]]);
    expect(await as(GM, `select name, x, y from map_tokens where map_id = $1 order by name`, [map])).toEqual([{ name: 'Goblin', x: 20, y: 40 }, { name: 'Voss', x: 10, y: 30 }]);
    const upd = await as(P1, `update map_tokens set size = 4 where id = $1 returning id`, [mine]);
    expect(upd).toEqual([]);
  });
});
