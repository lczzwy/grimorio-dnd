# Mesa online (etapa 2): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** contas, fichas sincronizadas na nuvem, campanhas com mestre e jogadores, mesa ao vivo, rolagens compartilhadas, combate com inimigos e homebrew da campanha.

**Architecture:** Supabase (Postgres + RLS + Realtime + Auth) como backend; o site estático continua "local primeiro": o store zustand é a fonte da tela, e a camada `src/cloud/` sincroniza documentos `jsonb` (ficha inteira) e assina mudanças em tempo real. Tudo o que é privilegiado (ações do mestre, entrar por convite, segredos de inimigos) fica em funções `security definer` e regras RLS.

**Tech Stack:** React 19 + Vite 6 + TypeScript + zustand 5 (existentes), `@supabase/supabase-js@2.49.4`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-mesa-online-design.md`

## Global Constraints

- URL do projeto: `https://lnvrptqcjcmvsmeprkfk.supabase.co`; chave publishable: `sb_publishable_HN9cHvf4pyr2euRV5hkBBA_tStDi1z8`. Nenhuma chave secreta ou service_role no repositório.
- Sem login, o site funciona exatamente como hoje (modo local).
- Fichas locais nunca são apagadas pela sincronização; conflito por personagem = vence o `updated_at` mais novo.
- Jogador nunca lê `combatant_secrets`, combatentes com `visible = false` nem rolagens `hidden` de outros (o mestre lê tudo da campanha).
- O mestre só altera personagens de jogadores via `gm_apply`.
- Toda tabela nova tem RLS ligado e `grant` explícito (expose automático está desligado no projeto).
- Faixas de vida: 100% `ileso`; ≥ 50% `ferido`; ≥ 25% `sangrando`; > 0 `quase morto`; 0 `caido`.
- Feed guarda no máximo 200 rolagens por campanha.
- Monstros só do SRD (CC-BY-4.0); conteúdo de outros livros só como homebrew da campanha, nunca no repo.
- Textos da interface em PT-BR, seguindo o visual atual (`index.css`).

## Review Focus

1. **Supabase fora do ar ou sem internet**: a ficha continua editável localmente e a sincronização tenta de novo depois, sem travar a tela nem perder edição (Task 3: teste da fila de envio com falha).
2. **Mudança remota chegando enquanto o dono edita**: uma versão remota **mais antiga** que a local nunca sobrescreve (Task 3: `mergeRemote` com local mais novo).
3. **Convite inválido ou de campanha apagada**: mensagem clara, sem tela em branco (Task 4: `join_campaign` com código inexistente → erro tratado).
4. **Jogador tentando ler segredos pela API**: nega (Task 1: `tests.sql`, casos de leitura negada).
5. **Personagem de edição diferente da campanha**: não aparece para escolha e `set_member_character` recusa (Task 1 + Task 4).

---

### Task 1: Esquema do banco, RLS e funções

**Files:**
- Create: `supabase/schema.sql` (idempotente: `create table if not exists`, `create or replace function`, `drop policy if exists` + `create policy`)
- Create: `supabase/tests.sql` (roda em transação com `rollback`)

**Interfaces (produz):** tabelas `profiles, characters, campaigns, campaign_members, campaign_homebrew, rolls, encounters, combatants, combatant_secrets` com as colunas do spec; funções:
- `join_campaign(code text) returns uuid` (campaign id; erro `invalid_invite` se não existir)
- `set_member_character(campaign uuid, character text) returns void` (erro `edition_mismatch`)
- `gm_apply(character text, campaign uuid, delta_hp int, temp_hp int, add_conditions text[], remove_conditions text[]) returns jsonb` (nova `data`)
- `new_invite_code(campaign uuid) returns text`
- `hp_band(cur int, max int) returns text` + trigger em `combatant_secrets` que atualiza `combatants.hp_band`
- helpers `is_member(campaign uuid)`, `is_gm(campaign uuid)` (`stable`, `security definer`)
- trigger `on auth.users insert` → `profiles`; trigger em `rolls` que apaga além das 200 mais novas por campanha
- `alter publication supabase_realtime add table characters, rolls, encounters, combatants, campaign_members, campaign_homebrew`

