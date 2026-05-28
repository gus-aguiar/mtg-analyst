"""Hand-built card database for the Mardu Isshin goldfish deck.

Fields used by the simulator (omit when 0/False/None):
  type           : "land" | "creature" | "artifact" | "artifact_creature" |
                   "enchantment" | "instant" | "sorcery"
  cmc, cost      : converted mana cost (int) and a simple cost string ("1WW",
                   "{X}{B}", "0"). Cost string is informational; the simulator
                   pays by consuming colored requirements parsed from `cost`.
  colors         : list of W/U/B/R/G (card colors, used for Mox Diamond etc.)

  -- Lands --
  produces            : list of colors a tap can produce, e.g. ["W","R"] or
                        ["W","U","B","R","G"] for any-color lands.
  enters_tapped       : bool (default False)
  fetch_targets       : list of color combos this fetchland can fetch
                        (each entry is a list of colors). Non-empty => fetch.
  burst_colorless     : int extra colorless on tap (Ancient Tomb = 2).

  -- Ramp / mana artifacts --
  ramp_amount         : int, mana produced on tap
  ramp_colors         : list of color options (["any"] = any color)
  ramp_oneshot        : bool, e.g. Lotus Petal / Dark Ritual
  no_untap            : bool, Mana Vault / Grim Monolith
  discard_land_etb    : bool, Mox Diamond

  -- Creature --
  power, toughness    : ints
  haste, evasion      : bool / str
  human               : bool, for Winota
  tokens_on_attack    : int, attacking tokens created each combat
  tokens_etb          : int, tokens on ETB
  treasure_on_attack  : int
  dmg_on_attack       : int (direct damage to opponent)
  battle_cry          : int (+X power to OTHER attackers)
  haste_grant         : bool, gives all your creatures haste while in play
  isshin, mondrak, winota : bool flags

  -- Static / triggered permanents --
  dmg_per_etb               : int (Impact Tremors, Arabella ~ approx 1)
  dmg_per_small_attacker    : int (Raid Bombardment)
  dmg_per_attacker          : int (Hellrider)
  tokens_per_attack_event   : int (Mardu Ascendancy / Chivalric Alliance / Launch the Fleet etc.)
  anthem_p                  : int, flat +X power to your attackers

  -- Spells --
  burn_damage         : int (Boros Charm 4-to-the-face mode)
"""

