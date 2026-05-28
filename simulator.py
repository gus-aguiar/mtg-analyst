"""Goldfish simulator + analysis for an Isshin Mardu deck.

Heuristic combat engine: plays 10 turns per game, draws one card per turn (no
draw on turn 1, "on the play"), plays one land per turn (color-aware), casts
spells/creatures by priority, then attacks. Damage = combat power + token /
trigger bonuses, with Isshin doubling on-attack triggers and Mondrak doubling
tokens. The numbers are approximate by design.

Run: `python simulator.py --sims 5000 --turns 10 --life 40 --out out`
"""

from __future__ import annotations

import argparse
import random
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

from cards_db import CARDS

_TOKEN_NAME = "__Token_1_1__"
_TOKEN_DATA = {"type": "creature", "cmc": 0, "cost": "0", "colors": [],
               "power": 1, "toughness": 1, "human": True}


def card_data(name: str) -> dict:
    """Look up card data, returning token stats for spawned tokens."""
    if name == _TOKEN_NAME:
        return _TOKEN_DATA
    return CARDS[name]


# ---------- Deck parsing ----------

def parse_decklist(path: str) -> tuple[list[str], list[str], list[str]]:
    section = "main"
    main, commander, side = [], [], []
    bucket = {"main": main, "commander": commander, "side": side}
    for raw in Path(path).read_text().splitlines():
        line = raw.strip()
        if not line:
            continue
        up = line.upper()
        if up.startswith("SIDEBOARD"):
            section = "side"; continue
        if up.startswith("COMMANDER"):
            section = "commander"; continue
        m = re.match(r"^(\d+)\s+(.+)$", line)
        if not m:
            continue
        n, name = int(m.group(1)), m.group(2).strip()
        bucket[section].extend([name] * n)
    return main, commander, side


def parse_cost(cost: str) -> tuple[int, list[str]]:
    """Return (generic_amount, list_of_colored_symbols). X treated as 0."""
    if cost in (None, "", "0"):
        return 0, []
    s = cost.replace("{", "").replace("}", "")
    generic = 0
    colored: list[str] = []
    num = ""
    for ch in s:
        if ch.isdigit():
            num += ch
            continue
        if num:
            generic += int(num); num = ""
        u = ch.upper()
        if u in "WUBRGC":
            colored.append(u)
        # X is ignored (paid as 0)
    if num:
        generic += int(num)
    return generic, colored


# ---------- Mana sources ----------

@dataclass
class ManaSource:
    colors: list[str]   # one tap = one mana of any of these (or "any")
    burst: int = 0       # extra colorless tacked on for free
    label: str = ""


def is_any_source(s: ManaSource) -> bool:
    return "any" in s.colors


def source_can_make(s: ManaSource, color: str) -> bool:
    if is_any_source(s):
        return True
    if color in s.colors:
        return True
    return False


def pay_cost(sources: list[ManaSource], generic: int, colored: list[str]) -> list[int] | None:
    """Greedy mana assignment. Returns indices of consumed sources or None."""
    used = [False] * len(sources)
    burst = 0
    # Cover restrictive colored requirements first: rare colors first, paid by
    # the least-flexible producing source.
    order = sorted(range(len(colored)),
                   key=lambda i: -sum(not source_can_make(s, colored[i]) for s in sources))
    for idx in order:
        need = colored[idx]
        best = -1
        best_flex = 999
        for j, s in enumerate(sources):
            if used[j]:
                continue
            if not source_can_make(s, need):
                continue
            flex = 99 if is_any_source(s) else len(s.colors)
            if flex < best_flex:
                best = j; best_flex = flex
        if best < 0:
            return None
        used[best] = True
        burst += sources[best].burst
    paid = burst
    remaining = [j for j, u in enumerate(used) if not u]
    while paid < generic and remaining:
        j = remaining.pop()
        used[j] = True
        paid += 1 + sources[j].burst
    if paid < generic:
        return None
    return [j for j, u in enumerate(used) if u]


