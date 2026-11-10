# Roadmap do Grimório

Baseado em [AUDITORIA.md](AUDITORIA.md). As fases são pequenas e cada uma termina testável e publicável sozinha. A ordem vai do que protege a mesa ao que deixa ela mais bonita. Os códigos entre parênteses (C1, A2…) são os itens da auditoria.

Regras para todas as fases:
- Teste antes da correção, sempre que der: banco em `supabase/schema.test.ts`, lógica em `*.test.ts`.
- Conferência no navegador no PC e no celular.
- Se mexer em `schema.sql`, você roda no Supabase **antes** de publicar.
- Só publico depois do seu "pode publicar".
- **Ao fim de cada fase eu paro** e entrego um checklist de teste com duas abas (mestre e jogador). A próxima fase só começa depois da sua aprovação.

---

## Fase 1 · Dados à prova de trapaça (C1, C2)
**Objetivo:** ninguém consegue inventar nem alterar um resultado.
- Função no servidor `roll_dice(campaign, formula, label, mode)` que sorteia no Postgres e grava a rolagem.
- Retirar a permissão de inserir em `rolls` direto pela tabela.
- Função `reveal_roll(id)` que só troca o "oculto"; retirar o `update` direto.
- A iniciativa do jogador passa a usar uma rolagem feita no servidor (não um número enviado pelo navegador).
- O site chama a função e mostra a animação com o resultado que voltou; a animação do dado disfarça a espera.
- Sem campanha (ficha usada sozinha) o sorteio continua local, porque não há com quem trapacear.

**Pronto quando:**
- os testes do banco mostram que inserir ou editar rolagem direto falha e que a função sorteia dentro dos limites da fórmula;
- a mesa ao vivo continua mostrando os dados 3D no número certo.

**Testar:** rolar pela ficha, pelo chat e pelos botões rápidos; vantagem; crítico; rolagem oculta do mestre e revelar.

## Fase 2 · Permissões e consistência (A3, M4, B1)
**Objetivo:** cada um só mexe no que é seu.
- Homebrew da campanha: só o autor original ou o mestre editam.
- Membro removido: os combatentes dele saem do combate.
- `author` de chat e rolagens preenchido pelo servidor a partir do perfil.

**Pronto quando:** cada regra tem um teste no banco.

**Testar:** um jogador tentando editar homebrew de outro; o mestre removendo um jogador em combate.

## Fase 3 · Contas seguras e login com Discord (A1)
**Objetivo:** ninguém perde a conta, e dá para entrar com o Discord.
- "Esqueci minha senha" com o e-mail padrão do Supabase e tela para a nova senha.
- Trocar a senha dentro da conta.
- Mensagem correta se a confirmação de e-mail estiver ligada.
- **Entrar com Discord** (OAuth), com o nome e o avatar do Discord como sugestão de perfil.
- Passo a passo para você: criar o app no Discord Developer Portal (Client ID, Client Secret, Redirect) e ativar o provedor Discord no Supabase (Authentication → Providers), mais as URLs de redirecionamento do site.

**Pronto quando:** redefinir a senha de uma conta de teste funciona do começo ao fim, e uma conta nova entra pelo Discord e cai de volta no site logada.

## Fase 4 · Fichas que não se perdem (A2, A5, M5)
**Objetivo:** dano do mestre e edições nunca se apagam entre si.
- Envio da ficha com checagem de versão: em conflito, o site busca a versão do servidor e junta (o PV vem do servidor quando o mestre mexeu).
- Aviso "não consegui salvar online" depois de algumas falhas, com o motivo.
- No primeiro login, oferecer enviar as fichas que só estavam no navegador.

**Pronto quando:** teste automático da junção; teste manual com o mestre aplicando dano enquanto o jogador edita a ficha em outro aparelho.

