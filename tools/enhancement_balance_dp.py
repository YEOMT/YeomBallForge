"""v2.1 exact Fraction cross-check of the shared forge's policy-A transitions.

The full A/B Bellman analysis lives in tools/economy-v21.mjs. This independent
rational propagation reads the actual forge transition table from that module,
checks terminal mass exactly equals one, and compares the Number-based result.
No copied success table, no Monte Carlo, no claims about observed students.
"""
from collections import defaultdict
from fractions import Fraction
from pathlib import Path
import argparse
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def node_data(*args):
    return json.loads(subprocess.check_output(
        ['node', 'tools/economy-v21.mjs', *args], cwd=ROOT, text=True,
        encoding='utf-8'))


def policy_a(model, budget):
    active = [defaultdict(Fraction) for _ in range(budget + 1)]
    active[0][(0, 0)] = Fraction(1)
    final = defaultdict(Fraction)
    for used, states in enumerate(active):
        for (level, wards), weight in states.items():
            if level == 19 or used == budget:
                final[level] += weight
                continue
            transition = model['transitions'][level]
            protected = level >= 10
            bought = max(0, transition['need'] - wards) if protected else 0
            cost = 1 + bought * model['rules']['wardPrice']
            if used + cost > budget:
                final[level] += weight
                continue
            branches = transition['wards'][wards + bought][
                'protected' if protected else 'unprotected']
            p = Fraction(model['rules']['successByTargetTier'][str(19-level)], 100)
            for branch, chance in [('success', p), ('failure', 1-p)]:
                target = branches[branch]
                active[used + cost][(target['level'], target['wards'])] += weight * chance
    assert sum(final.values()) == 1, 'Exact terminal mass must equal one'
    return {
        'tickets': budget,
        'T5_pct': float(sum(p for level, p in final.items() if level >= 15) * 100),
        'T3_pct': float(sum(p for level, p in final.items() if level >= 17) * 100),
        'T1_pct': float(final[19] * 100),
        'T1_exact_fraction': str(final[19]),
        'terminal_mass_exact': '1',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--format', choices=['json', 'markdown'], default='json')
    parser.add_argument('--out')
    args = parser.parse_args()
    model, js = node_data('--model'), node_data()
    rows = [policy_a(model, b) for b in [30, 50, 70, 90, 130, 170]]
    for exact, floating in zip(rows, js['rows']):
        for field in ['T5', 'T3', 'T1']:
            assert abs(exact[field+'_pct'] - floating['policyA'][field]) < 1e-9
    result = {'version': model['version'], 'method': 'Python Fraction complete probability propagation',
              'floating_tolerance_percentage_points': 1e-9, 'rows': rows,
              'interpretation': 'One ball, immediate choices, fixed budget; not observed students or multiplayer win rate.'}
    if args.format == 'markdown':
        output = '| 강화권 | 정책 A T5 | 정책 A T3 | 정책 A T1 |\n|---:|---:|---:|---:|\n'
        output += '\n'.join(f"| {r['tickets']} | {r['T5_pct']:.6f}% | {r['T3_pct']:.6f}% | {r['T1_pct']:.9f}% |" for r in rows)
    else:
        output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(output+'\n', encoding='utf-8')
    else:
        print(output)


if __name__ == '__main__':
    main()
