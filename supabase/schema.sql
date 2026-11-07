-- =====================================================================
-- Grimório · mesa online · esquema do banco (Supabase / Postgres)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Pode ser executado de novo a cada versão: tudo aqui é idempotente.
-- =====================================================================

-- ---------------------------------------------------------------- tabelas

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.characters (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  edition text not null check (edition in ('2014', '2024')),
  name text not null default '',
  data jsonb not null,
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create index if not exists characters_owner_idx on public.characters (owner);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  edition text not null check (edition in ('2014', '2024')),
  gm uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invite_code text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('gm', 'player')),
  character_id text references public.characters (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index if not exists campaign_members_user_idx on public.campaign_members (user_id);
create index if not exists campaign_members_character_idx on public.campaign_members (character_id);

create table if not exists public.campaign_homebrew (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  kind text not null,
  id text not null,
  item jsonb not null,
  updated_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, kind, id)
);

create table if not exists public.rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author text not null default '',
  label text not null default '',
  formula text not null default '',
  rolls int[] not null default '{}',
  dropped int[],
  total int not null,
  kind text,
  hidden boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists rolls_campaign_idx on public.rolls (campaign_id, created_at desc);

-- chat da mesa (texto ao vivo para quem está sem microfone)
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author text not null default '',
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists chat_campaign_idx on public.chat_messages (campaign_id, created_at desc);

-- cor de cada jogador na mesa (chat e dados)
alter table public.campaign_members add column if not exists color text check (color ~ '^#[0-9a-f]{6}$');

create table if not exists public.encounters (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  active boolean not null default false,
  round int not null default 1,
  turn int not null default 0
);