- [ ] **Step 1:** escrever `supabase/tests.sql` com, no mínimo: jogador A não lê personagem de B fora de campanha; dentro da mesma campanha lê, mas `update` falha; jogador não lê `combatant_secrets`; jogador não vê combatente `visible=false`; jogador não vê rolagem `hidden` de outro, mestre vê; `gm_apply` por não-mestre → erro; `gm_apply` pelo mestre reduz `data->'hp'->>'current'` respeitando PV temporário e mínimo 0; `hp_band(30,60)='ferido'`, `(14,60)='quase morto'`, `(0,60)='caido'`, `(60,60)='ileso'`; `join_campaign('xxx')` → `invalid_invite`; `set_member_character` com edição diferente → `edition_mismatch`.
- [ ] **Step 2:** escrever `supabase/schema.sql` até os testes passarem (o usuário roda no SQL Editor; resultado esperado: o bloco de testes termina sem `exception`).
- [ ] **Step 3:** commit `feat(db): esquema da mesa online com RLS e funções`.

### Task 2: Cliente Supabase, conta e login

**Files:**
- Create: `src/cloud/client.ts`, `src/cloud/auth.ts`, `src/pages/Account.tsx`
- Modify: `src/App.tsx` (rotas `#/conta`, link "Entrar"/avatar na topbar), `package.json`

**Interfaces (produz):**
- `supabase: SupabaseClient` (de `client.ts`)
- `useAuth(): { user: User | null; profile: { id: string; display_name: string } | null; loading: boolean }` (zustand)
- `signUp(email, password, displayName): Promise<void>`, `signIn(email, password): Promise<void>`, `signOut(): Promise<void>`, `updateDisplayName(name): Promise<void>`
- `go('conta?next=<rota>')` volta para `next` após login

- [ ] **Step 1:** instalar `@supabase/supabase-js@2.49.4`; `client.ts` com URL/chave das Global Constraints, `persistSession: true`.
- [ ] **Step 2:** `Account.tsx`: abas Entrar/Criar conta, erros traduzidos (`Invalid login credentials` → "E-mail ou senha incorretos"; senha < 6 → mensagem), estado logado com nome editável e Sair.
- [ ] **Step 3:** verificar no navegador: tela abre logado e deslogado sem erro de console; build passa.
- [ ] **Step 4:** commit `feat: contas com Supabase Auth`.

### Task 3: Sincronização das fichas

**Files:**
- Create: `src/cloud/merge.ts` + `src/cloud/merge.test.ts`, `src/cloud/sync.ts`
- Modify: `src/store.ts` (campo `cloud?: boolean` por personagem via `Character.cloud`), `src/data/types.ts`, `src/pages/Account.tsx` (botão "Enviar minhas fichas"), `src/pages/Roster.tsx` (ícone de nuvem; excluir apaga online após confirmar)

**Interfaces (produz):**
- `mergeRemote(local: Character | undefined, remote: Character): Character | null` (null = manter local)
- `class Uploader { schedule(c: Character): void; flush(): Promise<void>; pending(): number }` com retry exponencial (1s, 2s, 4s… máx 30s) quando `upsert` falha
- `startSync(userId: string): () => void` (baixa as fichas da conta, assina realtime das próprias, liga o envio automático; retorna unsubscribe)
- `watchCharacters(ids: string[], onChange: (c: Character) => void): () => void` (usado pela mesa)
- `deleteCloudCharacter(id: string): Promise<void>`

- [ ] **Step 1:** testes `merge.test.ts`: remoto mais novo substitui; remoto mais antigo → `null`; local inexistente → remoto; `Uploader` com `upsert` falhando 2× e depois ok → 1 envio final, `pending()` volta a 0, último estado enviado é o mais recente agendado.
- [ ] **Step 2:** rodar `npx vitest run src/cloud` → FAIL.
- [ ] **Step 3:** implementar `merge.ts` e `Uploader` (injeção da função de envio para testar sem rede); `sync.ts` liga ao store (`useApp.subscribe`) com debounce de 800 ms.
- [ ] **Step 4:** testes passam; verificar no navegador com uma conta: editar PV numa aba aparece em outra aba logada em ~2 s.
- [ ] **Step 5:** commit `feat: fichas sincronizadas na nuvem`.

