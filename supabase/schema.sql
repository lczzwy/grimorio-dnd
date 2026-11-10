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

-- quem criou cada item de homebrew da campanha (só essa pessoa ou o mestre editam e apagam)
alter table public.campaign_homebrew add column if not exists created_by uuid references auth.users (id) on delete cascade default auth.uid();
update public.campaign_homebrew set created_by = updated_by where created_by is null;
alter table public.campaign_homebrew alter column created_by set not null;

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

-- erros que aconteceram na tela de alguém (só inserção; leitura só pelo painel do Supabase)
create table if not exists public.client_errors (
  id bigserial primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  message text not null check (char_length(message) between 1 and 2000),
  stack text check (stack is null or char_length(stack) <= 8000),
  url text check (url is null or char_length(url) <= 500),
  agent text check (agent is null or char_length(agent) <= 300),
  created_at timestamptz not null default now()
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
  -- nome do cadastro por e-mail; ou, entrando pelo Discord, o nome de exibição e depois o usuário (sem o "#0")
  insert into profiles (id, display_name)
  values (new.id, coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data -> 'custom_claims' ->> 'global_name', ''),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), '#0$', ''), ''),
    split_part(coalesce(new.email, ''), '@', 1)))
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

-- o nome do autor no chat vem do perfil, não do navegador
create or replace function public.chat_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.author := coalesce((select display_name from profiles where id = new.user_id), '');
  return new;
end $$;
drop trigger if exists on_chat_insert on public.chat_messages;
create trigger on_chat_insert before insert on public.chat_messages for each row execute function public.chat_author();

-- chat: no máximo 5 mensagens a cada 3 segundos por pessoa (contra spam); inserções do próprio servidor passam
create or replace function public.chat_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
    select count(*) from chat_messages where user_id = auth.uid() and created_at > clock_timestamp() - interval '3 seconds'
  ) >= 5 then
    raise exception 'too_fast';
  end if;
  return new;
end $$;
drop trigger if exists on_chat_guard on public.chat_messages;
create trigger on_chat_guard before insert on public.chat_messages for each row execute function public.chat_guard();

-- chat: guarda só as 500 mensagens mais novas de cada campanha
create or replace function public.trim_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from chat_messages where campaign_id = new.campaign_id and id in (
    select id from chat_messages where campaign_id = new.campaign_id order by created_at desc offset 500
  );
  return null;
end $$;
drop trigger if exists on_chat_trim on public.chat_messages;
create trigger on_chat_trim after insert on public.chat_messages for each row execute function public.trim_chat();

-- registro de erros: guarda só os 1000 mais novos
create or replace function public.trim_client_errors() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from client_errors where id <= new.id - 1000;
  return null;
end $$;
drop trigger if exists on_client_error on public.client_errors;
create trigger on_client_error after insert on public.client_errors for each row execute function public.trim_client_errors();

-- quem sai da campanha (ou troca de personagem) sai também da ordem de combate
create or replace function public.member_left_fight() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.character_id is not null and (tg_op = 'DELETE' or new.character_id is distinct from old.character_id) then
    delete from combatants where campaign_id = old.campaign_id and kind = 'player' and character_id = old.character_id;
  end if;
  return null;
end $$;
drop trigger if exists on_member_left on public.campaign_members;
create trigger on_member_left after delete or update of character_id on public.campaign_members
  for each row execute function public.member_left_fight();

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

-- ---- dados sorteados no servidor: ninguém manda um resultado pronto, ninguém edita depois ----
-- Fórmulas como "1d20+5", "2d6+1d4-1". Vantagem/desvantagem valem quando a fórmula começa com 1d20;
-- crítico dobra todos os dados. Devolve a linha gravada em rolls (que o tempo real espalha para a mesa).
create or replace function public.roll_dice(
  campaign uuid, formula text, label text default '', mode text default 'normal', crit boolean default false, hidden boolean default false
) returns public.rolls
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  f text := lower(regexp_replace(coalesce(formula, ''), '\s+', '', 'g'));
  m text[];
  rebuilt text := '';
  n_terms int := 0;
  n_dice int := 0;
  sgn int;
  cnt int;
  sides int;
  times int;
  mods int := 0;
  kept int[] := '{}';
  dropped_v int[] := null;
  tot int := 0;
  is_first boolean := true;
  single_d20 boolean := false;
  a int; b int; v int; keep int;
  nat int := null;
  knd text := null;
  who text;
  r public.rolls;
