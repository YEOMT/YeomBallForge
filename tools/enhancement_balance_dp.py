"""Exact enhancement-balance calculation using the playable game's shared rules.

Run from any directory: python tools/enhancement_balance_dp.py [--format markdown]
Node imports economy.js and samples the deterministic success/failure branches
of forge.js to export the transition table. Python propagates Fraction weights;
there are no Monte Carlo draws or separately maintained probability constants.

The baseline spends every ticket on enhancement and stops at tier 1. Ball choices
are resolved immediately, since they affect combat but not enhancement chances.
The optional policy buys one protection token when currently at tier 5 or better,
provided enough tickets remain for both the purchase and one enhancement. It can
continue unprotected or stop if that purchase becomes unaffordable. These are
specified comparison policies, not a claim that they are strategically optimal.
"""

from collections import defaultdict
from fractions import Fraction
from pathlib import Path
import argparse
import json
import subprocess


REPOSITORY = Path(__file__).resolve().parents[1]
NODE_MODEL = r"""
import * as economy from './packages/content/economy.js';
import { CLASSES } from './packages/content/classes.js';
import { BALL_CATALOG, PATHS, getBallChoices } from './packages/content/balls.js';
import { initialBuild, fundBuild, enhance, buyShield, choosePath, chooseBall } from './packages/content/forge.js';

function stateAt(level, inventory) {
  const build = { ...initialBuild(), level, best: level, tickets: 100,
    shields: inventory, useShield: inventory > 0, awakeningRolled: true };
  if (level >= economy.CHOICE_LEVEL) {
    build.pendingChoice = true;
    if (level >= economy.AWAKENING_LEVEL) choosePath(build, economy.DEFAULT_PATH);
    chooseBall(build, getBallChoices(build)[0].id);
  }
  return build;
}
function branch(level, inventory, roll) {
  const build = stateAt(level, inventory);
  const before = build.tickets;
  const result = enhance(build, () => roll, () => 0.5);
  if (before - build.tickets !== 1) throw new Error('DP requires a one-ticket enhancement.');
  return { level: build.level, inventory: build.shields, success: result.success };
}
const transitions = {};
for (let level = 0; level < economy.MAX_LEVEL; level++) {
  const chance = economy.nextChance(level);
  transitions[level] = {};
  for (const inventory of [0, 1]) {
    const success = branch(level, inventory, 0);
    const failure = chance < 100 ? branch(level, inventory, (1 + chance / 100) / 2) : null;
    if (!success.success || failure?.success) throw new Error('Unexpected enhancement branch.');
    transitions[level][inventory] = { success, failure };
  }
}
const purchase = stateAt(0, 0);
const before = purchase.tickets;
buyShield(purchase);
if (before - purchase.tickets !== economy.SHIELD_COST || purchase.shields !== 1) {
  throw new Error('Protection purchase no longer matches the shared economy.');
}
const funded = [0, 5, 10, 15, 20].map(correct => {
  const build = initialBuild();
  fundBuild(build, correct);
  if (build.tickets !== economy.BASE_TICKETS + correct * economy.TICKETS_PER_CORRECT) {
    throw new Error('Funding no longer matches the shared economy.');
  }
  return { correct, tickets: build.tickets };
});
console.log(JSON.stringify({
  source: 'packages/content/economy.js + packages/content/forge.js',
  baseTickets: economy.BASE_TICKETS,
  ticketsPerCorrect: economy.TICKETS_PER_CORRECT,
  shieldCost: economy.SHIELD_COST,
  maxLevel: economy.MAX_LEVEL,
  awakeningLevel: economy.AWAKENING_LEVEL,
  hiddenChance: economy.HIDDEN_CHANCE,
  successPercent: economy.SUCCESS_PERCENT,
  tierByLevel: Array.from({ length: economy.MAX_LEVEL + 1 }, (_, level) => economy.tierOf(level)),
  catalogForms: BALL_CATALOG.length,
  combatProfiles: Object.keys(CLASSES).length,
  paths: Object.keys(PATHS).length,
  funded, transitions,
}));
"""


def load_model():
    try:
        result = subprocess.run(
            ['node', '--input-type=module', '-e', NODE_MODEL],
            cwd=REPOSITORY, check=True, capture_output=True, text=True,
        )
    except FileNotFoundError as error:
        raise SystemExit('Node.js is required to read the shared game rules.') from error
    except subprocess.CalledProcessError as error:
        raise SystemExit(f'Shared game rule verification failed:\n{error.stderr}') from error
    model = json.loads(result.stdout)
    assert len(model['successPercent']) == model['maxLevel'] + 1
    assert model['tierByLevel'] == list(range(model['maxLevel'] + 1, 0, -1))
    return model


def distribution(model, ticket_budget, protection_from_tier=None,
                 stop_when_protection_unaffordable=False):
    """Return exact probability of (final level, highest level) under the policy."""
    pending = [defaultdict(Fraction) for _ in range(ticket_budget + 1)]
    pending[0][(0, 0, 0)] = Fraction(1)
    final = defaultdict(Fraction)
    for spent, states in enumerate(pending):
        for (current, best, inventory), weight in states.items():
            if not weight:
                continue
            remaining = ticket_budget - spent
            current_tier = model['tierByLevel'][current]
            wants_protection = (
                protection_from_tier is not None
                and current_tier <= protection_from_tier
                and current > model['awakeningLevel']
            )
            purchase_and_attempt = model['shieldCost'] + 1
            stop_for_safety = (
                stop_when_protection_unaffordable and wants_protection
                and inventory == 0 and remaining < purchase_and_attempt
            )
            if current == model['maxLevel'] or remaining == 0 or stop_for_safety:
                final[(current, best)] += weight
                continue

            cost = 1
            if wants_protection and inventory == 0 and remaining >= purchase_and_attempt:
                inventory = 1
                cost += model['shieldCost']
            # A purchased token remains enabled until an actual downgrade failure
            # consumes it. Every branch below comes from the real forge module.
            transitions = model['transitions'][str(current)][str(inventory)]
            success_probability = Fraction(str(model['successPercent'][current + 1])) / 100
            for name, probability in [('success', success_probability), ('failure', 1 - success_probability)]:
                if not probability:
                    continue
                transition = transitions[name]
                assert transition is not None
                target = transition['level']
                pending[spent + cost][(target, max(best, target), transition['inventory'])] += weight * probability
    assert sum(final.values()) == 1, 'Probability mass must remain exactly one.'
    return final


