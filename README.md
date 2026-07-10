# MTG Analyst

Ferramentas para analisar decks de Magic: The Gathering (foco em Commander).

## 🔍 Analisador visual de deck (`web/`)

Cole a lista do seu deck e veja, **tudo em formato gráfico com as imagens das
cartas** (via [Scryfall](https://scryfall.com)):

1. **Visão geral** — comandante, identidade de cor, contagens e "saúde" do deck
   (terrenos, ramp, compra, remoção vs. referências de Commander);
2. **Gráficos** — curva de mana, símbolos de mana nos custos, tipos de carta e
   temas detectados;
3. **Combos** — combos fechados presentes na lista, confirmados pelo banco de
   dados do [Commander Spellbook](https://commanderspellbook.com), com as
   imagens das cartas e o resultado de cada combo;
4. **Sinergias** — pares de cartas que trabalham juntas (motor heurístico que
   lê o texto das cartas), com explicação em português + ranking das cartas
   mais sinérgicas;
5. **Sugestões** — cartas que faltam para completar combos "quase prontos" e
   staples curados que casam com os temas e a identidade de cor do deck;
6. **Deck completo** — grid com as imagens agrupadas por tipo, com preview
   ampliado ao passar o mouse.

### Como usar

O app é 100 % estático (HTML + CSS + JS puro, sem build):

```bash
# opção 1: abrir direto
xdg-open web/index.html          # (ou dê dois cliques no arquivo)

# opção 2: servir localmente (recomendado se o navegador bloquear algo)
python3 -m http.server 8000
# e abra http://localhost:8000/web/
```

Cole a lista (formatos aceitos: `1 Nome`, `1x Nome`, exports do
Moxfield/Archidekt com `(SET) 123`, seções `COMMANDER:` / `SIDEBOARD:`) e
clique em **Analisar deck**. O botão "Carregar exemplo" preenche com um deck
de Isshin Mardu. As chamadas ao Scryfall e ao Commander Spellbook são feitas
pelo próprio navegador — é preciso estar online.

### Teste

`web/test/mock_test.mjs` roda o app no Chromium via Playwright com as duas
APIs mockadas (claro, escuro e cenário de Spellbook fora do ar):

```bash
cd web/test && node mock_test.mjs   # requer playwright instalado
```

## 🎲 Simulador goldfish (`simulator.py`)

Simulador heurístico de partidas para o deck Isshin Mardu (banco de cartas
feito à mão em `cards_db.py`). Gera relatório em PDF com gráficos:

```bash
pip install -r requirements.txt
python simulator.py --sims 5000 --turns 10 --life 40 --out out
```

---

Dados e imagens de cartas © Scryfall · Combos © Commander Spellbook ·
Projeto não afiliado à Wizards of the Coast.