begin
  if not is_member(campaign) then raise exception 'forbidden'; end if;
  if mode is null or mode not in ('normal', 'adv', 'dis') then mode := 'normal'; end if;
  if f = '' or length(f) > 100 then raise exception 'bad_formula'; end if;

  for m in select regexp_matches(f, '(([+-]?)([0-9]*)d([0-9]+)|([+-]?)([0-9]+))', 'g') loop
    rebuilt := rebuilt || m[1];
    n_terms := n_terms + 1;
    if n_terms > 30 then raise exception 'bad_formula'; end if;
    if m[4] is not null then
      sgn := case when m[2] = '-' then -1 else 1 end;
      if length(m[3]) > 3 or length(m[4]) > 4 then raise exception 'bad_formula'; end if;
      cnt := coalesce(nullif(m[3], ''), '1')::int;
      sides := m[4]::int;
      if cnt < 1 or cnt > 100 or sides < 1 or sides > 1000 then raise exception 'bad_formula'; end if;
      if is_first and sides = 20 and cnt = 1 then single_d20 := true; end if;
      times := cnt * case when crit then 2 else 1 end;
      n_dice := n_dice + times;
      if n_dice > 200 then raise exception 'bad_formula'; end if;
      if is_first and single_d20 and mode <> 'normal' then
        a := floor(random() * 20)::int + 1;
        b := floor(random() * 20)::int + 1;
        keep := case when mode = 'adv' then greatest(a, b) else least(a, b) end;
        dropped_v := array[case when keep = a then b else a end];
        kept := kept || keep;
        tot := tot + sgn * keep;
        nat := keep;
      else
        for i in 1..times loop
          v := floor(random() * sides)::int + 1;
          kept := kept || v;
          tot := tot + sgn * v;
          if is_first and single_d20 then nat := v; end if;
        end loop;
      end if;
      is_first := false;
    else
      if length(m[6]) > 4 then raise exception 'bad_formula'; end if;
      mods := mods + (case when m[5] = '-' then -1 else 1 end) * m[6]::int;
    end if;
  end loop;
  if rebuilt <> f or n_dice = 0 then raise exception 'bad_formula'; end if;
  tot := tot + mods;

  if single_d20 and nat is not null then
    knd := case when nat = 20 then 'crit' when nat = 1 then 'fumble' when mode <> 'normal' then mode else null end;
  end if;
  select display_name into who from profiles where id = auth.uid();

  insert into rolls (campaign_id, user_id, author, label, formula, rolls, dropped, total, kind, hidden)
  values (campaign, auth.uid(), coalesce(who, ''), left(coalesce(label, ''), 200), f, kept, dropped_v, tot, knd, coalesce(hidden, false))
  returning * into r;
  return r;
end $$;

-- revelar uma rolagem oculta: só quem rolou ou o mestre, e só muda o "oculto"
create or replace function public.reveal_roll(roll uuid) returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
begin
  update rolls set hidden = false where id = roll and (user_id = auth.uid() or is_gm(campaign_id));
  if not found then raise exception 'forbidden'; end if;
end $$;

-- jogador grava a própria iniciativa a partir de uma rolagem de d20 que o servidor fez para ele
-- (entra no combate se ainda não estiver); a versão antiga, que aceitava um número, foi removida
drop function if exists public.roll_my_initiative(uuid, int);
create or replace function public.roll_my_initiative(campaign uuid, roll uuid) returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare ch text; nm text; img text; val int;
begin
  if not is_member(campaign) then raise exception 'forbidden'; end if;
  select r.total into val from rolls r
  where r.id = roll and r.campaign_id = campaign and r.user_id = auth.uid()
    and r.formula ~ '^1d20([+-][0-9]{1,2})?$' and r.created_at > clock_timestamp() - interval '10 minutes';
  if val is null then raise exception 'bad_roll'; end if;
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