def percentage(probability):
    return round(float(probability * 100), 12)


def median_tier(model, marginal):
    cumulative = Fraction(0)
    for level, weight in sorted(marginal.items(), key=lambda item: model['tierByLevel'][item[0]]):
        cumulative += weight
        if cumulative >= Fraction(1, 2):
            return model['tierByLevel'][level]
    raise AssertionError('Missing probability mass.')


def statistics(model, ticket_budget, protection_from_tier=None,
               stop_when_protection_unaffordable=False):
    final = distribution(model, ticket_budget, protection_from_tier,
                         stop_when_protection_unaffordable)
    marginal = defaultdict(Fraction)
    best_marginal = defaultdict(Fraction)
    for (current, best), weight in final.items():
        marginal[current] += weight
        best_marginal[best] += weight
    mean_final = sum(model['tierByLevel'][current] * weight for (current, _), weight in final.items())
    mean_best = sum(model['tierByLevel'][best] * weight for (_, best), weight in final.items())
    p_top = sum(weight for (_, best), weight in final.items() if best == model['maxLevel'])
    assert p_top == marginal[model['maxLevel']], 'Tier one is an absorbing state.'
    return {
        'ticket_budget': ticket_budget,
        'protection_from_current_tier': protection_from_tier,
        'stop_when_protection_unaffordable': stop_when_protection_unaffordable,
        'mean_final_tier': float(mean_final),
        'median_final_tier': median_tier(model, marginal),
        'mean_best_tier': float(mean_best),
        'median_best_tier': median_tier(model, best_marginal),
        'ever_reached_tier_or_better_pct': {
            tier: percentage(sum(weight for (_, best), weight in final.items()
                                 if model['tierByLevel'][best] <= tier))
            for tier in [10, 5, 1]
        },
        'tier_one_reached_exact_fraction': str(p_top),
        'final_tier_five_or_better_pct': percentage(sum(
            weight for (current, _), weight in final.items() if model['tierByLevel'][current] <= 5
        )),
        'final_distribution_pct': {model['tierByLevel'][level]: percentage(weight)
                                   for level, weight in sorted(marginal.items(), reverse=True)},
        'best_distribution_pct': {model['tierByLevel'][level]: percentage(weight)
                                  for level, weight in sorted(best_marginal.items(), reverse=True)},
    }


def report(model):
    rows = [{'correct_answers': funded['correct'], **statistics(model, funded['tickets'])}
            for funded in model['funded']]
    maximum_budget = model['funded'][-1]['tickets']
    comparison = [statistics(model, maximum_budget, 5, stop) for stop in [False, True]]
    p_top = Fraction(rows[-1]['tier_one_reached_exact_fraction'])
    return {
        'shared_rules': {key: value for key, value in model.items() if key != 'transitions'},
        'baseline_all_tickets_used': rows,
        'protection_from_current_tier_five': comparison,
        'all_30_have_maximum_tickets_at_least_one_tier_one_pct': percentage(1 - (1 - p_top) ** 30),
        'all_30_eligible_at_least_one_hidden_pct': percentage(1 - (1 - Fraction(str(model['hiddenChance']))) ** 30),
        'interpretation': [
            'These are exact finite-budget rule calculations, not measured classroom outcomes.',
            'Tier numbers decrease as balls get stronger; fractional averages are summary values, not playable tiers.',
            'Baseline choices are immediate, every available ticket is spent, and tier one stops enhancement.',
            'The strongest historical tier can be better than the final tier after unprotected failures.',
            'Protection policies are comparisons, not an optimization of win rate or expected tier.',
            'Hidden eligibility is first attainment of tier ten; the hidden class does not change enhancement probabilities.',
            'Thirty-player estimates assume independent draws and the specified common ticket budget or eligibility.',
            'Displayed decimals are rounded from exact rational probability propagation.',
        ],
    }


def markdown_table(data):
    lines = [
        '| 정답 | 강화권 | 최종 평균 티어 | 최종 중앙값 | 최고 도달 평균 티어 | T5 이상 도달 | T1 도달 |',
        '|---:|---:|---:|---:|---:|---:|---:|',
    ]
    for row in data['baseline_all_tickets_used']:
        reached = row['ever_reached_tier_or_better_pct']
        lines.append(
            f"| {row['correct_answers']} | {row['ticket_budget']} | {row['mean_final_tier']:.4f} "
            f"| T{row['median_final_tier']} | {row['mean_best_tier']:.4f} "
            f"| {reached[5]:.6f}% | {reached[1]:.8f}% |"
        )
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--format', choices=['json', 'markdown'], default='json')
    args = parser.parse_args()
    data = report(load_model())
    if args.format == 'markdown':
        print(markdown_table(data))
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