-- bestiário do mestre: criaturas próprias, guardadas na conta e reaproveitadas em qualquer campanha
create table if not exists public.creatures (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  edition text not null default '2014' check (edition in ('2014', '2024')),
  name text not null check (char_length(name) between 1 and 120),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists creatures_owner_idx on public.creatures (owner);

-- o mestre pede iniciativa: cada jogador vê um botão para rolar a sua
alter table public.encounters add column if not exists init_call boolean not null default false;

create table if not exists public.combatants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  kind text not null check (kind in ('player', 'monster', 'npc')),
  character_id text references public.characters (id) on delete cascade,
  name text not null,
  image text,
  initiative int,
  hp_band text not null default 'ileso',
  conditions text[] not null default '{}',
  effects jsonb not null default '[]',
  visible boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists combatants_campaign_idx on public.combatants (campaign_id);

create table if not exists public.combatant_secrets (
  combatant_id uuid primary key references public.combatants (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  hp_current int not null default 0,
  hp_max int not null default 0,
  hp_temp int not null default 0,
  ac int,
  stat jsonb,
  attacks jsonb not null default '[]',
  notes text not null default ''
);

-- ---------------------------------------------------------------- helpers

create or replace function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from campaign_members where campaign_id = c and user_id = auth.uid());
$$;

create or replace function public.is_gm(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from campaigns where id = c and gm = auth.uid());
$$;

-- a character is visible to everyone who shares a campaign where it is in play
create or replace function public.shares_character(ch text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from campaign_members m
    join campaign_members me on me.campaign_id = m.campaign_id and me.user_id = auth.uid()
    where m.character_id = ch
  );
$$;

create or replace function public.shares_campaign_with(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from campaign_members a
    join campaign_members b on b.campaign_id = a.campaign_id
    where a.user_id = auth.uid() and b.user_id = u
  );
$$;

create or replace function public.hp_band(cur int, mx int) returns text
language sql immutable as $$
  select case
    when cur <= 0 then 'caido'
    when mx <= 0 or cur >= mx then 'ileso'
    when cur * 2 >= mx then 'ferido'
    when cur * 4 >= mx then 'sangrando'
    else 'quase morto'
  end;
$$;

-- ---------------------------------------------------------------- triggers

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.handle_new_campaign() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into campaign_members (campaign_id, user_id, role) values (new.id, new.gm, 'gm') on conflict do nothing;
  insert into encounters (campaign_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_campaign_created on public.campaigns;
create trigger on_campaign_created after insert on public.campaigns for each row execute function public.handle_new_campaign();

create or replace function public.trim_rolls() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from rolls where campaign_id = new.campaign_id and id in (
    select id from rolls where campaign_id = new.campaign_id order by created_at desc offset 200
  );
  return null;
end $$;
drop trigger if exists on_roll_inserted on public.rolls;
create trigger on_roll_inserted after insert on public.rolls for each row execute function public.trim_rolls();

create or replace function public.sync_hp_band() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update combatants set hp_band = hp_band(new.hp_current, new.hp_max) where id = new.combatant_id;
  return new;
end $$;
drop trigger if exists on_secret_changed on public.combatant_secrets;
create trigger on_secret_changed after insert or update of hp_current, hp_max on public.combatant_secrets
  for each row execute function public.sync_hp_band();

-- ---------------------------------------------------------------- funções chamadas pelo site

create or replace function public.join_campaign(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select id into cid from campaigns where invite_code = code;
  if cid is null then raise exception 'invalid_invite'; end if;
  insert into campaign_members (campaign_id, user_id, role) values (cid, auth.uid(), 'player') on conflict do nothing;
  return cid;
end $$;

create or replace function public.set_member_character(campaign uuid, ch text) returns void
language plpgsql security definer set search_path = public as $$
declare ed text; c_ed text; c_owner uuid;
begin
  if not is_member(campaign) then raise exception 'forbidden'; end if;
  if ch is not null then
    select edition, owner into c_ed, c_owner from characters where id = ch;
    if c_owner is null or c_owner <> auth.uid() then raise exception 'not_owner'; end if;
    select edition into ed from campaigns where id = campaign;
    if ed <> c_ed then raise exception 'edition_mismatch'; end if;
  end if;
  update campaign_members set character_id = ch where campaign_id = campaign and user_id = auth.uid();
end $$;

create or replace function public.set_member_color(campaign uuid, c text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(campaign) then raise exception 'forbidden'; end if;
  if c is not null and c !~ '^#[0-9a-f]{6}$' then raise exception 'bad_color'; end if;
  update campaign_members set color = c where campaign_id = campaign and user_id = auth.uid();
end $$;

-- jogador grava a própria iniciativa (entra no combate se ainda não estiver)
create or replace function public.roll_my_initiative(campaign uuid, val int) returns void
language plpgsql security definer set search_path = public as $$
declare ch text; nm text; img text;
begin
  if not is_member(campaign) then raise exception 'forbidden'; end if;
  if val is null or val < -10 or val > 60 then raise exception 'bad_value'; end if;
  select character_id into ch from campaign_members where campaign_id = campaign and user_id = auth.uid();
  if ch is null then raise exception 'no_character'; end if;
  update combatants set initiative = val where campaign_id = campaign and character_id = ch;
  if not found then
    select name, data ->> 'portrait' into nm, img from characters where id = ch;
    insert into combatants (campaign_id, kind, character_id, name, image, initiative)
    values (campaign, 'player', ch, coalesce(nullif(nm, ''), 'Jogador'), img, val);
  end if;
end $$;

create or replace function public.new_invite_code(campaign uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not is_gm(campaign) then raise exception 'forbidden'; end if;
  code := substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  update campaigns set invite_code = code where id = campaign;
  return code;
end $$;

-- Mestre altera PV / PV temporário / condições de um personagem da campanha, sem reescrever a ficha.
create or replace function public.gm_apply(
  ch text, campaign uuid, delta_hp int, temp_hp int, add_conditions text[], remove_conditions text[], max_hp int default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; cur int; tmp int; dmg int; conds text[];
begin
  if not is_gm(campaign) or not exists (select 1 from campaign_members where campaign_id = campaign and character_id = ch) then
    raise exception 'forbidden';
  end if;
  select data into d from characters where id = ch for update;
  cur := coalesce((d -> 'hp' ->> 'current')::int, 0);
  tmp := coalesce((d -> 'hp' ->> 'temp')::int, 0);

  if delta_hp is not null and delta_hp < 0 then
    dmg := -delta_hp;
    if tmp >= dmg then tmp := tmp - dmg; dmg := 0; else dmg := dmg - tmp; tmp := 0; end if;
    cur := greatest(0, cur - dmg);
    if cur = 0 then d := d - 'concentration'; end if;
  elsif delta_hp is not null and delta_hp > 0 then
    if cur = 0 then d := jsonb_set(d, '{deathSaves}', '{"success":0,"fail":0}'); end if;
    cur := cur + delta_hp;
    if max_hp is not null then cur := least(cur, max_hp); end if;
  end if;
  if temp_hp is not null then tmp := greatest(tmp, temp_hp); end if; -- temporary hit points don't stack

  d := jsonb_set(d, '{hp,current}', to_jsonb(cur));
  d := jsonb_set(d, '{hp,temp}', to_jsonb(tmp));

  if add_conditions is not null or remove_conditions is not null then
    select coalesce(array_agg(distinct x order by x), '{}') into conds from (
      select jsonb_array_elements_text(coalesce(d -> 'conditions', '[]')) as x
      union select unnest(coalesce(add_conditions, '{}'))
    ) s where not (x = any (coalesce(remove_conditions, '{}')));
    d := jsonb_set(d, '{conditions}', to_jsonb(conds));
  end if;

  d := jsonb_set(d, '{updatedAt}', to_jsonb((extract(epoch from clock_timestamp()) * 1000)::bigint));
  update characters set data = d, updated_at = clock_timestamp(), version = version + 1 where id = ch;
  return d;
end $$;

-- ---------------------------------------------------------------- segurança (RLS)

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_homebrew enable row level security;
alter table public.rolls enable row level security;
alter table public.encounters enable row level security;
alter table public.combatants enable row level security;
alter table public.combatant_secrets enable row level security;
alter table public.chat_messages enable row level security;
alter table public.creatures enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid() or shares_campaign_with(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists characters_select on public.characters;
create policy characters_select on public.characters for select using (owner = auth.uid() or shares_character(id));
drop policy if exists characters_insert on public.characters;
create policy characters_insert on public.characters for insert with check (owner = auth.uid());
drop policy if exists characters_update on public.characters;
create policy characters_update on public.characters for update using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists characters_delete on public.characters;
create policy characters_delete on public.characters for delete using (owner = auth.uid());

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select using (is_member(id) or gm = auth.uid());
drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns for insert with check (gm = auth.uid());
drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns for update using (gm = auth.uid()) with check (gm = auth.uid());
drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns for delete using (gm = auth.uid());

drop policy if exists members_select on public.campaign_members;
create policy members_select on public.campaign_members for select using (is_member(campaign_id));
drop policy if exists members_delete on public.campaign_members;
create policy members_delete on public.campaign_members for delete using (user_id = auth.uid() or is_gm(campaign_id));

drop policy if exists homebrew_select on public.campaign_homebrew;
create policy homebrew_select on public.campaign_homebrew for select using (is_member(campaign_id));
drop policy if exists homebrew_insert on public.campaign_homebrew;
create policy homebrew_insert on public.campaign_homebrew for insert with check (is_member(campaign_id) and updated_by = auth.uid());
drop policy if exists homebrew_update on public.campaign_homebrew;
create policy homebrew_update on public.campaign_homebrew for update using (is_member(campaign_id)) with check (is_member(campaign_id) and updated_by = auth.uid());
drop policy if exists homebrew_delete on public.campaign_homebrew;
create policy homebrew_delete on public.campaign_homebrew for delete using (updated_by = auth.uid() or is_gm(campaign_id));

drop policy if exists rolls_select on public.rolls;
create policy rolls_select on public.rolls for select using (is_member(campaign_id) and (not hidden or user_id = auth.uid() or is_gm(campaign_id)));
drop policy if exists rolls_insert on public.rolls;
create policy rolls_insert on public.rolls for insert with check (is_member(campaign_id) and user_id = auth.uid());
drop policy if exists rolls_update on public.rolls;
create policy rolls_update on public.rolls for update using (user_id = auth.uid() or is_gm(campaign_id)) with check (is_member(campaign_id));
drop policy if exists rolls_delete on public.rolls;
create policy rolls_delete on public.rolls for delete using (is_gm(campaign_id));

drop policy if exists creatures_own on public.creatures;
create policy creatures_own on public.creatures for all using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists chat_select on public.chat_messages;
create policy chat_select on public.chat_messages for select using (is_member(campaign_id));
drop policy if exists chat_insert on public.chat_messages;
create policy chat_insert on public.chat_messages for insert with check (is_member(campaign_id) and user_id = auth.uid());
drop policy if exists chat_delete on public.chat_messages;
create policy chat_delete on public.chat_messages for delete using (user_id = auth.uid() or is_gm(campaign_id));

drop policy if exists encounters_select on public.encounters;
create policy encounters_select on public.encounters for select using (is_member(campaign_id));
drop policy if exists encounters_write on public.encounters;
create policy encounters_write on public.encounters for all using (is_gm(campaign_id)) with check (is_gm(campaign_id));

drop policy if exists combatants_select on public.combatants;
create policy combatants_select on public.combatants for select using (is_member(campaign_id) and (visible or is_gm(campaign_id)));
drop policy if exists combatants_write on public.combatants;
create policy combatants_write on public.combatants for all using (is_gm(campaign_id)) with check (is_gm(campaign_id));

drop policy if exists secrets_all on public.combatant_secrets;
create policy secrets_all on public.combatant_secrets for all using (is_gm(campaign_id)) with check (is_gm(campaign_id));

-- ---------------------------------------------------------------- permissões (expose automático está desligado)

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles, public.characters, public.campaigns, public.campaign_members, public.campaign_homebrew,
  public.rolls, public.encounters, public.combatants, public.combatant_secrets, public.chat_messages, public.creatures
  to authenticated;
revoke all on
  public.profiles, public.characters, public.campaigns, public.campaign_members, public.campaign_homebrew,
  public.rolls, public.encounters, public.combatants, public.combatant_secrets, public.chat_messages, public.creatures
  from anon;
grant execute on function
  public.join_campaign(text), public.set_member_character(uuid, text), public.set_member_color(uuid, text), public.roll_my_initiative(uuid, int), public.new_invite_code(uuid),
  public.gm_apply(text, uuid, int, int, text[], text[], int), public.hp_band(int, int)
  to authenticated;

-- ---------------------------------------------------------------- tempo real

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['characters', 'campaign_members', 'campaign_homebrew', 'rolls', 'encounters', 'combatants', 'chat_messages'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
