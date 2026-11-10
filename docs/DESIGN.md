# Design do Grimório

Notas de direção visual, para manter as próximas fases coerentes. Atualizado na Fase 6.

## Identidade (aprovada, não refazer)
Tema "mar astral": carta celeste antiga e encadernação de grimório. Gravuras em domínio público, latão e azul-noite.

### Cores (tema padrão; os outros 5 temas trocam só estas variáveis)
| Papel | Variável | Valor |
|---|---|---|
| Fundo | `--bg` | `#060914` azul-noite |
| Painel | `--panel` / `--panel-2` | `#0f1528` / `#141c33` |
| Detalhe (linhas, títulos, números) | `--gold` | `#c8a86a` latão |
| Destaque de ação | `--accent` | `#8a3a2a` lacre / couro vinho |
| Texto | `--text` | `#e6e1d3` pergaminho |
| Estados | `--good` / `--bad` / `--warn` | musgo / sangue / âmbar |

### Tipos
- **IM Fell English SC:** títulos, com caixa-alta-baixa nativa da fonte. É a voz do "livro antigo".
- **Alegreya Sans:** interface e textos.
- **Cinzel:** só números (algarismos alinhados, fáceis de ler numa rolagem).

## Princípios
1. **Um elemento memorável por tela.** Na campanha é a mesa de dados (madeira e feltro). O resto fica quieto: painéis lisos, uma moldura de latão fina.
2. **Iconografia é gravura, não emoji.** Ícones de linha (lucide), na cor do texto ou do latão. Emojis coloridos quebram o tom de "livro antigo" e foram retirados dos botões e títulos.
3. **Texto que orienta, não que vende.** Frases curtas, verbo no começo, dizendo o que acontece ao clicar. Telas vazias dizem o que fazer a seguir.
4. **Primeira vez guiada no lugar certo.** O que a pessoa precisa fazer para jogar aparece **na própria mesa**, e não escondido numa aba de ajustes.
5. **Espaço vertical em um ritmo só:** `--stack` (16 px) entre os blocos da campanha.

## Fase 6: o que foi decidido e por quê
- **Convocação na mesa:** o jogador que chega pelo convite vê, no topo da mesa, um cartão "Escolha quem você leva para esta mesa" com os personagens dele. É um clique e pronto. O mestre de campanha nova vê "Chame o grupo", com o link de convite e o botão de copiar.
  - O cartão tem moldura dupla de latão e um selo, como uma carta de convocação, e é o único destaque da tela até ser resolvido.
- **Revisão contra o "padrão de IA":**
  - Primeira ideia: um banner com degradê e um passo a passo numerado (01/02/03). **Recusei** porque não é uma sequência de verdade: é uma ação só (escolher o personagem). Numerar seria decoração.
  - Segunda ideia: um rótulo em caixa-alta acima do título ("PRIMEIROS PASSOS"). **Recusei** porque é cromo de template. O título sozinho já diz o que é.
  - Os metadados separados por "·" foram evitados nas peças novas. Onde a informação é uma lista curta, ela vira texto corrido.
