# Auditoria do Grimório

Data: 10/11/2026 · Escopo: todo o código em `app/` e o banco em `supabase/schema.sql`. Nenhum código foi alterado nesta etapa.

O projeto já está bem adiantado: a mesa online existe e funciona (fichas, campanha, chat, dados 3D sincronizados, iniciativa, combate e bestiário). Por isso a auditoria se concentra no que pode quebrar, vazar ou dar trabalho quando o grupo usar de verdade, e não em "o que falta construir".

---

## 1. Skills deste ambiente

| Skill | Para que serve | Vou usar? |
|---|---|---|
| **frontend-design** | direção visual, tipografia, evitar cara de template | **Sim**, na fase de polimento visual (ver ROADMAP, fase 6) |
| systematic-debugging | investigar bug com método, antes de corrigir | **Sim**, nas correções dos itens críticos e altos |
| test-driven-development | escrever o teste antes da correção | **Sim**, principalmente no banco (`schema.test.ts`) |
| verification-before-completion | só dizer "pronto" depois de rodar e conferir | **Sim**, em todas as fases |
| security-review | revisar mudanças sensíveis | **Sim**, nas fases 1 e 2 (rolagens no servidor, permissões) |
| brainstorming / writing-plans / planning-and-task-breakdown | planejar antes de codar | Usei a lógica delas para montar o ROADMAP |
| code-review / simplify | revisão e limpeza de código | Na fase 7 (dívida técnica) |
| run / agent-browser | abrir o site e testar no navegador | Sim, para conferir cada fase |
| artifact-*, docs, docx, pptx, xlsx, pdf, yt-* e outras | documentos, apresentações, YouTube | Não se aplicam a este projeto |

---

## 2. Mapa do projeto

### Stack
- **Front:** React 19 + TypeScript + Vite 6, um único app de página (SPA) com rotas por `#` (hash).
- **Estado local:** zustand. As fichas e o homebrew do navegador ficam no `localStorage` (`grimorio-v1`).
- **Backend:** Supabase (Postgres + autenticação + Realtime). A chave publicável fica no código, o que é correto: quem protege os dados são as regras RLS.
- **3D:** `@3d-dice/dice-box-threejs` (three.js + cannon-es), carregado só na primeira rolagem.
- **Testes:** vitest (122 testes), incluindo o banco testado de verdade num Postgres em memória (PGlite).
- **Hospedagem:** GitHub Pages, publicado pelo GitHub Actions a cada push na `main`. O workflow roda os testes antes de publicar.
- **App instalável:** PWA com service worker (`public/sw.js`).

### Pastas
```
src/
  App.tsx            rotas (#/2014, #/2024/c/:id, #/campanha/:id/:aba, #/conta, #/convite/:codigo…)
  store.ts           estado local (fichas, homebrew, dados rolados)
  engine/            regras de D&D: cálculos da ficha, dados, turnos (sem tela)
  data/              tipos, carregamento do SRD, homebrew, tradução, backup
  import/            importação de fichas do 5e Companion (.cah)
  cloud/             tudo que fala com o Supabase: auth, sync, campanhas, chat, rolagens, combate, bestiário, "digitando"
  dice3d/            mesa de dados 3D, sons, notação forçada
  pages/             telas: Home, Roster, Creator, Sheet (+ abas), Compendium, Homebrew, Account, Campaigns, Campaign (+ abas)
  ui/                componentes comuns, bandeja de dados, temas, tutorial, ErrorBoundary
supabase/schema.sql  banco inteiro (idempotente) + schema.test.ts
public/data          SRD 2014/2024, monstros e traduções (≈ 2,8 MB no total, guardados em cache pelo service worker)
```

### Rotas
| Rota | Tela |
|---|---|
| `#/` | início (escolha da edição) |
| `#/2014`, `#/2024` | lista de personagens daquela edição |
| `#/:ed/novo` | criador passo a passo |
| `#/:ed/c/:id` | ficha |
| `#/:ed/compendio/:secao` | compêndio SRD |
| `#/:ed/homebrew` | editor e importador de homebrew |
| `#/conta` | entrar, criar conta, enviar fichas para a nuvem |
| `#/campanhas` | minhas campanhas, criar e entrar |
| `#/convite/:codigo` | entra na campanha pelo link |
| `#/campanha/:id/:aba` | mesa: Minha ficha, Mesa, Chat (só no celular), Combate, Rolagens, Bestiário (só mestre), Homebrew, Ajustes |

