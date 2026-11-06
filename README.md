# Grimório: fichas de D&D 5e

Site de fichas de personagem para usar **durante a sessão**, no PC ou no celular. Suporta as duas edições, cada uma com a sua própria lista de personagens:

- **D&D 2014** (SRD 5.1): bônus de atributo vêm da raça, com sub-raças.
- **D&D 2024** (SRD 5.2): atributos e talento de origem vêm do antecedente, com maestria de armas.

## O que tem

- **Criador passo a passo**: raça/espécie → classe → antecedente → atributos (matriz padrão, compra de pontos, 4d6 ou manual) → perícias → detalhes.
- **Ficha automática**: modificadores, salvaguardas, perícias (proficiência e especialização), CA (armadura, escudo, Defesa sem Armadura), iniciativa, PV, ataques com armas, CD e ataque de magia e espaços de magia, inclusive multiclasse e Pacto.
- **Modo mesa**: clique em qualquer número para rolar; vantagem e desvantagem; crítico; dano e cura com anel de PV; PV temporários; testes contra a morte; Dados de Vida; descanso curto e longo, que recuperam tudo sozinhos; condições e exaustão; recursos de classe (Fúria, Ki, Surto de Ação…).
- **Magias**: 319 (2014) e 339 (2024), com busca, preparo, conjuração que gasta o espaço e rola o dano, e concentração.
- **Inventário**: equipamentos e itens mágicos do SRD, moedas, carga e sintonização.
- **Subir de nível**: média ou rolagem de PV, novas características, subclasse e multiclasse.
- **Compêndio** para consultar classes, subclasses, raças, antecedentes, talentos, equipamentos, itens mágicos, condições e regras.
- **Homebrew**: cadastre raças, classes, subclasses, antecedentes, talentos, magias e itens. Exporte o pacote `.json` para compartilhar com a mesa ou cole um JSON pronto.
- **Exportar e importar ficha** (`.json`) para backup ou para passar para outro computador.

Tudo fica salvo no navegador (`localStorage`). Limpar os dados do navegador apaga as fichas, então exporte de vez em quando.

## Rodar localmente

```bash
npm install
npm run dev
```

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie este projeto para a branch `main`.
2. No repositório, vá em **Settings → Pages → Build and deployment → Source** e escolha **GitHub Actions**.
3. Cada push na `main` testa, compila e publica sozinho (veja `.github/workflows/deploy.yml`).

## Atualizar os dados do SRD

```bash
npm run data
```

Esse comando baixa o JSON do [5e-bits/5e-database](https://github.com/5e-bits/5e-database) e gera `public/data/srd-2014.json` e `public/data/srd-2024.json`.

## Licença do conteúdo

Inclui material do System Reference Document 5.1 e 5.2 da Wizards of the Coast LLC, disponível em https://dnd.wizards.com/resources/systems-reference-document, sob a licença Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/legalcode). Este projeto não é afiliado à Wizards of the Coast.