# ---------- Game state ----------

@dataclass
class Perm:
    name: str
    turn_entered: int
    tapped: bool = False
    used: bool = False  # for no_untap rocks once they've been tapped
    summoning_sick: bool = True


@dataclass
class Game:
    library: list[str]
    hand: list[str]
    battlefield: list[Perm] = field(default_factory=list)
    graveyard: list[str] = field(default_factory=list)
    command_zone: list[str] = field(default_factory=list)
    turn: int = 0
    treasures: int = 0
    damage_per_turn: list[int] = field(default_factory=list)
    cumulative_damage: int = 0
    win_turn: int | None = None
    opening_hand: list[str] = field(default_factory=list)
    cast_log: list[tuple[int, str]] = field(default_factory=list)
    mana_floods: int = 0


def is_land(name: str) -> bool:
    return CARDS[name]["type"] == "land"


def is_creature(name: str) -> bool:
    return CARDS[name]["type"] in ("creature", "artifact_creature")


def battlefield_has(g: Game, predicate) -> int:
    return sum(1 for p in g.battlefield if predicate(p.name))


def count_in_play(g: Game, name: str) -> int:
    return sum(1 for p in g.battlefield if p.name == name)


def has_any(g: Game, names: set[str]) -> bool:
    return any(p.name in names for p in g.battlefield)


# ---------- Per-turn play ----------

def play_land(g: Game) -> bool:
    """Pick the best land in hand (untapped + colors we still need)."""
    lands = [n for n in g.hand if is_land(n)]
    if not lands:
        return False

    # what colors do we currently produce?
    have_colors = colors_we_produce(g)
    needs = needed_colors(g) - have_colors

    def score(name: str) -> tuple:
        data = CARDS[name]
        tapped = data.get("enters_tapped", False)
        # Fetches: treat as untapped (cracked immediately) and score by needed colors
        if data.get("fetch_targets"):
            # pick the most useful target
            best_match = 0
            for combo in data["fetch_targets"]:
                best_match = max(best_match, len(set(combo) & needs))
            return (1,            # not enters-tapped
                    best_match,    # covers more needs first
                    -1)            # fetches preferred slightly
        produces = set(data.get("produces", []))
        match = len(produces & needs)
        return (0 if tapped else 1, match, len(produces))

    lands.sort(key=score, reverse=True)
    pick = lands[0]
    g.hand.remove(pick)
    data = CARDS[pick]
    if data.get("fetch_targets"):
        # crack: pick best target name not already in play (any dual that produces a needed color)
        targets = data["fetch_targets"][0]
        # find an in-DB land that produces those colors that's not already in play
        candidates = []
        for name, d in CARDS.items():
            if d.get("type") != "land":
                continue
            if d.get("fetch_targets"):
                continue
            if set(d.get("produces", [])) & set(targets):
                candidates.append(name)
        # prefer ones not in play and not enters-tapped
        candidates.sort(key=lambda n: (count_in_play(g, n),
                                       CARDS[n].get("enters_tapped", False),
                                       -len(set(CARDS[n].get("produces", [])) & needs)))
        fetched = candidates[0] if candidates else pick
        g.battlefield.append(Perm(name=fetched, turn_entered=g.turn,
                                  tapped=CARDS[fetched].get("enters_tapped", False),
                                  summoning_sick=False))
    else:
        g.battlefield.append(Perm(name=pick, turn_entered=g.turn,
                                  tapped=data.get("enters_tapped", False),
                                  summoning_sick=False))
    return True


def colors_we_produce(g: Game) -> set[str]:
    cols = set()
    for p in g.battlefield:
        if p.name == _TOKEN_NAME:
            continue
        d = CARDS[p.name]
        if d["type"] == "land":
            for c in d.get("produces", []):
                cols.add(c)
        elif d["type"] == "artifact" and d.get("ramp_amount"):
            rc = d.get("ramp_colors", [])
            if "any" in rc:
                cols.update(["W", "U", "B", "R", "G"])
            else:
                cols.update(rc)
    return cols