### Onde mora cada coisa
- **Fichas:** primeiro no navegador (`localStorage`). Com conta, também na tabela `characters`, com sincronização em duas vias (`cloud/sync.ts`): envio com atraso de 0,8 s e novas tentativas, recebimento pelo Realtime e, em conflito, vence a cópia com o `updatedAt` mais novo.
- **Homebrew:** no navegador por edição; o da campanha fica na tabela `campaign_homebrew`.
- **Mesa ao vivo:** só no Supabase (chat, rolagens, combate, iniciativa, cores dos jogadores).
- **Bestiário:** tabela `creatures`, por conta do mestre.

### Tempo real
O site usa **Supabase Realtime** de dois jeitos:
- **postgres_changes** (mudanças no banco, respeitando as regras RLS): chat, rolagens, membros, combate, homebrew da campanha, fichas da mesa e as suas fichas em outros aparelhos.
- **broadcast** (mensagem passageira, nada gravado): "fulano está digitando…".

Há 10 pontos que abrem canais. Uma tela de campanha aberta usa cerca de 8 a 10 canais ao mesmo tempo, todos numa única conexão WebSocket.

---

## 3. Banco de dados

### Tabelas e relações
```
auth.users ─┬─ profiles (nome exibido)
            ├─ characters (owner) ──────────────┐
            ├─ creatures (owner)  [bestiário]    │
            └─ campaigns (gm) ─┬─ campaign_members (user, role, character_id ─┘, color)
                               ├─ campaign_homebrew
                               ├─ rolls          (mantém as últimas 200)
                               ├─ chat_messages
                               ├─ encounters     (1 por campanha: ativo, rodada, vez, pedido de iniciativa)
                               └─ combatants ── combatant_secrets (PV, CA e ficha do monstro; só o mestre)
```

### Permissões (jogador × mestre)
O desenho está **bom e testado** (25 testes de segurança no banco):
- **Jogador:**
  - vê só as campanhas de que participa;
  - vê as fichas que estão em jogo nessas campanhas;
  - edita apenas as próprias fichas;
  - grava só a própria iniciativa (pela função `roll_my_initiative`).
- **Mestre:**
  - controla o combate inteiro;
  - aplica dano e condições na ficha do jogador por uma função restrita (`gm_apply`), sem reescrever a ficha inteira;
  - é o único que vê os PV e a ficha dos monstros (`combatant_secrets`);
  - é o único que vê as criaturas escondidas.
- **Quem não é membro:** não vê nada. O usuário anônimo não tem acesso a nenhuma tabela.
- **Mudanças sensíveis** (entrar na campanha, escolher personagem, escolher cor, iniciativa, dano do mestre) passam por funções no servidor que checam a permissão.

### Problemas de modelagem e de regra
Os detalhes de cada item estão na seção 6. Resumo:
1. **O resultado do dado é decidido no navegador.** O servidor aceita qualquer total que o site enviar.
2. **O autor da própria rolagem pode editá-la depois** (`rolls_update`).
3. **Qualquer membro pode sobrescrever o homebrew de outro membro da campanha** (`homebrew_update`).
4. **O chat cresce para sempre.** As rolagens são limitadas a 200; o chat não tem limite.
5. **As fotos são texto base64 dentro das linhas** (fichas, combatentes, criaturas). Funciona, mas deixa as linhas e os avisos do Realtime pesados.
6. **O id da ficha é criado no navegador** (texto), em vez de `uuid` gerado pelo banco. Um id repetido de outra pessoa trava o envio daquela ficha em silêncio.
7. **O nome do autor (`author`) em chat e rolagens é gravado como o navegador mandar.** Dá para gravar um nome falso, mas a tela usa o `user_id` para mostrar o nome certo.

---

## 4. Fluxos percorridos

