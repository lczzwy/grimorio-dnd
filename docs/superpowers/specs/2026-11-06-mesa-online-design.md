# Mesa online (etapa 2): design

**Status:** aguardando aprovação · **Data:** 2026-11-06

## Intenção

O grupo joga D&D **à distância, pelo Discord, sem mapa** (teatro da mente). Hoje cada um tem a ficha só no próprio navegador, e o mestre não vê nada. A etapa 2 transforma o Grimório no ponto de encontro da sessão:

- as fichas ficam salvas online e abrem em qualquer aparelho;
- o mestre acompanha todos os personagens ao vivo e interage com eles (dano, cura, condições);
- as rolagens aparecem para a mesa inteira;
- o combate tem iniciativa e inimigos/bosses com foto, efeitos e ataques, e os jogadores veem só o que o mestre permitir.

Sucesso = numa sessão real, ninguém precisa digitar no Discord "tirei 17" ou "estou com 12 de vida": o site mostra.

## Objetivos

1. **Contas** (e-mail + senha) e **sincronização** das fichas na nuvem, sem perder as fichas locais existentes.
2. **Campanhas** com convite por link, papéis de mestre e jogador, e cada jogador escolhendo o personagem que usa.
3. **Visão da mesa** em tempo real: cards dos personagens com PV, CA, condições, concentração e Percepção passiva.
4. **Ações do mestre** sobre os jogadores: aplicar dano, cura, PV temporário e condições.
5. **Rolagens compartilhadas**: feed da campanha; o mestre pode rolar escondido.
6. **Combate**: rastreador de iniciativa (rodada e turno) com jogadores e inimigos; inimigos criados do zero ou a partir dos **monstros do SRD**; vida aproximada para os jogadores.
7. **Homebrew da campanha**: pacotes publicados na campanha chegam a todos os membros.

## Fora do escopo (agora)

Mapa e grid, chat e voz (o Discord já faz isso), bot do Discord, login com Discord (vem depois, porque precisa de configuração extra), app nativo, edição simultânea com mescla campo a campo.

## Anti-objetivos (seria fracasso mesmo funcionando)

- Um jogador conseguir ver PV exato, ficha ou notas de um inimigo escondido, ou editar a ficha de outro jogador.
- Perder ou corromper fichas locais na migração para a nuvem.
- O site deixar de funcionar para quem não fizer login (o modo local continua igual).
- Qualquer chave secreta do Supabase no código do site.

## Restrições

- **Hospedagem:** site estático no GitHub Pages, sem servidor próprio; toda a lógica protegida mora no **Supabase** (Postgres + Auth + Realtime), projeto `lnvrptqcjcmvsmeprkfk` (região us-west-2).
- **Chave:** só a *publishable key* vai no código. A segurança vem das regras RLS e de funções `security definer`.
- **Plano gratuito:** 500 MB de banco, 200 conexões realtime simultâneas e envio de e-mails do Auth bem limitado (algumas mensagens por hora). Por isso a **confirmação por e-mail fica desligada** e não há "link mágico".
- **Painel do Supabase:** eu não tenho acesso. O usuário cola o SQL no *SQL Editor* e faz os ajustes de Auth que eu indicar.
- **Licença:** monstros vêm do SRD 5.1/5.2 (CC-BY-4.0). Conteúdo de outros livros só entra como homebrew da campanha, nunca no repositório.

## Abordagens consideradas

| | Abordagem | Prós | Contras |
|---|---|---|---|
| **A (escolhida)** | Ficha inteira como documento `jsonb`, uma linha por personagem; motor de regras continua no navegador | reaproveita todo o código atual; aguenta qualquer evolução da ficha e o homebrew | concorrência "vale a última gravação" no mesmo personagem |
| B | Ficha desmontada em várias tabelas | consultas detalhadas | muito mais trabalho, e toda mudança na ficha vira migração de banco |
| C | Bot do Discord em vez do site online | onde o grupo já está | perde a ficha visual e a tela do mestre |

O usuário escolheu **A**.

## Decisões de design

### Modelo de dados (Postgres)

- `profiles(id → auth.users, display_name)`: criado por trigger no cadastro.
- `characters(id text pk, owner uuid, edition, name, data jsonb, updated_at, version int)`: `id` é o mesmo id local do personagem; `data` é o objeto `Character` inteiro.
- `campaigns(id uuid, name, edition, gm uuid, invite_code text unique, created_at)`: a campanha tem **uma edição** (2014 ou 2024).
- `campaign_members(campaign_id, user_id, role 'gm'|'player', character_id text null)`.
- `campaign_homebrew(campaign_id, id, kind, item jsonb, updated_by, updated_at)`: um item por linha; reaproveita o formato e a validação (`sanitizeHomebrew`) que já existem.
- `rolls(id, campaign_id, user_id, author, label, formula, rolls int[], dropped int[], total, kind, hidden bool, created_at)`: guarda as últimas N rolagens; as antigas são apagadas por limpeza periódica ou no momento da inserção.
- `encounters(campaign_id pk, active bool, round int, turn int)`: estado do combate.
- `combatants(id, campaign_id, kind 'player'|'monster'|'npc', character_id text null, name, image text, initiative int, hp_band text, conditions text[], effects jsonb, visible bool, sort int)`: **parte pública**.
- `combatant_secrets(combatant_id pk, hp_current, hp_max, hp_temp, ac, stat jsonb, attacks jsonb, notes)`: **só o mestre**. Um trigger recalcula `combatants.hp_band` (ileso, ferido, sangrando, quase morto, caído) sempre que o PV muda.

### Segurança (RLS)

