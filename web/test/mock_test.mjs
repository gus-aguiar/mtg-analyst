// Teste E2E do MTG Deck Analyst com APIs mockadas (Scryfall + Spellbook).
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(OUT_DIR, "..");

// ---------- fixtures ----------
const svgCard = (name, color) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='146' height='204'>
    <rect width='146' height='204' rx='8' fill='${color}'/>
    <rect x='8' y='8' width='130' height='188' rx='5' fill='#f4efe0'/>
    <text x='73' y='105' text-anchor='middle' font-size='11' font-family='sans-serif'>${name.slice(0, 18)}</text>
  </svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
};

const mk = (name, type_line, oracle_text, cmc, mana_cost, colors, identity) => ({
  name, type_line, oracle_text, cmc, mana_cost, colors, color_identity: identity,
  image_uris: { small: svgCard(name, "#7a5c2e"), normal: svgCard(name, "#7a5c2e") },
  scryfall_uri: "https://scryfall.com/card/x/" + encodeURIComponent(name),
});

const CARDS = [
  mk("Isshin, Two Heavens as One", "Legendary Creature — Human Samurai",
     "If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.",
     3, "{R}{W}{B}", ["R","W","B"], ["B","R","W"]),
  mk("Hero of Bladehold", "Creature — Human Knight",
     "Battle cry. Whenever Hero of Bladehold attacks, create two 1/1 white Soldier creature tokens that are tapped and attacking.",
     4, "{2}{W}{W}", ["W"], ["W"]),
  mk("Impact Tremors", "Enchantment",
     "Whenever a creature you control enters, Impact Tremors deals 1 damage to each opponent.",
     2, "{1}{R}", ["R"], ["R"]),
  mk("Skullclamp", "Artifact — Equipment",
     "Equipped creature gets +1/-1. Whenever equipped creature dies, draw two cards. Equip {1}",
     1, "{1}", [], []),
  mk("Mondrak, Glory Dominus", "Legendary Creature — Phyrexian Horror",
     "If one or more tokens would be created under your control, twice that many of those tokens are created instead.",
     4, "{2}{W}{W}", ["W"], ["W"]),
  mk("Krenko, Tin Street Kingpin", "Legendary Creature — Goblin",
     "Whenever Krenko, Tin Street Kingpin attacks, put a +1/+1 counter on it, then create a number of 1/1 red Goblin creature tokens equal to its power.",
     3, "{2}{R}", ["R"], ["R"]),
  mk("Zulaport Cutthroat", "Creature — Human Rogue Ally",
     "Whenever Zulaport Cutthroat or another creature you control dies, each opponent loses 1 life and you gain 1 life.",
     2, "{1}{B}", ["B"], ["B"]),
  mk("Goblin Bombardment", "Enchantment",
     "Sacrifice a creature: Goblin Bombardment deals 1 damage to any target.",
     2, "{1}{R}", ["R"], ["R"]),
  mk("Smothering Tithe", "Enchantment",
     "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.",
     4, "{3}{W}", ["W"], ["W"]),
  mk("Sol Ring", "Artifact", "{T}: Add {C}{C}.", 1, "{1}", [], []),
  mk("Swords to Plowshares", "Instant",
     "Exile target creature. Its controller gains life equal to its power.",
     1, "{W}", ["W"], ["W"]),
  mk("Mountain", "Basic Land — Mountain", "({T}: Add {R}.)", 0, "", [], ["R"]),
  mk("Plains", "Basic Land — Plains", "({T}: Add {W}.)", 0, "", [], ["W"]),
  mk("Swamp", "Basic Land — Swamp", "({T}: Add {B}.)", 0, "", [], ["B"]),
];
const CARD_INDEX = new Map(CARDS.map(c => [c.name.toLowerCase(), c]));

