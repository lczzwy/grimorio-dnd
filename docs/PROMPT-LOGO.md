# Prompt para gerar o logotipo do Grimório

Para usar no ícone do site (favicon e app instalado) e no ícone do app no Discord Developer Portal.

## Como usar
- Os geradores de imagem (Midjourney, DALL·E/ChatGPT, Ideogram, Leonardo, Firefly) costumam entender melhor em **inglês**. Cole o prompt principal como está.
- Gere várias opções e escolha uma que continue legível **bem pequena**: olhe a imagem reduzida a 32×32 px antes de decidir.
- Peça **1024×1024** e **fundo liso**. Depois eu recorto e gero os tamanhos que o site precisa (192, 512, maskable, apple-touch) e o de 512×512 para o Discord.

---

## Prompt principal (ícone, sem texto)

```
A logo icon for "Grimório", a tabletop RPG (Dungeons & Dragons) web app. Square app icon, centered emblem, flat vector style with subtle engraved line detail, strong silhouette that reads clearly at 32x32 pixels.

Subject: a closed ancient grimoire (spellbook) seen from the front, with a thick leather cover and brass corner guards and clasp. On the cover, an embossed twenty-sided die (d20) with the "20" face showing, set inside a circular astrolabe ring with a few small stars, like an old celestial map. A faint glow coming from the edge of the pages.

Style: antique celestial cartography meets fantasy book binding — like a 17th-century engraving (Harmonia Macrocosmica, Flammarion engraving) turned into a modern minimal logo. Two-color palette: deep navy blue (#0b1122) background and warm brass/gold (#c8a86a) linework, with a small touch of deep red (#8a3a2a) on the book spine. Clean shapes, thick confident outlines, limited detail, no gradients except a very soft glow.

Icon requirements: perfectly centered, generous margin (the emblem fills about 75% of the square), solid flat navy background, high contrast, symmetrical, no text, no letters, no watermark, no mockup, no 3D render, no photo, no hands, no table, no extra objects.
```

## Variação: logotipo com o nome (para cabeçalho e materiais)

```
Horizontal logo lockup for "GRIMÓRIO", a tabletop RPG web app. On the left, the emblem: an ancient grimoire with brass corners and an embossed d20 inside a circular astrolabe ring with small stars. On the right, the word "GRIMÓRIO" in an elegant engraved serif typeface with small caps feel (like IM Fell English SC or Cinzel), wide letter spacing, brass/gold color (#c8a86a), with the acute accent on the O clearly visible.

Style: antique celestial map engraving turned into a clean modern logo, flat vector, thin and thick engraved lines, deep navy background (#0b1122), brass/gold linework, tiny accent of deep red (#8a3a2a). Centered composition, plenty of empty space around it, sharp edges, no gradients, no mockup, no 3D, no extra text, no watermark.
```

## Variação: monograma (se o grimório ficar detalhado demais)

```
Minimal monogram app icon for a tabletop RPG app called "Grimório": a single bold capital letter "G" whose inner curve forms the outline of a twenty-sided die (d20), framed by a thin circular astrolabe ring with four small stars at the cardinal points. Flat vector, brass/gold (#c8a86a) on solid deep navy (#0b1122), engraved line accents, perfectly centered, readable at 16x16 pixels, no other text, no gradients, no 3D, no mockup.
```

---

## Dicas por gerador
- **Midjourney:** no fim do prompt, acrescente `--ar 1:1 --style raw --v 7 --no text, letters, watermark, mockup`.
- **ChatGPT / DALL·E:** comece com "Create a square image:" e repita no final "no text in the image".
- **Ideogram:** é o melhor para a **variação com o nome**, porque acerta as letras e o acento do "Ó". Use o modo *Design*.
- **Se aparecer texto errado** no ícone, gere de novo reforçando `no text, no letters`. Escrever o nome é trabalho da variação com o nome.

## O que conferir antes de aprovar
1. Reduzida a 32×32, ainda dá para reconhecer o livro e o dado.
2. Fica bem num círculo: o Discord e o celular cortam as bordas.
3. Funciona sobre fundo claro **e** escuro.
4. Não lembra o logo de nenhuma marca existente (D&D, Roll20, Wizards of the Coast). Isso evita problema de direitos.