| Fluxo | Situação | O que encontrei |
|---|---|---|
| Criar conta / entrar | ⚠️ funciona, com lacunas | **Não existe "esqueci minha senha"**: quem esquecer perde o acesso. Também não há troca de e-mail nem de senha. Como a confirmação de e-mail está desligada, dá para criar conta com e-mail de outra pessoa. Se alguém ligar a confirmação no Supabase, o cadastro passa a mostrar erro em vez de "verifique seu e-mail". |
| Criar ficha | ✅ | Funciona sem conta. Ficha criada **antes** de entrar na conta não vai para a nuvem sozinha: é preciso clicar em "Enviar fichas" na página da conta, e isso não é óbvio. |
| Importar ficha | ✅ com ressalvas | Aceita JSON do próprio site e `.cah` do 5e Companion, e detecta pacote de homebrew colado no lugar errado. Uma classe homebrew sem pacote (ex.: Místico) aparece em inglês até importar o pacote. |
| Entrar na mesa | ⚠️ | O link de convite funciona, inclusive depois do login. Mas o jogador cai na aba **Ajustes** e precisa descobrir sozinho que tem de escolher o personagem, senão a iniciativa e o nome do personagem não aparecem. O convite não expira (o mestre pode gerar outro). |
| Rolar dado | ⚠️ | Funciona e sincroniza; os dados 3D param no número certo para todos. Mas o número é sorteado no navegador (risco de trapaça, item C1), e uma rolagem com o navegador sem internet some sem aviso claro na fila. |
| Chat | ✅ | Mensagens ao vivo, "digitando…", aviso com a aba em segundo plano. Falta limite e limpeza do histórico (item M2). |
| Mestre adicionar monstro | ✅ | Monstros do SRD, criação do zero e bestiário próprio; ocultos só para o mestre. Não existe "mapa", então "elementos na mesa" hoje são só combatentes. |
| Ficha em dois aparelhos ao mesmo tempo | ⚠️ | Vence o `updatedAt` mais novo, e esse horário vem do **relógio do aparelho**. Dano aplicado pelo mestre pode ser desfeito pelo jogador (item A2). |
| Sair da campanha / remover jogador | ⚠️ | O mestre remove o jogador, mas o combatente dele continua no combate. A ficha deixa de ser visível para os outros. |
| Apagar a campanha | ✅ | Apaga tudo em cascata, com confirmação. |

---

## 5. Front-end

**Pontos fortes**
- Identidade própria (gravuras antigas, latão, 6 temas de cor); foge do visual genérico de template.
- Celular e PC com layouts diferentes de verdade; o site pode ser instalado como app.
- Números grandes e legíveis, rolagem com um toque em quase tudo.

**Problemas**
- **Acessibilidade:**
  - 20 elementos clicáveis são `div`/`span`, sem foco de teclado nem papel de botão (ex.: os atributos da ficha);
  - só 14 atributos `aria-*` no projeto todo;
  - não há teste de contraste nos 6 temas;
  - os efeitos de luz e tremor respeitam "reduzir movimento", mas os dados 3D não.
- **Consistência:**
  - 401 estilos inline (`style={{…}}`) espalhados, o que dificulta manter o visual coerente;
  - 46 `alert()`/`confirm()` nativos do navegador destoam do tema e travam a tela no celular.
- **Cara de IA:** pouca, no geral. Os pontos que ainda lembram são alguns textos explicativos longos em painéis e emojis soltos em botões (🔒, 👁).
- **Performance:**
  - o pacote principal tem 626 kB (184 kB compactado) e o motor 3D mais 553 kB, carregado sob demanda;
  - o SRD de cada edição pesa 0,8 a 1,1 MB de JSON;
  - cada imagem base64 viaja de novo em todo aviso do Realtime da ficha.

  Nada disso trava, mas o primeiro acesso pelo celular em 4G é lento.

---

## 6. Problemas por gravidade

### Crítico
- **C1. Resultado dos dados decidido no navegador.** `useDice.roll()` sorteia no aparelho e envia o total pronto, e o banco grava qualquer número. Alguém que abra o console pode mandar um 20 natural sempre.
  - *Risco:* trapaça. Entre amigos é baixo, mas é exatamente o tipo de coisa que destrói a confiança na mesa.
  - *Correção:* uma função no servidor que recebe só a fórmula e sorteia lá (`roll_dice(campaign, formula, label)`), e retirar a permissão de inserir rolagens direto na tabela.