const SPELLBOOK_RESPONSE = {
  results: {
    identity: "WBR",
    included: [{
      id: "1000-2000",
      uses: [
        { card: { name: "Krenko, Tin Street Kingpin" }, quantity: 1 },
        { card: { name: "Impact Tremors" }, quantity: 1 },
        { card: { name: "Mondrak, Glory Dominus" }, quantity: 1 },
      ],
      produces: [
        { feature: { name: "Damage to each opponent" } },
        { feature: { name: "Infinite tokens" } },
      ],
      description: "Attack with Krenko, create tokens, each token deals damage via Impact Tremors.",
    }],
    almostIncluded: [{
      id: "3000-4000",
      uses: [
        { card: { name: "Krenko, Tin Street Kingpin" }, quantity: 1 },
        { card: { name: "Purphoros, God of the Forge" }, quantity: 1 },
      ],
      produces: [{ feature: { name: "Damage to each opponent" } }],
    }, {
      id: "3000-5000",
      uses: [
        { card: { name: "Zulaport Cutthroat" }, quantity: 1 },
        { card: { name: "Purphoros, God of the Forge" }, quantity: 1 },
        { card: { name: "Goblin Bombardment" }, quantity: 1 },
      ],
      produces: [{ feature: { name: "Each opponent loses life" } }],
    }],
    almostIncludedByAddingColors: [],
  },
};

const DECKLIST = `COMMANDER:
1 Isshin, Two Heavens as One

1 Hero of Bladehold
1 Impact Tremors
1 Skullclamp
1 Mondrak, Glory Dominus
1 Krenko, Tin Street Kingpin
1 Zulaport Cutthroat
1 Goblin Bombardment
1 Smothering Tithe
1 Sol Ring
1 Swords to Plowshares
1 Carta Inexistente XYZ
3 Mountain
2 Plains
2 Swamp`;

// ---------- teste ----------
const errors = [];
const browser = await chromium.launch();

async function runScenario(colorScheme, shotName) {
  const page = await browser.newPage({ colorScheme, viewport: { width: 1280, height: 900 } });
  page.on("console", m => {
    // 404 de recurso é esperado: o mock nega a busca fuzzy das sugestões
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
      errors.push(`[${colorScheme}] console: ${m.text()}`);
    }
  });
  page.on("pageerror", e => errors.push(`[${colorScheme}] pageerror: ${e.message}`));

  await page.route("https://api.scryfall.com/**", async route => {
    const req = route.request();
    if (req.url().includes("/cards/collection")) {
      const body = JSON.parse(req.postData());
      const data = [], not_found = [];
      for (const id of body.identifiers) {
        const c = CARD_INDEX.get(id.name.toLowerCase());
        if (c) data.push(c); else not_found.push({ name: id.name });
      }
      await route.fulfill({ json: { object: "list", data, not_found } });
    } else if (req.url().includes("/cards/named")) {
      await route.fulfill({ status: 404, json: { object: "error", details: "not found" } });
    } else {
      await route.fulfill({ status: 404, body: "" });
    }
  });
  await page.route("https://backend.commanderspellbook.com/**", route =>
    route.fulfill({ json: SPELLBOOK_RESPONSE }));

  await page.goto("file://" + WEB_DIR + "/index.html");
  await page.fill("#decklist", DECKLIST);
  await page.click("#analyze-btn");
  try {
    await page.waitForSelector("#results:not(.hidden)", { timeout: 30000 });
  } catch (e) {
    console.log("  DEBUG errorbox:", await page.locator("#error-box").innerText().catch(() => "-"));
    console.log("  DEBUG progress:", await page.locator("#progress-msg").innerText().catch(() => "-"));
    throw e;
  }
  await page.waitForTimeout(400);

  // checagens de conteúdo
  const checks = [
    ["curva de mana desenhada", await page.locator("#chart-curve svg path").count() > 0],
    ["pips renderizados", await page.locator("#chart-pips .rank-item").count() >= 3],
    ["tipos renderizados", await page.locator("#chart-types .rank-item").count() >= 3],
    ["temas renderizados", await page.locator("#chart-themes .rank-item").count() >= 3],
    ["combo incluído aparece", await page.locator("#combos-list .combo-item").count() === 1],
    ["chips de resultado do combo", await page.locator("#combos-list .chip").count() >= 2],
    ["pares de sinergia", await page.locator("#synergy-pairs .pair-item").count() >= 4],
    ["ranking de sinergia", await page.locator("#synergy-ranking .rank-item").count() >= 5],
    ["sugestão de combo (Purphoros)", (await page.locator("#combo-suggestions").innerText()).includes("Purphoros")],
    ["badge 'completa 2 combos'", (await page.locator("#combo-suggestions").innerText()).includes("completa 2 combos")],
    ["staples sugeridos", await page.locator("#theme-suggestions .suggest-item").count() >= 4],
    ["grid do deck agrupado", await page.locator("#deck-grid .type-group").count() >= 5],
    ["aviso de carta não encontrada", (await page.locator("#overview-section").innerText()).includes("Carta Inexistente")],
    ["tiles de visão geral", await page.locator("#stat-tiles .tile").count() === 5],
    ["tiles de saúde", await page.locator("#health-tiles .tile").count() === 4],
  ];
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✅" : "❌"} ${label}`);
    if (!ok) errors.push(`[${colorScheme}] falhou: ${label}`);
  }

  // hover preview em uma carta do grid
  await page.hover("#deck-grid img >> nth=0");
  const previewVisible = await page.locator("#card-preview:not(.hidden)").count() === 1;
  console.log(`  ${previewVisible ? "✅" : "❌"} preview flutuante no hover`);
  if (!previewVisible) errors.push(`[${colorScheme}] preview de carta não apareceu no hover`);

  await page.screenshot({ path: path.join(OUT_DIR, `${shotName}-top.png`) });
  await page.locator("#synergy-section").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT_DIR, `${shotName}-synergy.png`) });
  await page.close();
}

