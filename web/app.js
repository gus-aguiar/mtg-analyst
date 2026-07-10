/* ============================================================
   MTG Deck Analyst — lógica do app
   Fluxo: parse da lista → Scryfall (dados + imagens) →
   Commander Spellbook (combos) → sinergias heurísticas →
   sugestões → renderização gráfica.
   ============================================================ */

"use strict";

const SCRYFALL_COLLECTION = "https://api.scryfall.com/cards/collection";
const SCRYFALL_NAMED = "https://api.scryfall.com/cards/named";
const SPELLBOOK_API = "https://backend.commanderspellbook.com/find-my-combos";
const SPELLBOOK_COMBO_URL = "https://commanderspellbook.com/combo/";

const $ = sel => document.querySelector(sel);

// ---------- utilidades ----------

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

const esc = s => String(s).replace(/[&<>"']/g,
  m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const sleep = ms => new Promise(r => setTimeout(r, ms));

const normName = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// ---------- tema claro/escuro ----------

$("#theme-toggle").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const cur = root.dataset.theme || (dark ? "dark" : "light");
  root.dataset.theme = cur === "dark" ? "light" : "dark";
});

// ---------- parser da lista ----------

function parseDecklist(text) {
  const commanders = [];
  const main = [];
  let section = "main";
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) {
      // linha em branco encerra a seção de comandante (estilo Moxfield)
      if (section === "commander") section = "main";
      continue;
    }
    if (line.startsWith("//") || line.startsWith("#")) continue;
    const up = line.toUpperCase().replace(/:$/, "").replace(/\s*\(\d+\)$/, "");
    if (/^(COMMANDER|COMANDANTE)S?$/.test(up)) { section = "commander"; continue; }
    if (/^(SIDEBOARD|MAYBEBOARD|CONSIDERING|RESERVA|DECK|MAINBOARD|MAIN)$/.test(up)) {
      section = /^(DECK|MAINBOARD|MAIN)$/.test(up) ? "main" : "skip";
      continue;
    }
    let qty = 1;
    const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (m) { qty = parseInt(m[1], 10); line = m[2]; }
    // remove sufixos de export (Moxfield/Archidekt): "(SET) 123", "*F*", "^tags^", "[categoria]"
    line = line
      .replace(/\s*\((?:[A-Z0-9]{2,6})\)(\s+[\w★-]+)?\s*$/i, "")
      .replace(/\s*\*[A-Z]+\*\s*$/i, "")
      .replace(/\s*\[[^\]]*\]\s*$/g, "")
      .replace(/\s*\^[^^]*\^\s*$/g, "")
      .trim();
    if (!line) continue;
    if (section === "skip") continue;
    const bucket = section === "commander" ? commanders : main;
    const existing = bucket.find(e => normName(e.name) === normName(line));
    if (existing) existing.qty += qty;
    else bucket.push({ name: line, qty });
  }
  return { commanders, main };
}

// ---------- Scryfall ----------

function normalizeScryfallCard(sc) {
  const face = sc.card_faces && sc.card_faces.length ? sc.card_faces[0] : null;
  const img = sc.image_uris || (face && face.image_uris) || null;
  const text = sc.oracle_text != null
    ? sc.oracle_text
    : (sc.card_faces || []).map(f => f.oracle_text || "").join("\n");
  return {
    name: sc.name,
    type: (sc.type_line || (face && face.type_line) || "").toLowerCase(),
    typeLine: sc.type_line || (face && face.type_line) || "",
    text: (text || "").toLowerCase(),
    cmc: sc.cmc != null ? sc.cmc : 0,
    manaCost: sc.mana_cost || (face && face.mana_cost) || "",
    colors: sc.colors || (face && face.colors) || [],
    identity: sc.color_identity || [],
    imgSmall: img ? (img.small || img.normal) : null,
    imgNormal: img ? (img.normal || img.large || img.small) : null,
    uri: sc.scryfall_uri || null,
  };
}