CARDS = {
    # ===== Commander =====
    "Isshin, Two Heavens as One": {
        "type": "creature", "cmc": 3, "cost": "RWB", "colors": ["R", "W", "B"],
        "power": 3, "toughness": 3, "human": True, "isshin": True,
    },

    # ===== Creatures =====
    "Adeline, Resplendent Cathar": {
        "type": "creature", "cmc": 3, "cost": "1WW", "colors": ["W"],
        "power": 3, "toughness": 3, "human": True, "tokens_on_attack": 1,
    },
    "Ainok Strike Leader": {
        "type": "creature", "cmc": 3, "cost": "1BR", "colors": ["B", "R"],
        "power": 2, "toughness": 2,
    },
    "Anim Pakal, Thousandth Moon": {
        "type": "creature", "cmc": 2, "cost": "1W", "colors": ["W"],
        "power": 1, "toughness": 1, "human": True, "tokens_on_attack": 1,
    },
    "Arabella, Abandoned Doll": {
        "type": "creature", "cmc": 2, "cost": "RW", "colors": ["R", "W"],
        "power": 2, "toughness": 2, "human": True, "dmg_per_etb": 1,
    },
    "Caesar, Legion's Emperor": {
        "type": "creature", "cmc": 4, "cost": "2WB", "colors": ["W", "B"],
        "power": 3, "toughness": 4, "human": True,
    },
    "Charismatic Conqueror": {
        "type": "creature", "cmc": 2, "cost": "1W", "colors": ["W"],
        "power": 2, "toughness": 2, "human": True,
    },
    "Commissar Severina Raine": {
        "type": "creature", "cmc": 3, "cost": "1WB", "colors": ["W", "B"],
        "power": 2, "toughness": 2, "human": True,
    },
    "Elturel Survivors": {
        "type": "creature", "cmc": 3, "cost": "2W", "colors": ["W"],
        "power": 2, "toughness": 3, "human": True,
    },
    "Esper Sentinel": {
        "type": "creature", "cmc": 1, "cost": "W", "colors": ["W"],
        "power": 1, "toughness": 1, "human": True,
    },
    "General Kreat, the Boltbringer": {
        "type": "creature", "cmc": 4, "cost": "2RW", "colors": ["R", "W"],
        "power": 3, "toughness": 3, "human": True, "battle_cry": 1,
    },
    "Generous Plunderer": {
        "type": "creature", "cmc": 3, "cost": "1BR", "colors": ["B", "R"],
        "power": 2, "toughness": 2, "human": True, "treasure_on_attack": 1,
    },
    "Hammers of Moradin": {
        "type": "creature", "cmc": 3, "cost": "1RW", "colors": ["R", "W"],
        "power": 3, "toughness": 2, "human": True,
    },
    "Hero of Bladehold": {
        "type": "creature", "cmc": 4, "cost": "2WW", "colors": ["W"],
        "power": 3, "toughness": 4, "human": True,
        "tokens_on_attack": 2, "battle_cry": 1,
    },
    "Kambal, Profiteering Mayor": {
        "type": "creature", "cmc": 3, "cost": "1WB", "colors": ["W", "B"],
        "power": 3, "toughness": 2, "human": True, "treasure_on_attack": 1,
    },
    "Kellogg, Dangerous Mind": {
        "type": "creature", "cmc": 3, "cost": "1WB", "colors": ["W", "B"],
        "power": 2, "toughness": 3, "human": True,
    },
    "Mondrak, Glory Dominus": {
        "type": "creature", "cmc": 4, "cost": "3W", "colors": ["W"],
        "power": 4, "toughness": 4, "mondrak": True,
    },
    "Myrel, Shield of Argive": {
        "type": "creature", "cmc": 5, "cost": "3WW", "colors": ["W"],
        "power": 4, "toughness": 4, "human": True, "tokens_on_attack": 2,
    },
    "Professional Face-Breaker": {
        "type": "creature", "cmc": 3, "cost": "2R", "colors": ["R"],
        "power": 3, "toughness": 3, "human": True, "evasion": "menace",
        "treasure_on_attack": 1,
    },
    "Redoubled Stormsinger": {
        "type": "creature", "cmc": 2, "cost": "1W", "colors": ["W"],
        "power": 2, "toughness": 1, "evasion": "flying", "human": True,
    },
    "Skyknight Vanguard": {
        "type": "creature", "cmc": 3, "cost": "1RW", "colors": ["R", "W"],
        "power": 3, "toughness": 2, "evasion": "flying", "human": True,
        "tokens_on_attack": 1,
    },
    "Venerated Stormsinger": {
        "type": "creature", "cmc": 2, "cost": "1W", "colors": ["W"],
        "power": 2, "toughness": 1, "evasion": "flying", "human": True,
    },
    "Voice of Victory": {
        "type": "creature", "cmc": 3, "cost": "1RW", "colors": ["R", "W"],
        "power": 3, "toughness": 3, "human": True,
    },
    "Winota, Joiner of Forces": {
        "type": "creature", "cmc": 4, "cost": "2RW", "colors": ["R", "W"],
        "power": 4, "toughness": 4, "human": True, "winota": True,
    },
    "Zhentarim Bandit": {
        "type": "creature", "cmc": 2, "cost": "1B", "colors": ["B"],
        "power": 2, "toughness": 2, "human": True,
    },
    "Zurgo Stormrender": {
        "type": "creature", "cmc": 2, "cost": "RW", "colors": ["R", "W"],
        "power": 2, "toughness": 2, "evasion": "flying",
    },

    # ===== Sideboard creatures =====
    "Brutal Hordechief": {
        "type": "creature", "cmc": 4, "cost": "2BR", "colors": ["B", "R"],
        "power": 3, "toughness": 3, "human": True, "dmg_per_attacker": 1,
    },
    "Caustic Bronco": {
        "type": "creature", "cmc": 2, "cost": "1B", "colors": ["B"],
        "power": 2, "toughness": 2,
    },
    "Delina, Wild Mage": {
        "type": "creature", "cmc": 3, "cost": "2R", "colors": ["R"],
        "power": 2, "toughness": 3, "human": True,
    },
    "Hanweir Garrison": {
        "type": "creature", "cmc": 3, "cost": "1RW", "colors": ["R", "W"],
        "power": 2, "toughness": 3, "human": True, "tokens_on_attack": 2,
    },
    "Hellrider": {
        "type": "creature", "cmc": 4, "cost": "2RR", "colors": ["R"],
        "power": 3, "toughness": 3, "haste": True, "dmg_per_attacker": 1,
    },
    "Mishra, Claimed by Gix": {
        "type": "creature", "cmc": 3, "cost": "1BR", "colors": ["B", "R"],
        "power": 4, "toughness": 4, "human": True,
    },

    # ===== Spells / non-permanents =====
    "Anguished Unmaking": {
        "type": "instant", "cmc": 3, "cost": "1WB", "colors": ["W", "B"],
    },
    "Boros Charm": {
        "type": "instant", "cmc": 2, "cost": "RW", "colors": ["R", "W"],
        "burn_damage": 4,
    },
    "Clever Concealment": {
        "type": "instant", "cmc": 4, "cost": "3W", "colors": ["W"],
    },
    "Dark Ritual": {
        "type": "instant", "cmc": 1, "cost": "B", "colors": ["B"],
        "ramp_oneshot": True, "ramp_amount": 3, "ramp_colors": ["B"],
    },
    "Flawless Maneuver": {
        "type": "instant", "cmc": 3, "cost": "2W", "colors": ["W"],
    },
    "Grand Crescendo": {
        "type": "instant", "cmc": 2, "cost": "1W", "colors": ["W"],
        "tokens_etb": 2,
    },
    "Launch the Fleet": {
        "type": "instant", "cmc": 1, "cost": "W", "colors": ["W"],
        "tokens_per_attack_event": 1,
    },
    "Path to Exile": {
        "type": "instant", "cmc": 1, "cost": "W", "colors": ["W"],
    },
    "Plumb the Forbidden": {
        "type": "instant", "cmc": 1, "cost": "B", "colors": ["B"],
    },
    "Swords to Plowshares": {
        "type": "instant", "cmc": 1, "cost": "W", "colors": ["W"],
    },
    "Will of the Mardu": {
        "type": "sorcery", "cmc": 4, "cost": "1WBR", "colors": ["W", "B", "R"],
    },
    "Within Range": {
        "type": "sorcery", "cmc": 2, "cost": "1W", "colors": ["W"],
    },

    # ===== Enchantments =====
    "Black Market Connections": {
        "type": "enchantment", "cmc": 4, "cost": "1BBB", "colors": ["B"],
    },
    "Chivalric Alliance": {
        "type": "enchantment", "cmc": 4, "cost": "2WW", "colors": ["W"],
        "tokens_per_attack_event": 1,
    },
    "Impact Tremors": {
        "type": "enchantment", "cmc": 2, "cost": "1R", "colors": ["R"],
        "dmg_per_etb": 1,
    },
    "Mardu Ascendancy": {
        "type": "enchantment", "cmc": 3, "cost": "RWB", "colors": ["R", "W", "B"],
        "tokens_per_attack_event": 1,
    },
    "Raid Bombardment": {
        "type": "enchantment", "cmc": 2, "cost": "1R", "colors": ["R"],
        "dmg_per_small_attacker": 1,
    },
    "Reconnaissance": {
        "type": "enchantment", "cmc": 1, "cost": "W", "colors": ["W"],
    },
    "Smothering Tithe": {
        "type": "enchantment", "cmc": 4, "cost": "3W", "colors": ["W"],
    },
    "Windcrag Siege": {
        "type": "enchantment", "cmc": 4, "cost": "1WBR", "colors": ["W", "B", "R"],
    },

    # ===== Mana artifacts / mana sources =====
    "Arcane Signet": {
        "type": "artifact", "cmc": 2, "cost": "2", "colors": [],
        "ramp_amount": 1, "ramp_colors": ["W", "B", "R"],
    },
    "Chrome Mox": {
        "type": "artifact", "cmc": 0, "cost": "0", "colors": [],
        "ramp_amount": 1, "ramp_colors": ["W", "B", "R"],
    },
    "Fellwar Stone": {
        "type": "artifact", "cmc": 2, "cost": "2", "colors": [],
        "ramp_amount": 1, "ramp_colors": ["W", "B", "R"],
    },
    "Grim Monolith": {
        "type": "artifact", "cmc": 2, "cost": "2", "colors": [],
        "ramp_amount": 3, "ramp_colors": ["C"], "no_untap": True,
    },
    "Lotus Petal": {
        "type": "artifact", "cmc": 0, "cost": "0", "colors": [],
        "ramp_oneshot": True, "ramp_amount": 1, "ramp_colors": ["any"],
    },
    "Mana Vault": {
        "type": "artifact", "cmc": 1, "cost": "1", "colors": [],
        "ramp_amount": 3, "ramp_colors": ["C"], "no_untap": True,
    },
    "Mox Diamond": {
        "type": "artifact", "cmc": 0, "cost": "0", "colors": [],
        "ramp_amount": 1, "ramp_colors": ["any"], "discard_land_etb": True,
    },
    "Sol Ring": {
        "type": "artifact", "cmc": 1, "cost": "1", "colors": [],
        "ramp_amount": 2, "ramp_colors": ["C"],
    },
    "Talisman of Conviction": {
        "type": "artifact", "cmc": 2, "cost": "2", "colors": [],
        "ramp_amount": 1, "ramp_colors": ["R", "W"],
    },
    "Talisman of Hierarchy": {
        "type": "artifact", "cmc": 2, "cost": "2", "colors": [],
        "ramp_amount": 1, "ramp_colors": ["W", "B"],
    },
    "Talisman of Indulgence": {
        "type": "artifact", "cmc": 2, "cost": "2", "colors": [],
        "ramp_amount": 1, "ramp_colors": ["B", "R"],
    },

    # ===== Other artifacts =====
    "Dolmen Gate": {
        "type": "artifact", "cmc": 3, "cost": "3", "colors": [],
    },
    "Lightning Greaves": {
        "type": "artifact", "cmc": 2, "cost": "2", "colors": [],
        "haste_grant": True,
    },
    "Skullclamp": {
        "type": "artifact", "cmc": 1, "cost": "1", "colors": [],
    },

    # ===== Lands =====
    "Ancient Tomb":            {"type": "land", "cmc": 0, "produces": ["C"], "burst_colorless": 1},
    "Arid Mesa":               {"type": "land", "cmc": 0, "produces": [],
                                "fetch_targets": [["R", "W"]]},
    "Badlands":                {"type": "land", "cmc": 0, "produces": ["B", "R"]},
    "Battlefield Forge":       {"type": "land", "cmc": 0, "produces": ["W", "R", "C"]},
    "Blightstep Pathway":      {"type": "land", "cmc": 0, "produces": ["B", "R"]},
    "Blood Crypt":             {"type": "land", "cmc": 0, "produces": ["B", "R"]},
    "Bloodstained Mire":       {"type": "land", "cmc": 0, "produces": [],
                                "fetch_targets": [["B", "R"]]},
    "Brightclimb Pathway":     {"type": "land", "cmc": 0, "produces": ["W", "B"]},
    "Caves of Koilos":         {"type": "land", "cmc": 0, "produces": ["W", "B", "C"]},
    "City of Brass":           {"type": "land", "cmc": 0, "produces": ["W", "U", "B", "R", "G"]},
    "Command Tower":           {"type": "land", "cmc": 0, "produces": ["W", "B", "R"]},
    "Concealed Courtyard":     {"type": "land", "cmc": 0, "produces": ["W", "B"]},
    "Den of the Bugbear":      {"type": "land", "cmc": 0, "produces": ["R"]},
    "Eiganjo, Seat of the Empire": {"type": "land", "cmc": 0, "produces": ["W"]},
    "Godless Shrine":          {"type": "land", "cmc": 0, "produces": ["W", "B"]},
    "Graven Cairns":           {"type": "land", "cmc": 0, "produces": ["B", "R", "C"]},
    "Luxury Suite":            {"type": "land", "cmc": 0, "produces": ["B", "R"]},
    "Mana Confluence":         {"type": "land", "cmc": 0, "produces": ["W", "U", "B", "R", "G"]},
    "Marsh Flats":             {"type": "land", "cmc": 0, "produces": [],
                                "fetch_targets": [["W", "B"]]},
    "Minas Tirith":            {"type": "land", "cmc": 0, "produces": ["W"]},
    "Mountain":                {"type": "land", "cmc": 0, "produces": ["R"]},
    "Plains":                  {"type": "land", "cmc": 0, "produces": ["W"]},
    "Plateau":                 {"type": "land", "cmc": 0, "produces": ["R", "W"]},
    "Prismatic Vista":         {"type": "land", "cmc": 0, "produces": [],
                                "fetch_targets": [["W", "B", "R"]]},
    "Reflecting Pool":         {"type": "land", "cmc": 0, "produces": ["W", "B", "R"]},
    "Rugged Prairie":          {"type": "land", "cmc": 0, "produces": ["R", "W"]},
    "Sacred Foundry":          {"type": "land", "cmc": 0, "produces": ["R", "W"]},
    "Savai Triome":            {"type": "land", "cmc": 0, "produces": ["W", "B", "R"],
                                "enters_tapped": True},
    "Scrubland":               {"type": "land", "cmc": 0, "produces": ["W", "B"]},
    "Silent Clearing":         {"type": "land", "cmc": 0, "produces": ["W", "B"]},
    "Sokenzan, Crucible of Defiance": {"type": "land", "cmc": 0, "produces": ["R"]},
    "Spectator Seating":       {"type": "land", "cmc": 0, "produces": ["R", "W"]},
    "Starting Town":           {"type": "land", "cmc": 0, "produces": ["W", "B", "R"]},
    "Sulfurous Springs":       {"type": "land", "cmc": 0, "produces": ["B", "R", "C"]},
    "Sunbaked Canyon":         {"type": "land", "cmc": 0, "produces": ["R", "W"]},
    "Swamp":                   {"type": "land", "cmc": 0, "produces": ["B"]},
    "Urborg, Tomb of Yawgmoth":{"type": "land", "cmc": 0, "produces": ["B"]},
    "Urza's Saga":             {"type": "land", "cmc": 0, "produces": ["C"]},
    "Vault of Champions":      {"type": "land", "cmc": 0, "produces": ["W", "B"],
                                "enters_tapped": True},
}


def get(name):
    """Lookup with friendly error."""
    if name not in CARDS:
        raise KeyError(f"Card not in DB: {name!r}")
    return CARDS[name]