- `characters`: o dono lê e escreve; membros de uma campanha em que o personagem está vinculado podem **ler**. Ninguém além do dono escreve direto.
- O mestre altera jogadores **só por função** `gm_apply(character_id, delta_hp, temp_hp, add_conditions, remove_conditions)` (`security definer`). Ela confere se quem chama é o mestre da campanha do personagem e usa `jsonb_set` no servidor, sem reescrever a ficha inteira.
- `campaigns` e `campaign_members`: membros leem. Entrar numa campanha é só pela função `join_campaign(code)`. O mestre gerencia membros e gera um novo código de convite.
- `rolls`: membros inserem e leem, exceto `hidden = true`, que só o autor e o mestre veem.
- `combatants`: membros leem os `visible = true`; o mestre faz tudo. `combatant_secrets`: só o mestre.
- `campaign_homebrew`: membros leem; mestre e membros publicam; só o autor ou o mestre apagam.
- Tabelas com permissões concedidas explicitamente (`grant`), já que *expose new tables* ficou desligado.

### Sincronização das fichas

- **Local primeiro:** o store atual continua sendo a fonte da tela. Com login, cada personagem ganha um "na nuvem" (ligado por padrão quando o usuário envia).
- **Envio:** cada alteração local é salva no Supabase com atraso de ~800 ms (debounce).
- **Recebimento:** inscrição Realtime nos personagens do usuário e nos da campanha aberta. Uma versão remota mais nova (`updated_at`) substitui a local, o que cobre o dano aplicado pelo mestre.
- **Primeira entrada:** o site oferece "Enviar minhas fichas deste navegador". Em outro aparelho, as fichas da conta são baixadas.
- **Conflito:** vale a última gravação por personagem. A janela de risco é pequena porque só o dono edita e o mestre altera por delta no servidor.
- **Homebrew pessoal** continua local. O que precisa ser compartilhado vai como homebrew da campanha.

### Telas novas

- `#/conta`: entrar, cadastrar, nome de exibição, sair, enviar fichas locais.
- `#/campanhas`: minhas campanhas, criar (nome + edição), entrar por código.
- `#/convite/:code`: entra na campanha e escolhe o personagem.
- `#/campanha/:id`, com abas:
  - **Mesa:** cards ao vivo dos personagens. O mestre tem ações rápidas: dano, cura, PV temporário e condições.
  - **Combate:** iniciativa (adicionar jogadores e inimigos, rolar iniciativa, próximo turno, rodada). O mestre edita inimigos (foto em data URL de 256 px, PV, CA, ataques com botão de rolar, efeitos de buff e debuff com nome e duração em rodadas, visível ou oculto). Os jogadores veem nome, foto, faixa de vida, condições e efeitos visíveis.
  - **Rolagens:** feed ao vivo. O mestre tem a opção "rolar escondido".
  - **Homebrew:** pacotes da campanha (importar e listar). Todos os membros recebem esse conteúdo mesclado ao SRD daquela edição.
  - **Ajustes:** link de convite (copiar e gerar novo), membros, remover jogador.
- Na **ficha**: quando o personagem está numa campanha, as rolagens também vão para o feed (com a opção "só para mim" quando a rolagem for privada).

### Monstros do SRD

O build gera `monsters-2014.json` e `monsters-2024.json` compactos (nome, tipo, CA, PV e dado de vida, atributos, ações com acerto e dano, ND, características), carregados só quando o mestre abre o seletor. Criar um inimigo a partir de um monstro copia os dados para `combatant_secrets.stat`.

## Ações do usuário no painel do Supabase

1. **Authentication → Sign In / Providers → Email:** desligar *Confirm email*.
2. **Authentication → URL Configuration:** *Site URL* = `https://lczzwy.github.io/grimorio-dnd/`.
3. **SQL Editor:** colar e executar `supabase/schema.sql` (fornecido no repositório) uma vez, e de novo a cada versão nova do arquivo.

## Verificação

- Testes unitários para a mescla local/remota, o cálculo da faixa de vida e a montagem dos monstros.
- `supabase/tests.sql`: testes de RLS que o usuário roda no SQL Editor, simulando dois jogadores e um mestre com `set local role authenticated` e `request.jwt.claims`, e conferindo leituras e escritas permitidas e negadas.
- Teste ponta a ponta no navegador com duas contas de teste criadas **pelo usuário** (mestre e jogador), em duas abas.

## Decisões do construtor (revisão; o usuário confere)

1. **Um personagem pode estar em mais de uma campanha**, desde que a edição seja a mesma da campanha. O site só oferece personagens da edição certa.
2. **Jogadores veem as fichas uns dos outros em modo leitura** (o card resume; clicando, abre a ficha completa sem edição). O mestre vê tudo.
3. **Rolagens do mestre vêm escondidas por padrão** (ataques de monstro, por exemplo), com um botão para revelar. As do jogador são públicas por padrão; "só para mim" esconde da mesa, mas **o mestre continua vendo**.
4. **Faixas de vida dos inimigos:** 100% = ileso; ≥ 50% = ferido; ≥ 25% = sangrando; > 0 = quase morto; 0 = caído.
5. **Excluir um personagem** que está na nuvem pede confirmação e apaga também a cópia online, saindo das campanhas.
6. **Sem login**, o link de convite manda para "Entrar ou criar conta" e depois volta para o convite.
7. **O mestre não precisa ter personagem.** Se quiser jogar também, entra com outra conta ou numa campanha diferente.

## O que fica a critério de quem constrói

Layout exato das telas (seguindo o visual atual), nomes de componentes, intervalo do debounce, quantas rolagens manter no feed (proposta: 200 por campanha), textos da interface.