def needed_colors(g: Game) -> set[str]:
    needed = set()
    for name in g.hand + g.command_zone:
        for ch in CARDS[name].get("cost", ""):
            if ch in "WUBRG":
                needed.add(ch)
    return needed


def collect_sources(g: Game) -> list[ManaSource]:
    src: list[ManaSource] = []
    for p in g.battlefield:
        if p.tapped:
            continue
        if p.name == _TOKEN_NAME:
            continue
        d = CARDS[p.name]
        if d["type"] == "land":
            colors = d.get("produces", [])
            if not colors:  # raw fetch already converted, skip
                continue
            src.append(ManaSource(colors=list(colors),
                                  burst=d.get("burst_colorless", 0),
                                  label=p.name))
        elif d["type"] == "artifact" and d.get("ramp_amount") and not d.get("ramp_oneshot"):
            amt = d["ramp_amount"]
            colors = list(d.get("ramp_colors", []))
            if "any" in colors:
                colors = ["any"]
            if amt > 1 and colors == ["C"]:
                # Sol Ring, Mana Vault, Grim Monolith style — bundle as one source + burst
                src.append(ManaSource(colors=["C"], burst=amt - 1, label=p.name))
            else:
                src.append(ManaSource(colors=colors, burst=0, label=p.name))
    for _ in range(g.treasures):
        src.append(ManaSource(colors=["any"], label="Treasure"))
    return src


# ---------- Casting ----------

def cost_pays_for(name: str, sources: list[ManaSource]) -> list[int] | None:
    d = CARDS[name]
    g_amt, c_syms = parse_cost(d.get("cost", "0"))
    return pay_cost(sources, g_amt, c_syms)


def card_priority(name: str, g: Game) -> float:
    """Higher = cast earlier. Tuned for Isshin Mardu goldfish."""
    d = CARDS[name]
    cmc = d.get("cmc", 0)
    score = 0.0
    if d.get("ramp_amount") or d.get("ramp_oneshot"):
        score = 100 - cmc * 5   # ramp first, cheapest ramp first
        return score
    if d.get("isshin"):
        return 95
    if d.get("haste_grant"):
        return 92
    if d.get("mondrak"):
        return 88
    if d.get("dmg_per_etb") or d.get("dmg_per_small_attacker") \
       or d.get("dmg_per_attacker") or d.get("tokens_per_attack_event"):
        return 84 - cmc
    if is_creature(name):
        bonus = (d.get("tokens_on_attack", 0) * 3
                 + d.get("battle_cry", 0) * 3
                 + d.get("treasure_on_attack", 0) * 2
                 + (3 if d.get("winota") else 0))
        return 60 + d.get("power", 0) + bonus - cmc * 0.5
    if d.get("burn_damage"):
        return 55 + d["burn_damage"]
    # ignored utility (removal, protection) – low priority in goldfish
    return 20 - cmc


def commander_in_command_zone(g: Game) -> str | None:
    return g.command_zone[0] if g.command_zone else None


def try_cast_commander(g: Game, sources: list[ManaSource]) -> list[int] | None:
    name = commander_in_command_zone(g)
    if not name:
        return None
    return cost_pays_for(name, sources)