## Fase 5 · Mesa estável e leve (A4, M1, M2, M8)
**Objetivo:** a mesa aguenta meses de uso no plano grátis.
- **Keep-alive:** GitHub Actions com cron semanal fazendo uma consulta leve no Supabase, para o projeto não pausar. Mais um aviso no site quando o banco estiver fora do ar.
- Chat limitado às últimas 500 mensagens por campanha, e limite de envio contra spam.
- Fotos no Supabase Storage em vez de base64, com migração das fotos atuais. Passo a passo do painel para você: criar o balde `portraits` e colar as regras de acesso.
- Registro simples dos erros de tela numa tabela só de inserção.

**Pronto quando:** testes do banco para o limite do chat e para as regras do Storage; fotos antigas continuam aparecendo depois da migração.

## Fase 6 · Primeira sessão sem dúvidas (M3) + visual (skill frontend-design)
**Objetivo:** um amigo novo entra e joga sem perguntar nada.
- Jogador que chega pelo convite vê um aviso fixo para escolher o personagem até escolher.
- Polimento com a skill **frontend-design**:
  - revisar a hierarquia das telas da campanha;
  - tirar os emojis soltos dos botões;
  - encurtar textos explicativos longos;
  - padronizar espaçamentos.

**Pronto quando:** um teste guiado com alguém que nunca usou o site, do convite à primeira rolagem.

## Fase 7 · Acessibilidade e dívida técnica (M6, M7, B3, B4, B6)
**Objetivo:** dá para usar só com o teclado e o site carrega mais rápido.
- Trocar os 46 `alert`/`confirm` pelos modais do site.
- Clicáveis com papel de botão e foco de teclado; `aria` nos controles da mesa.
- Contraste conferido nos 6 temas; dados 3D respeitando "reduzir movimento".
- Juntar os estilos inline mais repetidos em classes.
- Separar compêndio e criador em pedaços carregados sob demanda (pacote principal menor).

**Pronto quando:** navegação completa por teclado na ficha e na mesa; pacote principal abaixo de 450 kB.

## Fase 8 · Mapa tático (confirmado)
**Objetivo:** tabuleiro estilo Roll20/Tabletop, tudo em tempo real. Dividido em etapas que podem ser testadas uma a uma:
- **Decisão de layout (10/11/2026):** o mapa ativo **é** a mesa: ocupa o lugar do feltro e os dados 3D caem por cima dele, para todos verem mapa e rolagem na mesma tela. Sem mapa ativo, volta o feltro.
- **8a. Mapa e grade:** o mestre envia a imagem do mapa (Storage), ajusta a grade (tamanho da célula, deslocamento) e escolhe o mapa ativo da campanha; todos veem, com zoom e arrastar.
- **8b. Tokens:** tokens dos personagens e das criaturas do combate. Cada jogador arrasta o seu, o mestre arrasta qualquer um; o movimento sincroniza ao vivo e encaixa na grade. Tokens ocultos aparecem só para o mestre.
- **8c. Régua:** medir distância em quadrados e metros (1,5 m por quadrado), visível para todos enquanto alguém mede.
- **8d. Desenho:** traço livre, linha, círculo e cone, com cor do jogador; o mestre apaga tudo; desenhos temporários somem sozinhos.
- **8e. Névoa de guerra:** o mestre cobre o mapa e revela áreas; os jogadores só veem o que foi revelado. A regra de quem vê o quê fica no banco.

---

### Ordem sugerida e esforço aproximado
| Fase | Esforço | Precisa rodar SQL? |
|---|---|---|
| 1 Dados à prova de trapaça | médio | sim |
| 2 Permissões | pequeno | sim |
| 3 Contas seguras + Discord | médio | não (só configurar Discord e Supabase no painel) |
| 4 Fichas que não se perdem | médio | talvez |
| 5 Mesa estável e leve | médio | sim (+ criar balde no Storage) |
| 6 Primeira sessão + visual | médio | não |
| 7 Acessibilidade e dívida | médio | não |
| 8 Mapa tático (8a–8e) | grande | sim (+ Storage) |