-- keep-alive: o GitHub Actions chama isto toda semana para o projeto grátis não ser pausado
create or replace function public.ping() returns boolean
language sql stable as $$ select true $$;

-- salvar a ficha com checagem de versão: só grava em cima da versão que o aparelho viu por último.
-- Se alguém mudou no meio do caminho (dano do mestre, outro aparelho), devolve a cópia do servidor
-- para o site juntar as duas, em vez de apagar a mudança do outro.
create or replace function public.save_character(ch_id text, ch_edition text, ch_name text, ch_data jsonb, base_version int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur_owner uuid; cur_version int; cur_data jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if ch_edition not in ('2014', '2024') then raise exception 'bad_edition'; end if;
  select owner, version, data into cur_owner, cur_version, cur_data from characters where id = ch_id for update;
  if not found then
    insert into characters (id, owner, edition, name, data, updated_at, version)
    values (ch_id, auth.uid(), ch_edition, coalesce(ch_name, ''), ch_data, clock_timestamp(), 1);
    return jsonb_build_object('status', 'ok', 'version', 1);
  end if;
  if cur_owner <> auth.uid() then raise exception 'not_owner'; end if;
  if base_version is null or base_version < cur_version then
    return jsonb_build_object('status', 'conflict', 'version', cur_version, 'data', cur_data);
  end if;
  update characters set edition = ch_edition, name = coalesce(ch_name, ''), data = ch_data, updated_at = clock_timestamp(), version = cur_version + 1
  where id = ch_id;
  return jsonb_build_object('status', 'ok', 'version', cur_version + 1);
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
alter table public.client_errors enable row level security;

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
create policy homebrew_insert on public.campaign_homebrew for insert with check (is_member(campaign_id) and updated_by = auth.uid() and created_by = auth.uid());
drop policy if exists homebrew_update on public.campaign_homebrew;
create policy homebrew_update on public.campaign_homebrew for update using (created_by = auth.uid() or is_gm(campaign_id)) with check (is_member(campaign_id) and updated_by = auth.uid());
drop policy if exists homebrew_delete on public.campaign_homebrew;
create policy homebrew_delete on public.campaign_homebrew for delete using (created_by = auth.uid() or is_gm(campaign_id));

drop policy if exists rolls_select on public.rolls;
create policy rolls_select on public.rolls for select using (is_member(campaign_id) and (not hidden or user_id = auth.uid() or is_gm(campaign_id)));
-- rolagens só nascem por roll_dice() e só mudam por reveal_roll(): sem insert/update direto
drop policy if exists rolls_insert on public.rolls;
drop policy if exists rolls_update on public.rolls;
drop policy if exists rolls_delete on public.rolls;
create policy rolls_delete on public.rolls for delete using (is_gm(campaign_id));

drop policy if exists errors_insert on public.client_errors;
create policy errors_insert on public.client_errors for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());

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
revoke insert, update on public.rolls from authenticated;
grant execute on function
  public.join_campaign(text), public.set_member_character(uuid, text), public.set_member_color(uuid, text), public.roll_my_initiative(uuid, uuid), public.new_invite_code(uuid),
  public.roll_dice(uuid, text, text, text, boolean, boolean), public.reveal_roll(uuid), public.save_character(text, text, text, jsonb, int),
  public.gm_apply(text, uuid, int, int, text[], text[], int), public.hp_band(int, int)
  to authenticated;

grant execute on function public.ping() to anon, authenticated;
-- registro de erros: só inserir (ninguém lê pelo site)
revoke all on public.client_errors from anon, authenticated;
grant insert on public.client_errors to anon, authenticated;
grant usage on sequence public.client_errors_id_seq to anon, authenticated;