def cast_phase(g: Game):
    """Greedy cast loop. Re-evaluate sources after each successful cast."""
    progress = True
    safety = 30
    while progress and safety > 0:
        safety -= 1
        progress = False
        sources = collect_sources(g)

        # 1) Try commander first if it's a fresh turn ≥ 3 and we haven't cast it
        if commander_in_command_zone(g) and g.turn >= 3:
            paid = try_cast_commander(g, sources)
            if paid is not None:
                resolve_cast(g, g.command_zone.pop(0), paid, sources, from_command=True)
                progress = True
                continue

        # 2) Greedy through hand by priority
        candidates = [n for n in g.hand if not is_land(n)]
        candidates.sort(key=lambda n: card_priority(n, g), reverse=True)
        for name in candidates:
            paid = cost_pays_for(name, sources)
            if paid is not None:
                g.hand.remove(name)
                resolve_cast(g, name, paid, sources)
                progress = True
                break


def resolve_cast(g: Game, name: str, paid_indices: list[int], sources: list[ManaSource],
                 from_command: bool = False):
    g.cast_log.append((g.turn, name))
    # Consume sources: tap the corresponding permanents / sac treasures
    # Identify which battlefield perms map to source indices.
    # Treasures appear at the end of `sources` in order; sac as needed.
    perm_pool = []
    treasure_indices = []
    for i, s in enumerate(sources):
        if s.label == "Treasure":
            treasure_indices.append(i)
        else:
            perm_pool.append((i, s.label))
    # Tap chosen perms / sacrifice treasures
    used_perm_indices = [i for i in paid_indices if i not in treasure_indices]
    used_treasures = [i for i in paid_indices if i in treasure_indices]
    # Map perm sources to specific battlefield perms (greedy: first untapped match by label)
    consumed_perms = Counter()
    for src_i in used_perm_indices:
        label = sources[src_i].label
        for p in g.battlefield:
            if p.name == label and not p.tapped:
                if consumed_perms[id(p)] == 0:
                    p.tapped = True
                    consumed_perms[id(p)] += 1
                    if CARDS[p.name].get("no_untap"):
                        p.used = True
                    break
    g.treasures -= len(used_treasures)

    # Place card / resolve effect
    d = CARDS[name]
    t = d["type"]
    if d.get("ramp_oneshot"):
        amt = d.get("ramp_amount", 0)
        # Floating mana — represent as treasures available NEXT iteration of cast loop
        g.treasures += amt
        g.graveyard.append(name)
        return
    if t in ("instant", "sorcery"):
        # damage spells
        if d.get("burn_damage"):
            apply_damage(g, d["burn_damage"], reason=name)
        g.graveyard.append(name)
        return
    # Permanent enters
    perm = Perm(name=name, turn_entered=g.turn, summoning_sick=True)
    g.battlefield.append(perm)
    # ETB triggers
    apply_etb(g, perm)
    if d.get("discard_land_etb"):
        # Mox Diamond: must discard a land; if no land, sac itself. Approximate: discard first land in hand.
        lands_in_hand = [n for n in g.hand if is_land(n)]
        if lands_in_hand:
            g.hand.remove(lands_in_hand[0])
            g.graveyard.append(lands_in_hand[0])
        else:
            g.battlefield.remove(perm)
            g.graveyard.append(perm.name)


def apply_etb(g: Game, perm: Perm):
    """Handle ETB tokens + Impact-Tremors-style triggers for this ETB."""
    d = CARDS[perm.name]
    # Count creature ETB for Impact Tremors / Arabella triggers
    etb_creatures = 1 if is_creature(perm.name) else 0
    # tokens ETB from this perm
    tokens = d.get("tokens_etb", 0)
    if tokens:
        tokens = apply_mondrak(g, tokens)
        spawn_tokens(g, tokens, attacking=False)
        # they trigger ETB damage too — handled in spawn_tokens via apply_damage
    if etb_creatures:
        dmg = etb_damage_sources(g) * etb_creatures
        if dmg:
            apply_damage(g, dmg, reason=f"{perm.name} ETB triggers")


def etb_damage_sources(g: Game) -> int:
    return sum(card_data(p.name).get("dmg_per_etb", 0) for p in g.battlefield)


def isshin_multiplier(g: Game) -> int:
    return 2 ** sum(1 for p in g.battlefield if card_data(p.name).get("isshin"))