### Task 4: Campanhas, convite e ajustes

**Files:**
- Create: `src/cloud/campaigns.ts`, `src/pages/Campaigns.tsx`, `src/pages/Invite.tsx`, `src/pages/Campaign.tsx` (casca com abas Mesa, Combate, Rolagens, Homebrew, Ajustes) + `src/pages/campaign/SettingsTab.tsx`
- Modify: `src/App.tsx` (rotas `#/campanhas`, `#/convite/:code`, `#/campanha/:id`; link "Campanhas" na topbar quando logado)

**Interfaces (produz):**
- `type Campaign = { id; name; edition: Edition; gm: string; invite_code: string }`; `type Member = { user_id; role: 'gm'|'player'; character_id: string|null; display_name: string }`
- `listCampaigns(): Promise<Campaign[]>`, `createCampaign(name, edition): Promise<Campaign>`, `joinCampaign(code): Promise<string>`, `setMyCharacter(campaignId, characterId)`, `listMembers(campaignId): Promise<Member[]>`, `removeMember(campaignId, userId)`, `regenerateInvite(campaignId): Promise<string>`
- `useCampaign(id): { campaign; members; isGm; loading; error }` (assina `campaign_members` em realtime)
- link de convite: `${location.origin}${location.pathname}#/convite/${code}`

- [ ] **Step 1:** implementar e verificar no navegador: criar campanha, copiar link, abrir em outra conta (do usuário), entrar, escolher personagem só da mesma edição; código inválido mostra "Convite inválido ou expirado"; convite aberto sem login vai para `#/conta?next=convite/<code>` e volta sozinho após entrar.
- [ ] **Step 2:** commit `feat: campanhas com convite`.

### Task 5: Aba Mesa (ao vivo) e ações do mestre

**Files:**
- Create: `src/pages/campaign/TableTab.tsx`, `src/pages/campaign/PartyCard.tsx`
- Modify: `src/pages/Sheet.tsx` (modo `readOnly` para ver ficha de outro: esconde ações e desabilita `upd`)

**Interfaces:** consome `useCampaign`, `watchCharacters`; `gmApply(characterId, campaignId, { deltaHp?, tempHp?, add?, remove? }): Promise<void>` (em `campaigns.ts`).

- [ ] **Step 1:** cards com nome, retrato, classe/nível, PV (anel), PV temp, CA, condições, concentração, Percepção passiva; recalcula com o motor de regras usando o SRD da edição + homebrew da campanha.
- [ ] **Step 2:** mestre: botões Dano/Cura/PV temp/condições → `gmApply`; jogador: card clica e abre ficha `readOnly`.
- [ ] **Step 3:** verificar com duas contas: dano do mestre aparece na ficha do jogador e no card em ~2 s.
- [ ] **Step 4:** commit `feat: mesa ao vivo e ações do mestre`.

### Task 6: Rolagens compartilhadas

**Files:**
- Create: `src/cloud/rolls.ts`, `src/pages/campaign/RollsTab.tsx`
- Modify: `src/store.ts` (`useDice.roll` aceita `opts.campaignId`, `opts.hidden`; publica quando há campanha ativa), `src/pages/Sheet.tsx` (personagem em campanha → `activeCampaignId`; alternador "só para mim"), `src/ui/Dice.tsx`

**Interfaces:** `publishRoll(campaignId, entry: ActiveRoll, hidden: boolean): Promise<void>`; `useRollFeed(campaignId): RollRow[]` (últimas 200, realtime). Mestre: padrão `hidden = true`, botão "Revelar" (`update hidden=false`, permitido só ao autor ou ao mestre).