async function scryfallCollection(names, onProgress) {
  const found = new Map();
  const notFound = [];
  const chunks = [];
  for (let i = 0; i < names.length; i += 75) chunks.push(names.slice(i, i + 75));
  let done = 0;
  for (const chunk of chunks) {
    const resp = await fetch(SCRYFALL_COLLECTION, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: chunk.map(name => ({ name })) }),
    });
    if (!resp.ok) throw new Error(`Scryfall respondeu ${resp.status}`);
    const data = await resp.json();
    for (const sc of data.data || []) found.set(normName(sc.name), normalizeScryfallCard(sc));
    for (const nf of data.not_found || []) if (nf.name) notFound.push(nf.name);
    done++;
    if (onProgress) onProgress(done / chunks.length);
    if (chunks.length > 1) await sleep(120); // cortesia com a API
  }
  // segunda chance com busca aproximada (nomes com apóstrofos, acentos etc.)
  for (const name of notFound.slice(0, 12)) {
    try {
      const r = await fetch(`${SCRYFALL_NAMED}?fuzzy=${encodeURIComponent(name)}`);
      if (r.ok) {
        const card = normalizeScryfallCard(await r.json());
        found.set(normName(name), card);
        found.set(normName(card.name), card);
      }
      await sleep(120);
    } catch { /* mantém como não encontrada */ }
  }
  return { found, notFound: notFound.filter(n => !found.has(normName(n))) };
}

// resolve uma entrada da lista para a carta normalizada
function lookupCard(map, name) {
  const c = map.get(normName(name));
  if (c) return c;
  // "Nome // Verso" ↔ "Nome"
  const base = normName(name.split("//")[0]);
  for (const [k, v] of map) if (k === base || k.startsWith(base + " //")) return v;
  return null;
}

// ---------- Commander Spellbook ----------

async function fetchCombos(commanders, main) {
  const body = {
    commanders: commanders.map(e => ({ card: e.name, quantity: e.qty })),
    main: main.map(e => ({ card: e.name, quantity: e.qty })),
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const resp = await fetch(SPELLBOOK_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`Spellbook respondeu ${resp.status}`);
    const data = await resp.json();
    const res = data.results || data;
    return {
      included: res.included || [],
      almostIncluded: (res.almostIncluded || []).concat(res.almostIncludedByAddingColors || []),
    };
  } finally {
    clearTimeout(t);
  }
}

const variantCards = v => (v.uses || []).map(u => (u.card && u.card.name) || u.card).filter(Boolean);
const variantResults = v => (v.produces || [])
  .map(p => (p.feature && p.feature.name) || p.feature).filter(Boolean);

// ---------- tags, sinergias e sugestões ----------

function tagCard(card) {
  const tags = new Set();
  for (const def of TAG_DEFS) {
    try { if (def.test(card)) tags.add(def.id); } catch { /* regex defensivo */ }
  }
  return tags;
}

function buildSynergy(cards) {
  // cards: [{entry, card, tags}] sem terrenos
  const pairs = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const A = cards[i], B = cards[j];
      let score = 0;
      const reasons = new Set();
      for (const af of AFFINITY) {
        if ((A.tags.has(af.a) && B.tags.has(af.b)) || (A.tags.has(af.b) && B.tags.has(af.a))) {
          score += af.w;
          reasons.add(af.why);
        }
      }
      if (score >= 3) pairs.push({ a: A, b: B, score, reasons: [...reasons] });
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  // diversidade: cada carta aparece no máximo 3 vezes no top
  const seen = new Map();
  const top = [];
  for (const p of pairs) {
    const ca = (seen.get(p.a.card.name) || 0), cb = (seen.get(p.b.card.name) || 0);
    if (ca >= 3 || cb >= 3) continue;
    seen.set(p.a.card.name, ca + 1);
    seen.set(p.b.card.name, cb + 1);
    top.push(p);
    if (top.length >= 12) break;
  }
  // pontuação total por carta
  const totals = new Map();
  for (const p of pairs) {
    totals.set(p.a.card.name, (totals.get(p.a.card.name) || 0) + p.score);
    totals.set(p.b.card.name, (totals.get(p.b.card.name) || 0) + p.score);
  }
  const ranking = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return { topPairs: top, ranking, allPairs: pairs };
}

