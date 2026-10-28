"""Deterministic example datasets bundled with Harry Plotter.

    python samples/generate.py

Writes reaction_times.csv and growth_curves.csv into web/public/samples/.
"""

import csv
import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "samples"


def reaction_times(rng: random.Random):
    rows = []
    conditions = {"control": 0.0, "low dose": -25.0, "high dose": -60.0}
    subject = 0
    for condition, effect in conditions.items():
        for _ in range(8):
            subject += 1
            age = rng.randint(19, 41)
            sex = rng.choice(["F", "M"])
            base = rng.gauss(520, 45)
            for session in ("pre", "post"):
                for trial in range(1, 11):
                    shift = effect if session == "post" else 0.0
                    rt = math.exp(rng.gauss(math.log(max(250, base + shift - 4 * trial)), 0.11))
                    acc = min(1.0, max(0.0, rng.gauss(0.86 + (0.04 if session == "post" else 0) + (-shift / 1500), 0.06)))
                    rows.append({
                        "subject": f"S{subject:02d}", "condition": condition, "session": session, "trial": trial,
                        "rt_ms": round(rt, 1), "accuracy": round(acc, 3), "age": age, "sex": sex,
                    })
    return rows


def growth_curves(rng: random.Random):
    rows = []
    strains = {"WT": (0.62, 1.45), "ΔmutA": (0.41, 1.20), "ΔmutB": (0.55, 0.85)}
    for temp, tfac in ((30, 0.8), (37, 1.0)):
        for strain, (rate, cap) in strains.items():
            for rep in (1, 2, 3):
                r = rate * tfac * rng.gauss(1, 0.04)
                k = cap * rng.gauss(1, 0.03)
                for t in range(0, 26, 1):
                    hours = t * 2
                    od = k / (1 + ((k - 0.02) / 0.02) * math.exp(-r * hours))
                    od = max(0.005, od * rng.gauss(1, 0.03) + rng.gauss(0, 0.004))
                    rows.append({"time_h": hours, "strain": strain, "temperature_C": temp, "replicate": rep, "od600": round(od, 4)})
    return rows


def write(name, rows):
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / name, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(name, len(rows))


if __name__ == "__main__":
    write("reaction_times.csv", reaction_times(random.Random(7)))
    write("growth_curves.csv", growth_curves(random.Random(11)))