- **C2. O autor pode editar a própria rolagem depois de feita.** A regra `rolls_update` permite ao autor mudar `rolls`, `total` e `kind`. Ela existe para o "revelar rolagem oculta", mas libera demais.
  - *Correção:* uma função `reveal_roll(id)` que só muda `hidden`, e retirar o `update` direto.

### Alto
- **A1. Não existe recuperação de senha.** Quem esquecer a senha perde a conta e as fichas na nuvem.
  - *Correção:* "Esqueci a senha" com `resetPasswordForEmail` e uma tela para definir a nova senha (precisa do e-mail SMTP do Supabase configurado).
- **A2. Dano do mestre pode ser desfeito.** O `gm_apply` grava no servidor, mas a ficha do jogador continua na fila de envio com a cópia antiga. Se o jogador editar qualquer coisa antes de receber a atualização, ou se o relógio do aparelho estiver adiantado, o envio dele apaga o dano.
  - *Correção:* comparar a versão do servidor (`version`) ao enviar e, em conflito, recarregar o PV do servidor em vez de sobrescrever.
- **A3. Qualquer membro sobrescreve o homebrew dos outros.** A regra `homebrew_update` deixa qualquer membro editar a linha de outra pessoa (o "dono" passa a ser quem editou).
  - *Correção:* só o autor original ou o mestre editam.
- **A4. Projeto gratuito do Supabase pausa sem uso.** No plano grátis o projeto é pausado depois de cerca de 7 dias sem acesso, e o site para de logar e de carregar campanhas até alguém reativar no painel. Grupos que jogam a cada duas semanas vão cair nisso.
  - *Correção:* um ping semanal automático (GitHub Actions agendado chamando uma consulta leve) e um aviso claro no site quando o banco estiver fora.
- **A5. Envio de ficha travado em silêncio.** Se o envio falhar sempre (id repetido, ficha grande demais, permissão negada), o `Uploader` tenta para sempre e nada avisa o usuário.
  - *Correção:* após algumas falhas, mostrar "não consegui salvar online" com o motivo.

### Médio
- **M1. Fotos em base64 nas linhas do banco** (fichas, combatentes, criaturas): linhas pesadas, avisos do Realtime grandes e a mesma imagem copiada em vários lugares.
  - *Correção:* Supabase Storage (um balde `portraits` com regras por dono), guardando só a URL.
- **M2. Chat sem limite.** A tabela cresce indefinidamente e o plano grátis tem 500 MB. Não há limite de envio, então dá para inundar o chat com spam.
  - *Correção:* manter as últimas 500 mensagens por campanha e limitar a uma mensagem a cada 0,5 s por pessoa.
- **M3. Primeiro passo do jogador na mesa não é guiado.** Quem entra pelo convite cai em Ajustes sem saber que precisa escolher o personagem.
  - *Correção:* aviso fixo "Escolha seu personagem" até ele escolher.
- **M4. Jogador removido continua no combate.** O combatente dele permanece na ordem de iniciativa.
  - *Correção:* gatilho que apaga os combatentes daquele personagem quando o membro sai.
- **M5. Fichas criadas sem conta não sobem sozinhas** quando a pessoa cria a conta depois.
  - *Correção:* oferecer o envio na hora do primeiro login.
- **M6. 46 diálogos nativos (`alert`/`confirm`).** No celular são feios e bloqueiam a tela.
  - *Correção:* trocar pelo `Modal` e pelo aviso do próprio site.
- **M7. Acessibilidade.** Clicáveis sem teclado, pouco `aria`, contraste sem teste nos 6 temas e dados 3D que ignoram "reduzir movimento".
- **M8. Nenhum monitoramento de erro.** Se algo quebrar na sessão de alguém, ninguém fica sabendo.
  - *Correção (simples):* registrar erros de tela numa tabela `client_errors` só de inserção.

