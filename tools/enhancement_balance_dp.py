"""Reproduce the proposed classroom Ballfight enhancement economy.

This is exact finite-state probability propagation using rational numbers,
not sampled Monte Carlo and not evidence from a playable game.

Rules: +0 start; targets +1..+9 succeed surely; targets +10..+20 use
85,80,75,70,65,60,50,40,30,20,10 percent. Every attempt costs one ticket.
A failure at current +0..+10 stays; otherwise it loses one level.
Thus +10 is a floor after it is first reached. There is no pity counter.
A protection token costs two tickets, survives success, and is consumed on
failure instead of losing a level. Policies buy at most one token at once.
Battle uses current level, not the historical best. Reaching +20 stops.

The main policy spends all tickets. Optional protection begins at current
+15; it buys a token only when at least three tickets remain, leaving one
ticket for the attempt. With fewer tickets it either tries unprotected or
stops, according to stop_when_protection_unaffordable.
"""

from collections import defaultdict
from fractions import Fraction
import json


SUCCESS = {
    **{level: Fraction(1) for level in range(1, 10)},
    **dict(zip(range(10, 21), map(lambda x: Fraction(x, 100),
                                [85, 80, 75, 70, 65, 60, 50, 40, 30, 20, 10]))),
}


def distribution(ticket_budget, protection_from=None,
                 stop_when_protection_unaffordable=False):
    # Bucket by tickets spent. State = (current_level, best_level, inventory).
    pending = [defaultdict(Fraction) for _ in range(ticket_budget + 1)]
    pending[0][(0, 0, 0)] = Fraction(1)
    final = defaultdict(Fraction)
    for spent, states in enumerate(pending):
        for (current, best, inventory), weight in states.items():
            remaining = ticket_budget - spent
            wants_protection = (
                protection_from is not None
                and current >= protection_from
                and current > 10
            )
            stop_for_safety = (
                stop_when_protection_unaffordable
                and wants_protection
                and inventory == 0
                and remaining < 3
            )
            if current == 20 or remaining == 0 or stop_for_safety:
                final[(current, best)] += weight
                continue

            cost = 1
            if wants_protection and inventory == 0 and remaining >= 3:
                inventory = 1
                cost += 2
            protected = wants_protection and inventory == 1
            target = current + 1
            success_probability = SUCCESS[target]
            pending[spent + cost][(target, max(best, target), inventory)] += (
                weight * success_probability
            )
            failure_probability = 1 - success_probability
            if failure_probability:
                failure_level = current if protected or current <= 10 else current - 1
                failure_inventory = 0 if protected else inventory
                pending[spent + cost][(failure_level, best, failure_inventory)] += (
                    weight * failure_probability
                )
    assert sum(final.values()) == 1
    return final


def statistics(ticket_budget, protection_from=None,
               stop_when_protection_unaffordable=False):
    final = distribution(ticket_budget, protection_from,
                         stop_when_protection_unaffordable)
    marginal = defaultdict(Fraction)
    for (current, _best), weight in final.items():
        marginal[current] += weight
    cumulative = Fraction(0)
    median = None
    for current, weight in sorted(marginal.items()):
        cumulative += weight
        if cumulative >= Fraction(1, 2):
            median = current
            break

    def pct(probability):
        return round(float(probability * 100), 12)

    return {
        "ticket_budget": ticket_budget,
        "protection_from_current_level": protection_from,
        "stop_when_protection_unaffordable": stop_when_protection_unaffordable,
        "ever_reached_pct": {
            level: pct(sum(weight for (_current, best), weight in final.items()
                           if best >= level))
            for level in [10, 15, 20]
        },
        "final_mean": float(sum(current * weight for (current, _), weight in final.items())),
        "final_median": median,
        "final_at_least_15_pct": pct(sum(weight for (current, _), weight in final.items()
                                       if current >= 15)),
        "best_mean": float(sum(best * weight for (_, best), weight in final.items())),
        "final_distribution_pct": {level: pct(weight) for level, weight in sorted(marginal.items())},
    }


def main():
    rows = [statistics(8 + correct) for correct in [5, 10, 15, 20]]
    protection = [statistics(28, 15, stop) for stop in [False, True]]
    final_28 = distribution(28)
    p20 = sum(weight for (_, best), weight in final_28.items() if best == 20)
    class_p20 = 1 - (1 - p20) ** 30
    # Hidden class: one independent 1% roll per eligible player, exactly once
    # at the first attainment of +10. Assumes all 30 players are eligible.
    class_hidden = 1 - Fraction(99, 100) ** 30
    print(json.dumps({
        "baseline_all_tickets_used": rows,
        "protection_from_current_15": protection,
        "all_30_have_28_tickets_unprotected_at_least_one_20_pct": float(class_p20 * 100),
        "all_30_eligible_hidden_1pct_at_least_one_pct": float(class_hidden * 100),
        "interpretation": [
            "These are initial-design calculations, not measured classroom outcomes.",
            "Ever reached +15 differs from ending at +15 or higher.",
            "All-ticket spending can undo gains; a player may choose to stop earlier.",
            "Median can move non-monotonically due to the +/-1 walk's parity.",
            "Class probabilities assume independent player draws and the stated common budget.",
            "Hidden eligibility is first +10 attainment, not every enhancement request.",
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