- [ ] **Step 1:** verificar com duas contas: rolagem do jogador aparece no feed do mestre; "só para mim" não aparece para outro jogador; rolagem escondida do mestre só aparece para ele até revelar.
- [ ] **Step 2:** commit `feat: rolagens compartilhadas`.

### Task 7: Combate, iniciativa e monstros do SRD

**Files:**
- Modify: `scripts/fetch-data.mjs` (+ `Monsters`), `scripts/build-data.mjs` (gera `public/data/monsters-2014.json` e `monsters-2024.json`)
- Create: `src/data/monsters.ts` (+ `.test.ts`), `src/cloud/combat.ts`, `src/pages/campaign/CombatTab.tsx`, `src/pages/campaign/EnemyEditor.tsx`

**Interfaces:**
- `type MonsterDef = { id; name; size; type; ac: number; hp: number; hpDice: string; speed: string; scores: Record<Ability, number>; cr: string; xp?: number; traits: FeatureRef[]; actions: { name: string; desc: string; toHit?: number; damage?: string }[]; legendary?: FeatureRef[] }`
- `loadMonsters(ed: Edition): Promise<MonsterDef[]>`
- `hpBand(cur: number, max: number): 'ileso'|'ferido'|'sangrando'|'quase morto'|'caido'` (espelha a função SQL)
- `combat.ts`: `useEncounter(campaignId)`, `addCombatant`, `updateCombatant`, `updateSecrets`, `removeCombatant`, `nextTurn`, `startEncounter`, `endEncounter`, `rollInitiativeForAll`
- efeitos: `{ id; name; kind: 'buff'|'debuff'; rounds?: number; visible: boolean }` (diminui `rounds` a cada nova rodada e some em 0)

- [ ] **Step 1:** testes: `hpBand` nos 5 limites do Global Constraints; montagem de monstro do SRD (ex.: Goblin 2014 → CA 15, PV 7, ação "Scimitar" com `toHit 4` e `damage '1d6+2'`).
- [ ] **Step 2:** implementar dados + UI: mestre adiciona jogadores da campanha e inimigos (do zero ou "do SRD"), foto 256 px, ataques com botão de rolar (rolagem escondida), efeitos, visível/oculto; "Rolar iniciativa", "Próximo turno" (avança rodada e efeitos). Jogadores veem ordem, turno atual, faixa de vida e efeitos visíveis.
- [ ] **Step 3:** testes passam; verificar com duas contas: jogador não vê inimigo oculto nem PV exato; faixa muda quando o mestre aplica dano.
- [ ] **Step 4:** commit `feat: combate com iniciativa e inimigos`.

### Task 8: Homebrew da campanha

**Files:**
- Create: `src/cloud/campaignHomebrew.ts`, `src/pages/campaign/HomebrewTab.tsx`
- Modify: `src/data/srd.ts` (`useSrd(edition, campaignId?)` mescla homebrew da campanha depois do pessoal), telas da campanha e ficha aberta via campanha

**Interfaces:** `publishPack(campaignId, raw: unknown): Promise<SanitizeResult>` (valida com `sanitizeHomebrew` antes de inserir, um item por linha, `kind` + `id`); `useCampaignHomebrew(campaignId): Homebrew`; `removeItem(campaignId, kind, id)`.

- [ ] **Step 1:** verificar: mestre publica `homebrew-mistico-2014.json`; jogador sem o pacote local vê o Voss com classe Mystic e disciplinas no card e na ficha `readOnly`.
- [ ] **Step 2:** commit `feat: homebrew da campanha`.

### Task 9: Verificação final e publicação

- [ ] **Step 1:** `npx vitest run`, `npx tsc -b`, `npm run build`: tudo verde.
- [ ] **Step 2:** com as duas contas de teste do usuário, rodar o roteiro: login → enviar fichas → criar campanha → convite → escolher personagem → dano do mestre → rolagem compartilhada → combate com goblin oculto/visível → homebrew da campanha; checar celular (375 px) sem rolagem lateral.
- [ ] **Step 3:** atualizar `README.md` (seção "Mesa online" + passos do painel Supabase); push na `main`; conferir deploy no GitHub Pages.