### Baixo
- **B1.** O nome `author` em chat e rolagens é gravado como o cliente mandar. A tela usa o `user_id`, mas a tabela fica com o valor falso.
- **B2.** O convite não expira; dá para regenerar, mas não existe "convite de uso único".
- **B3.** 401 estilos inline; o tema fica espalhado em três arquivos CSS (`index.css`, `theme.css`, `themes.css`) mais `chat.css` e `diceboard.css`.
- **B4.** Pacote principal com 626 kB; dá para separar o compêndio e o criador em pedaços carregados sob demanda.
- **B5.** O id da ficha é texto gerado no navegador (veja A5).
- **B6.** Ganchos de teste (`window.__dice`, `__layers`) só existem no modo desenvolvimento. Está correto, mas convém um teste garantindo que não vazam para o site publicado.
- **B7.** O cache do GitHub Pages é de 10 minutos; o service worker já força a versão nova, mas uma aba aberta há muito tempo pode ficar numa versão antiga até recarregar.

---

## 7. Riscos de segurança (resumo)

| Risco | Gravidade | Situação |
|---|---|---|
| Trapaça nos dados (sorteio no navegador) | Crítico | C1 |
| Editar a própria rolagem depois | Crítico | C2 |
| Sobrescrever homebrew alheio | Alto | A3 |
| Conta sem recuperação de senha / cadastro com e-mail alheio | Alto | A1 |
| Spam no chat sem limite de envio | Médio | M2 |
| Nome falso gravado em `author` | Baixo | B1 |
| Chave do Supabase no código | **Não é risco** | é a chave publicável, feita para ir no navegador; quem protege é o RLS |
| Ver dados de outras campanhas | Coberto | testado no `schema.test.ts` |
| Ver PV e ficha dos monstros sendo jogador | Coberto | testado |
| Conteúdo protegido (UA/livros) no repositório público | Coberto | o pacote do Místico fica fora do repositório |

---

## 8. Hospedagem

**Hoje:** GitHub Pages (front estático) + Supabase (banco, login e tempo real). **Essa é a arquitetura certa** para um grupo de amigos, e já está implantada.

**Limites do GitHub Pages:**
- não roda código de servidor, só arquivos;
- não guarda segredo: tudo que vai no site é público;
- não deixa configurar cabeçalhos de segurança (CSP), cache próprio nem redirecionamentos;
- rotas precisam usar `#` (já é assim);
- cache fixo de 10 minutos;
- limite flexível de 100 GB de tráfego por mês, sobra para o grupo.

**O que o Supabase cobre:**
- banco e regras de acesso (RLS);
- login;
- tempo real;
- funções no servidor (as RPCs em SQL, e Edge Functions se um dia precisar);
- Storage para imagens, que ainda não é usado.

**Recomendação:**
1. Manter GitHub Pages + Supabase.
2. Levar o sorteio dos dados para o servidor (C1), com uma função SQL simples, sem servidor extra.
3. Passar as fotos para o Supabase Storage (M1).
4. Resolver a pausa do plano grátis (A4) com um ping semanal, ou aceitar e mostrar um aviso.
5. Só considerar Vercel/Netlify/Cloudflare Pages se um dia precisar de cabeçalhos de segurança ou domínio próprio com regras. Não é necessário agora.

---

## 9. Decisões tomadas (respostas de 10/11/2026)

1. **Dados no servidor:** sim. O sorteio vira uma função no Postgres; ninguém insere nem edita rolagem direto na tabela; a animação do dado disfarça a espera.
2. **Senha:** recuperação de senha com o e-mail padrão do Supabase, mais **login com Discord** (OAuth) como opção. O passo a passo do Discord Developer Portal e do Supabase vai junto com a fase 3.
3. **Keep-alive:** ping semanal pelo GitHub Actions (cron), de qualquer forma.
4. **Mapa tático:** sim, com grade, régua, desenho, névoa de guerra e tokens arrastáveis em tempo real. Fica na última fase.
5. **Fotos:** migrar para o Supabase Storage. O passo a passo do painel vai junto com a fase em que isso entra.

**Combinado de trabalho:** ao fim de cada fase, eu paro e entrego um checklist de teste com duas abas (mestre e jogador). Só sigo para a próxima depois da sua aprovação.