-- ---------------------------------------------------------------- fotos (Supabase Storage)
-- Balde público "portraits": qualquer um vê uma foto pelo endereço; cada pessoa só envia, troca e
-- apaga arquivos dentro da própria pasta (<id do usuário>/...). Fotos até 1 MB, só jpeg/png/webp.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('portraits', 'portraits', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists portraits_select on storage.objects';
    execute $p$create policy portraits_select on storage.objects for select to authenticated
      using (bucket_id = 'portraits' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute 'drop policy if exists portraits_insert on storage.objects';
    execute $p$create policy portraits_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'portraits' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute 'drop policy if exists portraits_update on storage.objects';
    execute $p$create policy portraits_update on storage.objects for update to authenticated
      using (bucket_id = 'portraits' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'portraits' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute 'drop policy if exists portraits_delete on storage.objects';
    execute $p$create policy portraits_delete on storage.objects for delete to authenticated
      using (bucket_id = 'portraits' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

-- ---------------------------------------------------------------- mapa tático (Fase 8)
-- Cada campanha guarda vários mapas; no máximo um fica ativo e aparece na mesa de todos.
-- A grade é guardada em pixels da imagem original: tamanho da célula e deslocamento.
create table if not exists public.campaign_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null default 'Mapa',
  image_url text not null,
  width int not null check (width > 0),
  height int not null check (height > 0),
  grid_size real not null default 70 check (grid_size >= 8),
  grid_x real not null default 0,
  grid_y real not null default 0,
  show_grid boolean not null default true,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists campaign_maps_one_active on public.campaign_maps (campaign_id) where active;
create index if not exists campaign_maps_campaign on public.campaign_maps (campaign_id);
alter table public.campaign_maps enable row level security;
drop policy if exists maps_select on public.campaign_maps;
create policy maps_select on public.campaign_maps for select using (is_member(campaign_id));
drop policy if exists maps_insert on public.campaign_maps;
create policy maps_insert on public.campaign_maps for insert with check (is_gm(campaign_id) and not active);
drop policy if exists maps_update on public.campaign_maps;
create policy maps_update on public.campaign_maps for update using (is_gm(campaign_id)) with check (is_gm(campaign_id));
drop policy if exists maps_delete on public.campaign_maps;
create policy maps_delete on public.campaign_maps for delete using (is_gm(campaign_id));

-- troca o mapa ativo de uma vez (null tira o mapa da mesa e volta o feltro)
create or replace function public.set_active_map(campaign uuid, map uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_gm(campaign) then raise exception 'not_gm'; end if;
  if map is not null and not exists (select 1 from campaign_maps where id = map and campaign_id = campaign) then
    raise exception 'map_not_found';
  end if;
  update campaign_maps set active = false where campaign_id = campaign and active and id is distinct from map;
  if map is not null then update campaign_maps set active = true where id = map; end if;
end $$;

-- pasta de imagens de mapa: <id da campanha>/arquivo; só o mestre daquela campanha escreve
create or replace function public.is_gm_folder(folder text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return is_gm(folder::uuid);
exception when others then
  return false;
end $$;

grant select, insert, update, delete on public.campaign_maps to authenticated;
revoke all on public.campaign_maps from anon;
grant execute on function public.set_active_map(uuid, uuid), public.is_gm_folder(text) to authenticated;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('maps', 'maps', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    execute 'drop policy if exists maps_obj_insert on storage.objects';
    execute $p$create policy maps_obj_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'maps' and public.is_gm_folder((storage.foldername(name))[1]))$p$;
    execute 'drop policy if exists maps_obj_select on storage.objects';
    execute $p$create policy maps_obj_select on storage.objects for select to authenticated
      using (bucket_id = 'maps' and public.is_gm_folder((storage.foldername(name))[1]))$p$;
    execute 'drop policy if exists maps_obj_delete on storage.objects';
    execute $p$create policy maps_obj_delete on storage.objects for delete to authenticated
      using (bucket_id = 'maps' and public.is_gm_folder((storage.foldername(name))[1]))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------- tempo real

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['characters', 'campaign_members', 'campaign_homebrew', 'rolls', 'encounters', 'combatants', 'chat_messages', 'campaign_maps'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