function themeCounts(cards) {
  const counts = new Map();
  for (const c of cards) for (const t of c.tags) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()]
    .map(([id, n]) => ({ def: TAG_DEFS.find(d => d.id === id), n }))
    .filter(e => e.def)
    .sort((a, b) => b.n - a.n);
}

function staplesFor(deckNames, identity, themes) {
  const idSet = new Set(identity);
  const strong = new Map(themes.filter(t => t.n >= 3).map(t => [t.def.id, t.n]));
  const out = [];
  for (const s of STAPLES) {
    if (deckNames.has(normName(s.name))) continue;
    if (!s.id.every(c => idSet.has(c))) continue;
    let score = 0;
    const hits = [];
    for (const t of s.tags) {
      if (strong.has(t)) { score += strong.get(t); hits.push(t); }
    }
    if (score > 0) out.push({ ...s, score, hits });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 12);
}

// ---------- símbolos de mana ----------

function manaChip(sym) {
  const known = "WUBRG".includes(sym) ? sym : "C";
  return `<span class="mana mana-${known}" title="${esc(sym)}">${esc(sym)}</span>`;
}

function pipCounts(cards) {
  const counts = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of cards) {
    for (const m of (c.card.manaCost.match(/\{([^}]+)\}/g) || [])) {
      const sym = m.slice(1, -1);
      for (const letter of ["W", "U", "B", "R", "G", "C"]) {
        if (sym.split("/").includes(letter)) { counts[letter] += c.entry.qty; break; }
      }
    }
  }
  return counts;
}

// ---------- gráficos ----------

const tip = $("#chart-tip");
function showTip(evt, html) {
  tip.innerHTML = html;
  tip.classList.remove("hidden");
  const pad = 14;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  const r = tip.getBoundingClientRect();
  if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
function hideTip() { tip.classList.add("hidden"); }

// barra vertical com topo arredondado (4px), ancorada na linha de base
function roundedTopBar(x, y, w, hgt, r) {
  if (hgt <= 0) return "";
  r = Math.min(r, w / 2, hgt);
  return `M${x},${y + hgt} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} ` +
         `Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + hgt} Z`;
}

// Curva de mana: gráfico de colunas SVG, série única, tooltip por barra.
function renderCurveChart(host, buckets) {
  const W = 460, H = 230, padL = 34, padR = 10, padT = 18, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(1, ...buckets.map(b => b.n));
  const maxIdx = buckets.findIndex(b => b.n === max);
  const step = plotW / buckets.length;
  const barW = Math.min(44, step - 8);
  const yFor = v => padT + plotH * (1 - v / max);

  let grid = "", bars = "", labels = "", hover = "";
  const ticks = 4;
  for (let i = 1; i <= ticks; i++) {
    const v = Math.round((max / ticks) * i);
    const y = yFor(v);
    grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--grid-line)" stroke-width="1"/>` +
            `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-muted)">${v}</text>`;
  }
  buckets.forEach((b, i) => {
    const x = padL + step * i + (step - barW) / 2;
    const hgt = plotH * (b.n / max);
    const y = padT + plotH - hgt;
    bars += `<path d="${roundedTopBar(x, y, barW, hgt, 4)}" fill="var(--series-1)"/>`;
    labels += `<text x="${padL + step * i + step / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--text-secondary)">${esc(b.label)}</text>`;
    if (i === maxIdx && b.n > 0) {
      labels += `<text x="${padL + step * i + step / 2}" y="${y - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text-primary)">${b.n}</text>`;
    }
    hover += `<rect x="${padL + step * i}" y="${padT}" width="${step}" height="${plotH}" fill="transparent" ` +
             `data-tip="<b>CMC ${esc(b.label)}</b>${b.n} carta${b.n === 1 ? "" : "s"}"/>`;
  });
  host.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva de mana">` +
    grid +
    `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="var(--baseline)" stroke-width="1"/>` +
    bars + labels + hover +
    `</svg>`;
}

