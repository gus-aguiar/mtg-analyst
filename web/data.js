/* ============================================================
   MTG Deck Analyst — base de conhecimento
   - TAG_DEFS: como detectar cada tema no texto da carta
   - AFFINITY: quais temas combinam entre si (gera as sinergias)
   - STAPLES: sugestões curadas por tema
   - EXAMPLE_DECK: lista de exemplo (Isshin Mardu)
   ============================================================ */

// Cada tag testa o texto normalizado da carta (minúsculas) e a linha de tipo.
// c = { name, type, text, cmc, colors, identity, keywords }
const TAG_DEFS = [
  { id: "attack_trigger", label: "Gatilhos de ataque", icon: "⚔️",
    test: c => /whenever [^.]{0,60}attacks|attack, /.test(c.text) || /battle cry|myriad|melee|raid —/.test(c.text) },
  { id: "trigger_doubler", label: "Duplica gatilhos", icon: "✨",
    test: c => /triggers? an additional time|triggers? one more time/.test(c.text) },
  { id: "extra_combat", label: "Combates extras", icon: "🔁",
    test: c => /additional combat phase/.test(c.text) },
  { id: "token", label: "Gera tokens", icon: "👥",
    test: c => /creates? (a|one|two|three|four|five|x|that many|[0-9]+)?[^.]{0,80}token/.test(c.text) },
  { id: "token_doubler", label: "Dobra tokens", icon: "👥✕2",
    test: c => /twice that many (of those )?tokens|one of those tokens, it creates|instead creates? twice/.test(c.text) },
  { id: "go_wide_payoff", label: "Recompensa por ir de wide", icon: "📣",
    test: c => /for each (attacking creature|creature you control|creature that attacked)/.test(c.text) },
  { id: "anthem", label: "Anthem (+X/+X)", icon: "🚩",
    test: c => /creatures you control get \+|attacking creatures (you control )?get \+/.test(c.text) },
  { id: "etb_payoff", label: "Punição por criatura entrar", icon: "💥",
    test: c => /whenever (a|another) [^.]{0,40}(creature|token)[^.]{0,30}enters/.test(c.text)
            && /(damage|loses? [0-9x]+ life|gain [0-9x]+ life|draw)/.test(c.text) },
  { id: "treasure", label: "Tesouros", icon: "💰",
    test: c => /treasure/.test(c.text) },
  { id: "sac_outlet", label: "Sacrifício (custo livre)", icon: "🗡️",
    test: c => /sacrifice (a|another) (creature|artifact|permanent)[,:]|sacrifice a creature:/.test(c.text) },
  { id: "dies_trigger", label: "Gatilhos de morte", icon: "💀",
    test: c => /whenever [^.]{0,60}dies/.test(c.text) },
  { id: "drain", label: "Dreno de vida", icon: "🩸",
    test: c => /each opponent loses [0-9x]+ life|opponents? lose[s]? [0-9x]+ life/.test(c.text) },
  { id: "lifegain", label: "Ganho de vida", icon: "❤️",
    test: c => /you gain [0-9x]+ life|whenever you gain life/.test(c.text) },
  { id: "draw", label: "Compra de cartas", icon: "🃏",
    test: c => /draws? (a card|two cards|three cards|x cards|that many cards|cards equal)/.test(c.text) },
  { id: "haste_grant", label: "Concede ímpeto", icon: "💨",
    test: c => /(creatures? you control )?(have|gains?|gain) haste/.test(c.text) && !/^haste$/.test(c.text.trim()) },
  { id: "equipment", label: "Equipamentos", icon: "🛡️",
    test: c => /equipment/.test(c.type) },
  { id: "counters_p1", label: "Marcadores +1/+1", icon: "➕",
    test: c => /\+1\/\+1 counter/.test(c.text) },
  { id: "taxes", label: "Impostos aos oponentes", icon: "🏛️",
    test: c => /whenever an opponent (casts|draws|searches|attacks)/.test(c.text) },
  { id: "ramp", label: "Ramp / aceleração", icon: "⛰️",
    test: c => (/add \{|add one mana|add two mana|add three mana/.test(c.text) && !/land/.test(c.type))
            || /search your library for a( basic)? land/.test(c.text) },
  { id: "removal", label: "Remoção", icon: "🎯",
    test: c => /(destroy|exile) target (creature|artifact|enchantment|permanent|planeswalker|nonland)/.test(c.text) },
  { id: "protection", label: "Proteção de massa", icon: "🛡️✨",
    test: c => /(creatures|permanents) you control (gain|are|have) (hexproof|indestructible)|phases? out/.test(c.text) },
  { id: "human_typal", label: "Tribal Humano", icon: "🧑‍🤝‍🧑",
    test: c => /human/.test(c.text) && /(human creature|humans? you control|human you control|nontoken human)/.test(c.text) },
  { id: "reanimate", label: "Reanimação", icon: "⚰️",
    test: c => /return [^.]{0,60}from (your|a) graveyard to the battlefield/.test(c.text) },
  { id: "burn", label: "Dano direto", icon: "🔥",
    test: c => /deals? [0-9x]+ damage to (any target|each opponent|each player)/.test(c.text) },
];

// Afinidades entre temas. Quando a carta A tem a tag `a` e a carta B tem a
// tag `b`, o par ganha `w` pontos e a explicação `why`.
const AFFINITY = [
  { a: "attack_trigger", b: "trigger_doubler", w: 3, why: "os gatilhos de ataque disparam duas vezes" },
  { a: "attack_trigger", b: "extra_combat",   w: 3, why: "cada combate extra repete os gatilhos de ataque" },
  { a: "attack_trigger", b: "haste_grant",    w: 2, why: "ímpeto deixa atacar (e disparar o gatilho) no mesmo turno" },
  { a: "attack_trigger", b: "go_wide_payoff", w: 2, why: "atacar com várias criaturas maximiza as duas cartas" },
  { a: "token",          b: "token_doubler",  w: 3, why: "os tokens gerados são dobrados" },
  { a: "token",          b: "anthem",         w: 2, why: "os tokens pequenos ficam grandes com o anthem" },
  { a: "token",          b: "etb_payoff",     w: 3, why: "cada token que entra dispara o dano/dreno" },
  { a: "token",          b: "go_wide_payoff", w: 3, why: "muitos tokens = recompensa máxima por criatura" },
  { a: "token",          b: "sac_outlet",     w: 2, why: "os tokens viram combustível de sacrifício" },
  { a: "token",          b: "dies_trigger",   w: 2, why: "tokens morrendo disparam os gatilhos de morte" },
  { a: "token",          b: "trigger_doubler",w: 2, why: "gatilhos que criam tokens disparam duas vezes" },
  { a: "token",          b: "draw",           w: 1, why: "criaturas descartáveis alimentam o motor de compra" },
  { a: "treasure",       b: "sac_outlet",     w: 1, why: "tesouros são permanentes sacrificáveis" },
  { a: "treasure",       b: "ramp",           w: 1, why: "aceleração de mana em camadas" },
  { a: "treasure",       b: "trigger_doubler",w: 2, why: "gatilhos que criam tesouros disparam duas vezes" },
  { a: "dies_trigger",   b: "sac_outlet",     w: 3, why: "sacrificar no momento certo dispara os gatilhos de morte" },
  { a: "drain",          b: "token",          w: 2, why: "cada corpo que entra/morre vira dreno de vida na mesa toda" },
  { a: "drain",          b: "trigger_doubler",w: 2, why: "o dreno dispara em dobro" },
  { a: "etb_payoff",     b: "trigger_doubler",w: 2, why: "a punição por entrada dispara em dobro" },
  { a: "go_wide_payoff", b: "anthem",         w: 1, why: "o time inteiro cresce e converte em vantagem" },
  { a: "equipment",      b: "token",          w: 1, why: "sempre há um corpo para equipar" },
  { a: "counters_p1",    b: "token",          w: 2, why: "os marcadores transformam tokens em ameaças reais" },
  { a: "human_typal",    b: "token",          w: 1, why: "tokens de Humano ativam o tribal" },
  { a: "taxes",          b: "treasure",       w: 1, why: "os impostos geram recursos enquanto você ataca" },
  { a: "reanimate",      b: "dies_trigger",   w: 1, why: "criaturas voltando do cemitério reutilizam gatilhos" },
  { a: "burn",           b: "attack_trigger", w: 1, why: "pressão dupla: dano de combate + dano direto" },
  { a: "lifegain",       b: "drain",          w: 1, why: "o dreno alimenta os gatilhos de ganho de vida" },
];

// Sugestões curadas: só aparecem se a identidade de cor couber no deck e o
// tema correspondente tiver presença real na lista.
const STAPLES = [
  { name: "Aurelia, the Warleader",      id: ["R","W"], tags: ["extra_combat","attack_trigger","haste_grant"], why: "Combate extra todo turno — dobra todos os seus gatilhos de ataque." },
  { name: "Karlach, Fury of Avernus",    id: ["R"],     tags: ["extra_combat","attack_trigger","haste_grant"], why: "Primeiro ataque de cada turno gera combate extra e dá ímpeto." },
  { name: "Combat Celebrant",            id: ["R"],     tags: ["extra_combat"], why: "Combate extra barato e recorrente ao exaltar." },
  { name: "Port Razer",                  id: ["R"],     tags: ["extra_combat","attack_trigger"], why: "Ao causar dano de combate, destapa o time e dá outro combate." },
  { name: "Scourge of the Throne",       id: ["R"],     tags: ["extra_combat","attack_trigger"], why: "Dethrone + combate extra atacando o oponente com mais vidas." },
  { name: "Seize the Day",               id: ["R"],     tags: ["extra_combat"], why: "Feitiço de combate extra com flashback — dois usos." },
  { name: "Anointed Procession",         id: ["W"],     tags: ["token_doubler","token"], why: "Dobra todos os tokens que você criar." },
  { name: "Mondrak, Glory Dominus",      id: ["W"],     tags: ["token_doubler","token"], why: "Dobra tokens em um corpo que se protege sozinho." },
  { name: "Cathars' Crusade",            id: ["W"],     tags: ["counters_p1","token"], why: "Cada criatura entrando cresce o exército inteiro." },
  { name: "Assemble the Legion",         id: ["R","W"], tags: ["token"], why: "Gera um exército crescente todo turno, sem custo adicional." },
  { name: "Krenko, Tin Street Kingpin",  id: ["R"],     tags: ["token","attack_trigger"], why: "Ataca e gera uma pilha de goblins que cresce a cada turno." },
  { name: "Hanweir Garrison",            id: ["R"],     tags: ["token","attack_trigger","human_typal"], why: "Tokens de Humano em todo ataque — ótimo com duplicadores." },
  { name: "Purphoros, God of the Forge", id: ["R"],     tags: ["etb_payoff","burn"], why: "Cada criatura/token entrando causa 2 de dano a cada oponente." },
  { name: "Corpse Knight",               id: ["W","B"], tags: ["etb_payoff","drain"], why: "Versão em criatura do Impact Tremors, drenando vida." },
  { name: "Witty Roastmaster",           id: ["R"],     tags: ["etb_payoff","burn"], why: "Impact Tremors com corpo — redundância barata." },
  { name: "Blood Artist",                id: ["B"],     tags: ["dies_trigger","drain"], why: "Cada criatura morrendo (sua ou não) vira dreno de vida." },
  { name: "Zulaport Cutthroat",          id: ["B"],     tags: ["dies_trigger","drain"], why: "Dreno em massa quando seus tokens morrem." },
  { name: "Mirkwood Bats",               id: ["B"],     tags: ["dies_trigger","etb_payoff","drain"], why: "Dreno na entrada E na saída de cada token." },
  { name: "Viscera Seer",                id: ["B"],     tags: ["sac_outlet"], why: "Sacrifício grátis a qualquer momento + filtragem de topo." },
  { name: "Goblin Bombardment",          id: ["R"],     tags: ["sac_outlet","burn"], why: "Transforma cada token em 1 de dano direcionável." },
  { name: "Judith, the Scourge Diva",    id: ["B","R"], tags: ["anthem","dies_trigger","burn"], why: "Anthem + transforma mortes de criaturas em remoção." },
  { name: "Pitiless Plunderer",          id: ["B"],     tags: ["treasure","dies_trigger"], why: "Cada criatura morrendo vira um tesouro — motor de mana." },
  { name: "Mahadi, Emporium Master",     id: ["B","R"], tags: ["treasure","dies_trigger"], why: "Tesouros no fim do turno por cada criatura que morreu." },
  { name: "Xorn",                        id: ["R"],     tags: ["treasure","token_doubler"], why: "Um tesouro extra sempre que você criar tesouros." },
  { name: "Revel in Riches",             id: ["B"],     tags: ["treasure"], why: "Condição de vitória alternativa com 10 tesouros." },
  { name: "Goldspan Dragon",             id: ["R"],     tags: ["treasure","attack_trigger"], why: "Tesouros valendo 2 de mana + gera tesouro ao atacar." },
  { name: "Bennie Bracks, Zoologist",    id: ["W"],     tags: ["draw","token"], why: "Compra uma carta por turno só por criar tokens." },
  { name: "Welcoming Vampire",           id: ["W"],     tags: ["draw","token"], why: "Compra ao entrar criatura pequena — combina com tokens." },
  { name: "Tocasia's Welcome",           id: ["W"],     tags: ["draw","token"], why: "Motor de compra para decks de curva baixa." },
  { name: "Phyrexian Arena",             id: ["B"],     tags: ["draw"], why: "Vantagem de carta constante por um custo pequeno de vida." },
  { name: "Breena, the Demagogue",       id: ["W","B"], tags: ["draw","counters_p1","attack_trigger"], why: "Compra cartas quando alguém ataca e cresce seu time." },
  { name: "Teferi's Protection",         id: ["W"],     tags: ["protection"], why: "A melhor proteção de massa do formato." },
  { name: "Akroma's Will",               id: ["W"],     tags: ["protection","anthem"], why: "Protege o time OU vira o jogo com evasão + lifelink." },
  { name: "Deadly Rollick",              id: ["B"],     tags: ["removal"], why: "Remoção grátis com comandante em jogo." },
  { name: "Deflecting Swat",             id: ["R"],     tags: ["protection"], why: "Redireciona remoção/counter de graça com comandante em jogo." },
  { name: "Jeska's Will",                id: ["R"],     tags: ["ramp"], why: "Explosão de mana + cartas — um dos melhores rituais do formato." },
  { name: "Rising of the Day",           id: ["R"],     tags: ["haste_grant","anthem"], why: "Ímpeto para o time todo — ataca no turno em que baixa." },
  { name: "Coppercoat Vanguard",         id: ["W"],     tags: ["human_typal","anthem"], why: "Anthem + proteção para decks de Humanos." },
  { name: "Thalia's Lieutenant",         id: ["W"],     tags: ["human_typal","counters_p1"], why: "Cresce com cada Humano que entra no campo." },
  { name: "Skullclamp",                  id: [],        tags: ["draw","equipment"], why: "Transforma cada token em duas cartas — motor absurdo." },
  { name: "Sword of the Animist",        id: [],        tags: ["equipment","ramp","attack_trigger"], why: "Ramp de terrenos em todo ataque." },
  { name: "Impact Tremors",              id: ["R"],     tags: ["etb_payoff","burn"], why: "Dano em cada oponente por criatura entrando — motor de tokens." },
];

// Rótulos das seções do grid do deck, na ordem de exibição.
const TYPE_ORDER = [
  ["commander",    "Comandante"],
  ["creature",     "Criaturas"],
  ["instant",      "Instantâneos"],
  ["sorcery",      "Feitiços"],
  ["artifact",     "Artefatos"],
  ["enchantment",  "Encantamentos"],
  ["planeswalker", "Planeswalkers"],
  ["battle",       "Batalhas"],
  ["land",         "Terrenos"],
  ["other",        "Outros"],
];

const EXAMPLE_DECK = `COMMANDER:
1 Isshin, Two Heavens as One

1 Adeline, Resplendent Cathar
1 Ainok Strike Leader
1 Ancient Tomb
1 Anguished Unmaking
1 Anim Pakal, Thousandth Moon
1 Arabella, Abandoned Doll
1 Arcane Signet
1 Arid Mesa
1 Badlands
1 Battlefield Forge
1 Black Market Connections
1 Blightstep Pathway
1 Blood Crypt
1 Bloodstained Mire
1 Boros Charm
1 Brightclimb Pathway
1 Caesar, Legion's Emperor
1 Caves of Koilos
1 Charismatic Conqueror
1 Chivalric Alliance
1 Chrome Mox
1 City of Brass
1 Clever Concealment
1 Command Tower
1 Commissar Severina Raine
1 Concealed Courtyard
1 Dark Ritual
1 Den of the Bugbear
1 Dolmen Gate
1 Eiganjo, Seat of the Empire
1 Elturel Survivors
1 Esper Sentinel
1 Fellwar Stone
1 Flawless Maneuver
1 General Kreat, the Boltbringer
1 Generous Plunderer
1 Godless Shrine
1 Grand Crescendo
1 Graven Cairns
1 Grim Monolith
1 Hammers of Moradin
1 Hero of Bladehold
1 Impact Tremors
1 Kambal, Profiteering Mayor
1 Kellogg, Dangerous Mind
1 Launch the Fleet
1 Lightning Greaves
1 Lotus Petal
1 Luxury Suite
1 Mana Confluence
1 Mana Vault
1 Mardu Ascendancy
1 Marsh Flats
1 Minas Tirith
1 Mondrak, Glory Dominus
2 Mountain
1 Mox Diamond
1 Myrel, Shield of Argive
1 Path to Exile
2 Plains
1 Plateau
1 Plumb the Forbidden
1 Prismatic Vista
1 Professional Face-Breaker
1 Raid Bombardment
1 Reconnaissance
1 Redoubled Stormsinger
1 Reflecting Pool
1 Rugged Prairie
1 Sacred Foundry
1 Savai Triome
1 Scrubland
1 Silent Clearing
1 Skullclamp
1 Skyknight Vanguard
1 Smothering Tithe
1 Sokenzan, Crucible of Defiance
1 Sol Ring
1 Spectator Seating
1 Starting Town
1 Sulfurous Springs
1 Sunbaked Canyon
1 Swamp
1 Swords to Plowshares
1 Talisman of Conviction
1 Talisman of Hierarchy
1 Talisman of Indulgence
1 Urborg, Tomb of Yawgmoth
1 Urza's Saga
1 Vault of Champions
1 Venerated Stormsinger
1 Voice of Victory
1 Will of the Mardu
1 Windcrag Siege
1 Winota, Joiner of Forces
1 Within Range
1 Zhentarim Bandit
1 Zurgo Stormrender`;