def mondrak_count(g: Game) -> int:
    return sum(1 for p in g.battlefield if card_data(p.name).get("mondrak"))


def apply_mondrak(g: Game, token_count: int) -> int:
    return token_count * (2 ** mondrak_count(g))


def spawn_tokens(g: Game, n: int, attacking: bool):
    """Tokens are 1/1 humans (close enough for Isshin/Winota go-wide)."""
    if n <= 0:
        return
    for _ in range(n):
        perm = Perm(name="__Token_1_1__", turn_entered=g.turn,
                    summoning_sick=not attacking, tapped=attacking)
        g.battlefield.append(perm)
        # ETB damage from Impact Tremors / Arabella
        dmg = etb_damage_sources(g)
        if dmg:
            apply_damage(g, dmg, reason="token ETB")


def apply_damage(g: Game, amount: int, reason: str = ""):
    if amount <= 0:
        return
    if len(g.damage_per_turn) < g.turn:
        # pad in case damage occurs before combat
        while len(g.damage_per_turn) < g.turn:
            g.damage_per_turn.append(0)
    g.damage_per_turn[g.turn - 1] += amount
    g.cumulative_damage += amount


def perm_stats(p: Perm) -> dict:
    return card_data(p.name)


def combat_phase(g: Game):
    """All willing creatures attack. Compute damage."""
    haste_global = any(card_data(p.name).get("haste_grant") for p in g.battlefield)
    attackers: list[Perm] = []
    for p in g.battlefield:
        d = perm_stats(p)
        if d["type"] not in ("creature", "artifact_creature"):
            continue
        if p.tapped:
            continue
        can_attack = (not p.summoning_sick) or d.get("haste") or haste_global
        if can_attack:
            attackers.append(p)
    if not attackers:
        # still resolve EOC effects: no Mardu Ascendancy tokens this turn
        return

    isshin_mult = isshin_multiplier(g)
    mondrak_mul = 2 ** mondrak_count(g)
    # Sum of attacker power
    total_power = sum(perm_stats(p)["power"] for p in attackers)

    # battle_cry: each source gives +1 to each OTHER attacker
    battle_cry_total = sum(perm_stats(p).get("battle_cry", 0) for p in attackers)
    if battle_cry_total > 0 and len(attackers) > 1:
        total_power += battle_cry_total * (len(attackers) - 1)

    # On-attack damage (e.g. Hellrider counted via dmg_per_attacker below; nothing direct here)
    on_attack_direct = sum(perm_stats(p).get("dmg_on_attack", 0) for p in attackers) * isshin_mult

    # Hellrider / Brutal Hordechief: +1 per attacker per source
    dmg_per_atk_sources = sum(card_data(p.name).get("dmg_per_attacker", 0)
                              for p in g.battlefield)
    dmg_per_atk = dmg_per_atk_sources * len(attackers) * isshin_mult

    # Raid Bombardment: per attacker with power ≤ 2
    raid_sources = sum(card_data(p.name).get("dmg_per_small_attacker", 0)
                       for p in g.battlefield)
    raid_targets = sum(1 for p in attackers if perm_stats(p)["power"] <= 2)
    raid_dmg = raid_sources * raid_targets * isshin_mult

    # Tokens on attack from attackers (Adeline, Anim Pakal, Hero of Bladehold, Myrel, etc.)
    on_attack_tokens = 0
    for p in attackers:
        d = perm_stats(p)
        n = d.get("tokens_on_attack", 0)
        if n:
            on_attack_tokens += n * isshin_mult
    # Token-per-attack-event sources fire once per combat each (Mardu Ascendancy, Chivalric Alliance, Launch the Fleet)
    event_token_sources = sum(card_data(p.name).get("tokens_per_attack_event", 0)
                              for p in g.battlefield)
    # Approximate: 1 token per attacker per source (e.g. Mardu Ascendancy creates X = attackers).
    event_tokens = event_token_sources * len(attackers) * isshin_mult
    total_attack_tokens = (on_attack_tokens + event_tokens) * mondrak_mul

    # Winota: each non-human attacker triggers; ~3/3 hits the table attacking.
    winota_sources = sum(1 for p in g.battlefield if card_data(p.name).get("winota"))
    non_humans = sum(1 for p in attackers
                     if not perm_stats(p).get("human"))
    winota_dmg = winota_sources * non_humans * 3 * isshin_mult  # 3/3 attacking ≈ 3 dmg

    # Treasures generated this combat (counted but not used this turn — added to pool)
    treasure_from_attack = 0
    for p in attackers:
        d = perm_stats(p)
        treasure_from_attack += d.get("treasure_on_attack", 0)
    g.treasures += treasure_from_attack * isshin_mult

    # ETB damage from spawned tokens (Impact Tremors etc.)
    etb_dmg = etb_damage_sources(g) * total_attack_tokens

    combat_dmg = total_power + total_attack_tokens + raid_dmg + dmg_per_atk \
                 + on_attack_direct + winota_dmg + etb_dmg
    if combat_dmg > 0:
        apply_damage(g, combat_dmg, reason="combat")

    # Add spawned attacking tokens to battlefield (already-attacked, tapped)
    for _ in range(total_attack_tokens):
        g.battlefield.append(Perm(name=_TOKEN_NAME, turn_entered=g.turn,
                                  summoning_sick=False, tapped=True))

    # Tap attackers
    for p in attackers:
        p.tapped = True