// Barras horizontais em HTML (símbolo/rótulo + trilha + valor no fim).
function renderHBars(host, rows) {
  const max = Math.max(1, ...rows.map(r => r.value));
  host.innerHTML = "";
  const list = h("div", { class: "rank-list" });
  for (const r of rows) {
    const item = h("div", { class: "rank-item" });
    item.append(
      h("div", { class: "r-pos", html: r.iconHtml || "" }),
      h("div", { class: "r-name", title: r.label }, r.label),
      h("div", { class: "rank-bar-track" },
        h("div", { class: "rank-bar", style: `width:${(r.value / max) * 100}%` })),
      h("div", { class: "r-val" }, String(r.value)),
    );
    list.append(item);
  }
  host.append(list);
}

// ---------- renderização de cartas ----------

function cardImgEl(card, name, { size = "card-thumb", missing = false } = {}) {
  const frame = h("div", { class: "card-frame" });
  const displayName = card ? card.name : name;
  if (card && card.imgSmall) {
    frame.append(h("img", {
      class: size, src: card.imgSmall, alt: displayName, loading: "lazy",
      "data-preview": card.imgNormal || card.imgSmall,
    }));
  } else {
    frame.append(h("div", { class: "card-name-fallback" }, displayName));
  }
  if (missing) frame.append(h("span", { class: "missing-tag" }, "falta esta"));
  return frame;
}

// preview flutuante ao passar o mouse
const preview = $("#card-preview");
const previewImg = preview.querySelector("img");
document.addEventListener("mouseover", e => {
  const t = e.target.closest("[data-preview]");
  if (!t) return;
  previewImg.src = t.dataset.preview;
  preview.classList.remove("hidden");
});
document.addEventListener("mousemove", e => {
  if (preview.classList.contains("hidden")) return;
  const w = 260, hh = 363, pad = 18;
  let x = e.clientX + pad, y = e.clientY - hh / 2;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  y = Math.max(8, Math.min(y, innerHeight - hh - 8));
  preview.style.left = x + "px";
  preview.style.top = y + "px";
});
document.addEventListener("mouseout", e => {
  if (e.target.closest && e.target.closest("[data-preview]")) preview.classList.add("hidden");
});

// tooltip dos gráficos (delegação)
document.addEventListener("mousemove", e => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (t) showTip(e, t.dataset.tip);
  else hideTip();
});

// ---------- seções ----------

function renderOverview(state) {
  const strip = $("#commander-strip");
  strip.innerHTML = "";
  for (const cmd of state.commanders) {
    const card = cmd.card;
    const box = h("div", { class: "commander-card" });
    box.append(cardImgEl(card, cmd.entry.name, { size: "card-thumb" }));
    const meta = h("div", { class: "commander-meta" });
    meta.append(
      h("div", { class: "c-role" }, "Comandante"),
      h("div", { class: "c-name" }, card ? card.name : cmd.entry.name),
      h("div", { class: "c-type" }, card ? card.typeLine : ""),
      h("div", { class: "mana-row", html: state.identity.map(manaChip).join("") }),
    );
    box.append(meta);
    strip.append(box);
  }

  const nonland = state.resolved.filter(c => !c.card.type.includes("land"));
  const lands = state.resolved.filter(c => c.card.type.includes("land"))
    .reduce((s, c) => s + c.entry.qty, 0);
  const total = state.resolved.reduce((s, c) => s + c.entry.qty, 0) +
    state.commanders.filter(c => c.card).length;
  const avg = nonland.length
    ? nonland.reduce((s, c) => s + c.card.cmc * c.entry.qty, 0) /
      nonland.reduce((s, c) => s + c.entry.qty, 0)
    : 0;

  const tiles = $("#stat-tiles");
  tiles.innerHTML = "";
  const tile = (label, value, note) => {
    const t = h("div", { class: "tile" });
    t.append(h("div", { class: "t-label" }, label), h("div", { class: "t-value" }, value));
    if (note) t.append(note);
    return t;
  };
  tiles.append(
    tile("Cartas", String(total)),
    tile("Terrenos", String(lands)),
    tile("CMC médio", avg.toFixed(2)),
    tile("Combos prontos", String(state.combos ? state.combos.included.length : 0)),
    tile("Temas fortes", String(state.themes.filter(t => t.n >= 3).length)),
  );

  // saúde do deck: contagens vs. referências comuns de Commander
  const count = tag => state.taggedCards.filter(c => c.tags.has(tag))
    .reduce((s, c) => s + c.entry.qty, 0);
  const ramp = count("ramp"), draw = count("draw"), removal = count("removal");
  const health = $("#health-tiles");
  health.innerHTML = "";
  const hTile = (label, value, ok, warnMsg, okMsg) => {
    const cls = ok ? "s-good" : "s-warn";
    const t = h("div", { class: "tile" });
    t.append(
      h("div", { class: "t-label" }, label),
      h("div", { class: "t-value" }, String(value)),
      h("div", { class: "t-note" },
        h("span", { class: `status-dot ${cls}` }),
        ok ? okMsg : warnMsg),
    );
    return t;
  };
  health.append(
    hTile("Terrenos + rochas", lands + ramp, lands + ramp >= 40, "abaixo do comum (40+)", "base de mana ok"),
    hTile("Ramp", ramp, ramp >= 8, "recomendado: 8+", "quantidade boa"),
    hTile("Compra de cartas", draw, draw >= 8, "recomendado: 8+", "quantidade boa"),
    hTile("Remoção", removal, removal >= 6, "recomendado: 6+", "quantidade boa"),
  );
}