console.log("— modo claro —");
await runScenario("light", "light");
console.log("— modo escuro —");
await runScenario("dark", "dark");

// cenário: Spellbook fora do ar (deve degradar com aviso, sem quebrar)
console.log("— spellbook offline —");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", e => errors.push(`[offline] pageerror: ${e.message}`));
  await page.route("https://api.scryfall.com/**", async route => {
    const req = route.request();
    if (req.url().includes("/cards/collection")) {
      const body = JSON.parse(req.postData());
      const data = [], not_found = [];
      for (const id of body.identifiers) {
        const c = CARD_INDEX.get(id.name.toLowerCase());
        if (c) data.push(c); else not_found.push({ name: id.name });
      }
      await route.fulfill({ json: { object: "list", data, not_found } });
    } else { await route.fulfill({ status: 404, json: {} }); }
  });
  await page.route("https://backend.commanderspellbook.com/**", route => route.abort());
  await page.goto("file://" + WEB_DIR + "/index.html");
  await page.fill("#decklist", DECKLIST);
  await page.click("#analyze-btn");
  await page.waitForSelector("#results:not(.hidden)", { timeout: 30000 });
  const warn = (await page.locator("#combos-list").innerText()).includes("Commander Spellbook");
  const pairs = await page.locator("#synergy-pairs .pair-item").count() >= 4;
  console.log(`  ${warn ? "✅" : "❌"} aviso de indisponibilidade`);
  console.log(`  ${pairs ? "✅" : "❌"} sinergias continuam funcionando`);
  if (!warn) errors.push("[offline] aviso do Spellbook não apareceu");
  if (!pairs) errors.push("[offline] sinergias não renderizaram");
  await page.close();
}

await browser.close();
if (errors.length) {
  console.log("\nFALHAS:");
  for (const e of errors) console.log(" - " + e);
  process.exit(1);
}
console.log("\nTudo passou ✅");