# ---------- Per-game driver ----------

def opening_hand(library: list[str], size: int = 7) -> tuple[list[str], list[str]]:
    return library[:size], library[size:]


def play_game(main: list[str], commander: list[str], n_turns: int, life: int,
              rng: random.Random) -> Game:
    deck = list(main)
    rng.shuffle(deck)
    hand, deck = opening_hand(deck)
    g = Game(library=deck, hand=hand, command_zone=list(commander))
    g.opening_hand = list(hand)

    for t in range(1, n_turns + 1):
        g.turn = t
        # untap
        for p in g.battlefield:
            if not CARDS.get(p.name, {}).get("no_untap"):
                p.tapped = False
            if p.turn_entered < t:
                p.summoning_sick = False
        # draw (on the play: skip turn 1 draw)
        if t > 1 and g.library:
            g.hand.append(g.library.pop(0))
        # main phase 1: land + casts
        play_land(g)
        cast_phase(g)
        # combat
        combat_phase(g)
        # main phase 2: try again (might cast post-combat with new mana from treasures)
        cast_phase(g)
        # pad damage record
        if len(g.damage_per_turn) < t:
            g.damage_per_turn.append(0)
        if g.win_turn is None and g.cumulative_damage >= life:
            g.win_turn = t
            break  # opponent dead — stop simulating further

    # Mana flood diagnostic: opening hand with >=5 lands
    open_lands = sum(1 for n in g.opening_hand if is_land(n))
    g.mana_floods = open_lands
    return g


# ---------- Aggregation + plotting ----------

def run_sims(main, commander, n_sims: int, n_turns: int, life: int, seed: int):
    rng = random.Random(seed)
    games: list[Game] = []
    for i in range(n_sims):
        games.append(play_game(main, commander, n_turns, life,
                               random.Random(rng.randrange(1 << 30))))
    return games