function renderCharts(state) {
  const nonland = state.resolved.filter(c => !c.card.type.includes("land"));
  const buckets = [];
  for (let i = 0; i <= 7; i++) buckets.push({ label: i === 7 ? "7+" : String(i), n: 0 });
  for (const c of nonland) buckets[Math.min(7, Math.round(c.card.cmc))].n += c.entry.qty;
  renderCurveChart($("#chart-curve"), buckets);

  const pips = pipCounts(nonland);
  const pipRows = ["W", "U", "B", "R", "G", "C"]
    .filter(k => pips[k] > 0)
    .map(k => ({ label: { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde", C: "Incolor" }[k],
                 value: pips[k], iconHtml: manaChip(k) }));
  renderHBars($("#chart-pips"), pipRows);

  const typeKeys = [["creature", "Criaturas"], ["instant", "Instantâneos"], ["sorcery", "Feitiços"],
    ["artifact", "Artefatos"], ["enchantment", "Encantamentos"], ["planeswalker", "Planeswalkers"],
    ["battle", "Batalhas"], ["land", "Terrenos"]];
  const typeRows = [];
  for (const [key, label] of typeKeys) {
    const n = state.resolved.filter(c => c.card.type.includes(key) &&
      // evita contagem dupla (ex.: criatura-artefato conta como criatura)
      typeKeys.findIndex(([k2]) => c.card.type.includes(k2)) === typeKeys.findIndex(([k3]) => k3 === key))
      .reduce((s, c) => s + c.entry.qty, 0);
    if (n > 0) typeRows.push({ label, value: n });
  }
  renderHBars($("#chart-types"), typeRows);

  renderHBars($("#chart-themes"), state.themes.slice(0, 10).map(t => ({
    label: t.def.label, value: t.n, iconHtml: `<span title="${esc(t.def.label)}">${t.def.icon}</span>`,
  })));
}

function renderCombos(state) {
  const box = $("#combos-list");
  box.innerHTML = "";
  if (state.comboError) {
    box.append(h("div", { class: "warn-note" },
      "Não foi possível consultar o Commander Spellbook agora (", state.comboError, "). ",
      "As sinergias e sugestões heurísticas abaixo continuam valendo."));
    return;
  }
  const combos = state.combos.included;
  if (!combos.length) {
    box.append(h("p", { class: "combo-empty" },
      "Nenhum combo fechado foi encontrado na lista — veja na seção 5 as cartas que completam combos que estão quase prontos."));
    return;
  }
  for (const v of combos.slice(0, 20)) {
    const item = h("div", { class: "combo-item" });
    const cardsRow = h("div", { class: "combo-cards" });
    const names = variantCards(v);
    names.forEach((name, i) => {
      if (i > 0) cardsRow.append(h("span", { class: "plus" }, "+"));
      cardsRow.append(cardImgEl(lookupCard(state.cardMap, name), name));
    });
    item.append(cardsRow);
    const results = variantResults(v);
    if (results.length) {
      const res = h("div", { class: "combo-result" });
      res.append(h("div", { class: "r-label" }, "Resultado"));
      res.append(h("div", { class: "result-chips" },
        results.slice(0, 6).map(r => h("span", { class: "chip" }, r))));
      item.append(res);
    }
    if (v.description) {
      const det = h("details", null,
        h("summary", { style: "cursor:pointer;font-size:12.5px;color:var(--text-secondary);margin-top:8px" },
          "Como executar (inglês)"),
        h("p", { style: "font-size:12.5px;color:var(--text-secondary);white-space:pre-wrap" }, v.description));
      item.append(det);
    }
    if (v.id != null) {
      item.append(h("a", { class: "combo-link", href: SPELLBOOK_COMBO_URL + v.id, target: "_blank", rel: "noopener" },
        "Ver no Commander Spellbook ↗"));
    }
    box.append(item);
  }
  if (combos.length > 20) {
    box.append(h("p", { class: "sub" }, `… e mais ${combos.length - 20} combos.`));
  }
}

function renderSynergies(state) {
  const box = $("#synergy-pairs");
  box.innerHTML = "";
  if (!state.synergy.topPairs.length) {
    box.append(h("p", { class: "combo-empty" }, "Nenhum par de alta sinergia detectado."));
  } else {
    const grid = h("div", { class: "pair-grid" });
    for (const p of state.synergy.topPairs) {
      const item = h("div", { class: "pair-item" });
      const cards = h("div", { class: "pair-cards" },
        cardImgEl(p.a.card, p.a.card.name, { size: "card-thumb-sm" }),
        h("span", { class: "amp" }, "+"),
        cardImgEl(p.b.card, p.b.card.name, { size: "card-thumb-sm" }));
      const why = h("div", null,
        h("div", { class: "pair-score" }, `sinergia ${p.score}`),
        h("div", { class: "pair-why", html: `<b>${esc(p.a.card.name)}</b> + <b>${esc(p.b.card.name)}</b>: ${esc(p.reasons.join("; "))}.` }));
      item.append(cards, why);
      grid.append(item);
    }
    box.append(grid);
  }

  const rank = $("#synergy-ranking");
  rank.innerHTML = "";
  const max = Math.max(1, ...state.synergy.ranking.map(r => r[1]));
  const list = h("div", { class: "rank-list" });
  state.synergy.ranking.forEach(([name, score], i) => {
    const card = lookupCard(state.cardMap, name);
    const item = h("div", { class: "rank-item" });
    item.append(
      h("div", { class: "r-pos" }, `${i + 1}º`),
      h("div", { class: "r-name", "data-preview": card && card.imgNormal ? card.imgNormal : null, title: name }, name),
      h("div", { class: "rank-bar-track" }, h("div", { class: "rank-bar", style: `width:${(score / max) * 100}%` })),
      h("div", { class: "r-val" }, String(score)),
    );
    list.append(item);
  });
  rank.append(list);
}

function renderSuggestions(state) {
  const comboBox = $("#combo-suggestions");
  comboBox.innerHTML = "";
  if (state.comboError) {
    comboBox.append(h("p", { class: "combo-empty" }, "Indisponível sem o Commander Spellbook."));
  } else if (!state.comboSuggestions.length) {
    comboBox.append(h("p", { class: "combo-empty" }, "Nenhum combo a 1 carta de distância foi encontrado."));
  } else {
    const grid = h("div", { class: "suggest-grid" });
    for (const s of state.comboSuggestions) {
      const item = h("div", { class: "suggest-item" });
      item.append(cardImgEl(lookupCard(state.extraMap, s.name), s.name, { size: "card-thumb-sm" }));
      const meta = h("div", { class: "suggest-meta" });
      meta.append(
        h("div", { class: "s-name" }, s.name),
        h("div", { class: "s-why" }, `Fecha combo com: ${s.partners.slice(0, 3).join(", ")}${s.partners.length > 3 ? "…" : ""}`),
        h("span", { class: "s-badge" }, `completa ${s.count} combo${s.count === 1 ? "" : "s"}`),
      );
      item.append(meta);
      grid.append(item);
    }
    comboBox.append(grid);
  }

  const themeBox = $("#theme-suggestions");
  themeBox.innerHTML = "";
  if (!state.staples.length) {
    themeBox.append(h("p", { class: "combo-empty" }, "Sem sugestões — os temas do deck já estão bem servidos."));
    return;
  }
  const grid = h("div", { class: "suggest-grid" });
  for (const s of state.staples) {
    const item = h("div", { class: "suggest-item" });
    item.append(cardImgEl(lookupCard(state.extraMap, s.name), s.name, { size: "card-thumb-sm" }));
    const meta = h("div", { class: "suggest-meta" });
    const themeLabels = s.hits
      .map(t => (TAG_DEFS.find(d => d.id === t) || {}).label).filter(Boolean);
    meta.append(
      h("div", { class: "s-name" }, s.name),
      h("div", { class: "s-why" }, s.why),
      h("span", { class: "s-badge" }, `tema: ${themeLabels.join(" · ") || "geral"}`),
    );
    item.append(meta);
    grid.append(item);
  }
  themeBox.append(grid);
}

function renderDeckGrid(state) {
  const box = $("#deck-grid");
  box.innerHTML = "";
  const groups = new Map(TYPE_ORDER.map(([k]) => [k, []]));
  for (const cmd of state.commanders) {
    groups.get("commander").push({ entry: cmd.entry, card: cmd.card });
  }
  for (const c of state.resolved) {
    const t = c.card.type;
    let key = "other";
    for (const [k] of TYPE_ORDER) {
      if (k !== "commander" && k !== "other" && t.includes(k)) { key = k; break; }
    }
    groups.get(key).push(c);
  }
  for (const [key, label] of TYPE_ORDER) {
    const cards = groups.get(key);
    if (!cards.length) continue;
    cards.sort((a, b) => (a.card ? a.card.cmc : 0) - (b.card ? b.card.cmc : 0) ||
      a.entry.name.localeCompare(b.entry.name));
    const total = cards.reduce((s, c) => s + c.entry.qty, 0);
    const group = h("div", { class: "type-group" });
    group.append(h("h4", { html: `${esc(label)} <span class="count">(${total})</span>` }));
    const flow = h("div", { class: "cards-flow" });
    for (const c of cards) {
      const frame = cardImgEl(c.card, c.entry.name, { size: "card-thumb-sm" });
      if (c.entry.qty > 1) frame.append(h("span", { class: "qty-badge" }, `${c.entry.qty}×`));
      flow.append(frame);
    }
    group.append(flow);
    box.append(group);
  }
}

// ---------- fluxo principal ----------

function setProgress(pct, msg) {
  $("#progress").classList.remove("hidden");
  $("#progress-bar").style.width = pct + "%";
  $("#progress-msg").textContent = msg;
}

function fail(msg) {
  const box = $("#error-box");
  box.innerHTML = "";
  box.append(h("b", null, "Não foi possível analisar o deck. "), h("span", null, msg));
  box.classList.remove("hidden");
  $("#progress").classList.add("hidden");
}

async function analyze() {
  const btn = $("#analyze-btn");
  const text = $("#decklist").value.trim();
  $("#error-box").classList.add("hidden");
  $("#results").classList.add("hidden");
  if (!text) { fail("Cole a lista do deck no campo acima."); return; }

  const { commanders, main } = parseDecklist(text);
  if (!commanders.length && !main.length) { fail("Nenhuma carta reconhecida na lista."); return; }

  btn.disabled = true;
  try {
    // 1) Scryfall — dados e imagens do deck
    setProgress(8, "Buscando cartas no Scryfall…");
    const allNames = [...commanders, ...main].map(e => e.name);
    let sf;
    try {
      sf = await scryfallCollection(allNames, f => setProgress(8 + f * 45, "Buscando cartas no Scryfall…"));
    } catch (e) {
      fail(`Falha ao acessar a API do Scryfall (${e.message}). Verifique sua conexão — se abriu o arquivo localmente, tente servir com "python3 -m http.server" e abrir via http://localhost:8000/web/.`);
      return;
    }
    const cardMap = sf.found;

    const cmdResolved = commanders.map(entry => ({ entry, card: lookupCard(cardMap, entry.name) }));
    const resolved = [];
    const unresolved = [];
    for (const entry of main) {
      const card = lookupCard(cardMap, entry.name);
      if (card) resolved.push({ entry, card });
      else unresolved.push(entry.name);
    }

    // identidade de cor: do(s) comandante(s), senão união do deck
    let identity = [...new Set(cmdResolved.flatMap(c => c.card ? c.card.identity : []))];
    if (!identity.length) identity = [...new Set(resolved.flatMap(c => c.card.identity))];
    identity = ["W", "U", "B", "R", "G"].filter(c => identity.includes(c));

    // 2) tags + sinergias (local, sem rede)
    setProgress(58, "Analisando sinergias…");
    const taggedCards = resolved
      .concat(cmdResolved.filter(c => c.card))
      .filter(c => !c.card.type.includes("land") || /creature/.test(c.card.type))
      .map(c => ({ ...c, tags: tagCard(c.card) }));
    const synergy = buildSynergy(taggedCards);
    const themes = themeCounts(taggedCards);

    // 3) Commander Spellbook — combos
    setProgress(66, "Consultando combos no Commander Spellbook…");
    let combos = { included: [], almostIncluded: [] };
    let comboError = null;
    try {
      combos = await fetchCombos(
        cmdResolved.map(c => ({ name: c.card ? c.card.name : c.entry.name, qty: c.entry.qty })),
        resolved.map(c => ({ name: c.card.name, qty: c.entry.qty })));
    } catch (e) {
      comboError = e.name === "AbortError" ? "tempo esgotado" : e.message;
    }

    // 4) sugestões: cartas que fecham combos + staples por tema
    setProgress(78, "Montando sugestões…");
    const deckNames = new Set(
      [...cardMap.keys()].concat([...commanders, ...main].map(e => normName(e.name))));
    const missing = new Map();
    for (const v of combos.almostIncluded) {
      const names = variantCards(v);
      const absent = names.filter(n => !deckNames.has(normName(n)) && !lookupCard(cardMap, n));
      if (absent.length !== 1) continue;
      const name = absent[0];
      const rec = missing.get(name) || { name, count: 0, partners: new Set() };
      rec.count++;
      names.filter(n => n !== name).forEach(n => rec.partners.add(n));
      missing.set(name, rec);
    }
    const comboSuggestions = [...missing.values()]
      .sort((a, b) => b.count - a.count).slice(0, 12)
      .map(r => ({ ...r, partners: [...r.partners] }));

    const staples = staplesFor(deckNames, identity, themes);

    // imagens das sugestões
    let extraMap = new Map();
    const extraNames = [...new Set(comboSuggestions.map(s => s.name).concat(staples.map(s => s.name)))];
    if (extraNames.length) {
      setProgress(86, "Baixando imagens das sugestões…");
      try { extraMap = (await scryfallCollection(extraNames)).found; } catch { /* mostra fallback de texto */ }
    }

    // 5) render
    setProgress(96, "Desenhando…");
    const state = {
      commanders: cmdResolved, resolved, cardMap, extraMap, identity,
      taggedCards, synergy, themes, combos, comboError, comboSuggestions, staples,
    };
    renderOverview(state);
    renderCharts(state);
    renderCombos(state);
    renderSynergies(state);
    renderSuggestions(state);
    renderDeckGrid(state);

    const oldNote = $("#overview-section .warn-note");
    if (oldNote) oldNote.remove();
    if (unresolved.length || sf.notFound.length) {
      const names = [...new Set(unresolved.concat(sf.notFound))];
      const note = h("div", { class: "warn-note" },
        `⚠️ ${names.length} carta(s) não encontrada(s) no Scryfall e ignorada(s): ${names.slice(0, 10).join(", ")}${names.length > 10 ? "…" : ""}. Confira a grafia (nomes em inglês).`);
      $("#overview-section").prepend(note);
    }

    $("#progress").classList.add("hidden");
    $("#results").classList.remove("hidden");
    $("#overview-section").scrollIntoView({ behavior: "smooth" });
  } finally {
    btn.disabled = false;
  }
}

$("#analyze-btn").addEventListener("click", () => { analyze().catch(e => fail(e.message)); });
$("#example-btn").addEventListener("click", () => { $("#decklist").value = EXAMPLE_DECK; });