def report(games: list[Game], n_turns: int, life: int, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    dmg = np.array([g.damage_per_turn[:n_turns] + [0] * (n_turns - len(g.damage_per_turn))
                    for g in games], dtype=float)
    cum = np.cumsum(dmg, axis=1)

    avg_per_turn = dmg.mean(axis=0)
    med_per_turn = np.median(dmg, axis=0)
    p25 = np.percentile(dmg, 25, axis=0)
    p75 = np.percentile(dmg, 75, axis=0)
    avg_cum = cum.mean(axis=0)
    med_cum = np.median(cum, axis=0)

    peak_turn = int(np.argmax(med_per_turn)) + 1
    peak_turn_mean = int(np.argmax(avg_per_turn)) + 1

    win_turns = [g.win_turn for g in games if g.win_turn is not None]
    win_rate_by_t10 = len(win_turns) / len(games)
    avg_win = float(np.mean(win_turns)) if win_turns else float("nan")
    med_win = float(np.median(win_turns)) if win_turns else float("nan")

    # Opening hand land distribution
    open_lands = [g.mana_floods for g in games]
    flood_rate = sum(1 for x in open_lands if x >= 5) / len(open_lands)
    screw_rate = sum(1 for x in open_lands if x <= 1) / len(open_lands)
    avg_open_lands = float(np.mean(open_lands))

    # Commander cast turn distribution
    isshin_turns = []
    for g in games:
        for (t, name) in g.cast_log:
            if name == "Isshin, Two Heavens as One":
                isshin_turns.append(t); break

    # Text report (collected so we can both print and embed in PDF)
    lines: list[str] = []
    lines.append("=" * 60)
    lines.append(f"Goldfish report - {len(games)} sims, {n_turns} turns, target life {life}")
    lines.append("=" * 60)
    lines.append(f"Avg lands in opening 7 : {avg_open_lands:.2f}")
    lines.append(f"  >=5 lands (flood)    : {flood_rate*100:.1f}%")
    lines.append(f"  <=1 land (screw)     : {screw_rate*100:.1f}%")
    if isshin_turns:
        lines.append(f"Isshin landed by T{n_turns}: {len(isshin_turns)/len(games)*100:.1f}% "
                     f"(avg turn {np.mean(isshin_turns):.2f})")
    lines.append(f"Lethal by T{n_turns}    : {win_rate_by_t10*100:.1f}%")
    if win_turns:
        lines.append(f"Avg kill turn          : {avg_win:.2f} (median {med_win:.1f})")
    lines.append(f"Peak-damage turn       : T{peak_turn} "
                 f"(median {med_per_turn[peak_turn-1]:.1f} dmg) | mean peak T{peak_turn_mean}")
    lines.append("")
    lines.append("Turn |  median |   avg  |  p25 |  p75 | median cum")
    lines.append("-" * 56)
    for t in range(n_turns):
        lines.append(f" T{t+1:>2} | {med_per_turn[t]:>7.1f} | {avg_per_turn[t]:>6.1f} | "
                     f"{p25[t]:>4.0f} | {p75[t]:>4.0f} | {med_cum[t]:>8.1f}")
    for line in lines:
        print(line)

    # ----- Plots -----
    turns = np.arange(1, n_turns + 1)
    figures: list[tuple[str, "plt.Figure"]] = []

    # 1) damage per turn (median + IQR; mean overlaid)
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.plot(turns, med_per_turn, marker="o", color="#b9261b", label="median dmg")
    ax.plot(turns, avg_per_turn, marker="x", linestyle=":", color="#444",
            label="mean dmg")
    ax.fill_between(turns, p25, p75, alpha=0.2, color="#b9261b", label="p25-p75")
    ax.axvline(peak_turn, ls="--", color="grey", alpha=0.6,
               label=f"peak T{peak_turn}")
    ax.set_xlabel("Turn"); ax.set_ylabel("Damage dealt")
    ax.set_title("Damage per turn (median, mean, IQR)")
    ax.legend(); ax.grid(alpha=0.3)
    fig.tight_layout()
    figures.append(("damage_per_turn", fig))

    # 2) cumulative damage
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.plot(turns, avg_cum, marker="o", color="#2a4d8f", label="avg cumulative")
    p25_cum = np.percentile(cum, 25, axis=0)
    p75_cum = np.percentile(cum, 75, axis=0)
    ax.fill_between(turns, p25_cum, p75_cum, alpha=0.2, color="#2a4d8f")
    ax.axhline(life, ls="--", color="red", alpha=0.6, label=f"target {life}")
    ax.set_xlabel("Turn"); ax.set_ylabel("Cumulative damage")
    ax.set_title("Cumulative damage")
    ax.legend(); ax.grid(alpha=0.3)
    fig.tight_layout()
    figures.append(("cumulative_damage", fig))

    # 3) win turn distribution
    fig, ax = plt.subplots(figsize=(8, 4.5))
    if win_turns:
        bins = np.arange(0.5, n_turns + 1.5, 1)
        ax.hist(win_turns, bins=bins, color="#1b8a4e", edgecolor="black")
    ax.set_xlabel("Turn lethal reached")
    ax.set_ylabel("Games")
    ax.set_title(f"Distribution of kill turn (target {life} life)")
    ax.set_xticks(range(1, n_turns + 1))
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    figures.append(("kill_turn_distribution", fig))

    # 4) opening-hand land distribution
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.hist(open_lands, bins=np.arange(-0.5, 8.5, 1),
            color="#7a5e1a", edgecolor="black")
    ax.set_xlabel("Lands in opening 7"); ax.set_ylabel("Games")
    ax.set_title("Opening-hand land count")
    ax.set_xticks(range(0, 8))
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    figures.append(("opening_lands", fig))

    # Save individual PNGs
    for label, fig in figures:
        fig.savefig(out_dir / f"{label}.png", dpi=140)

    # Build text-report cover page (rendered with monospaced font onto a figure)
    cover = plt.figure(figsize=(8.5, 11))
    cover.suptitle("MTG Goldfish Simulation Report", fontsize=16, y=0.97)
    cover.text(0.5, 0.93, f"{len(games)} simulations | {n_turns} turns | target life {life}",
               ha="center", fontsize=10, color="#555")
    cover.text(0.05, 0.88, "\n".join(lines),
               family="monospace", fontsize=9, va="top", ha="left")
    cover.text(0.5, 0.03,
               "Heuristic simulation: no opponent interaction (no removal/blockers). "
               "Numbers approximate.",
               ha="center", fontsize=8, color="#777", style="italic")

    # Combine into a single PDF
    pdf_path = out_dir / "report.pdf"
    with PdfPages(pdf_path) as pdf:
        pdf.savefig(cover)
        for _, fig in figures:
            pdf.savefig(fig)
    plt.close(cover)
    for _, fig in figures:
        plt.close(fig)

    print()
    print(f"Outputs in: {out_dir.resolve()}")
    print(f"  - report.pdf (combined)")
    for label, _ in figures:
        print(f"  - {label}.png")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--decklist", default="decklist.txt")
    ap.add_argument("--sims", type=int, default=2000)
    ap.add_argument("--turns", type=int, default=10)
    ap.add_argument("--life", type=int, default=40,
                    help="Target life (Commander = 40)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="out")
    args = ap.parse_args()

    main_deck, commander, side = parse_decklist(args.decklist)

    # Verify every card is in DB
    missing = sorted({c for c in main_deck + commander if c not in CARDS})
    if missing:
        print("ERROR: cards missing from cards_db.py:")
        for m in missing:
            print(f"  - {m}")
        return 1

    print(f"Deck   : {len(main_deck)} cards "
          f"({sum(1 for c in main_deck if CARDS[c]['type'] == 'land')} lands)")
    print(f"Cmdr   : {', '.join(commander) or '(none)'}")
    print(f"Side   : {len(side)} cards (not used in sim)")
    print(f"Sims   : {args.sims} | turns: {args.turns} | life: {args.life}")
    print()

    games = run_sims(main_deck, commander, args.sims, args.turns, args.life, args.seed)
    report(games, args.turns, args.life, Path(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
