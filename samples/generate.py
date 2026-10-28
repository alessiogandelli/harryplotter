"""Deterministic example datasets bundled with Harry Plotter.

    python samples/generate.py

Writes the example datasets into web/public/samples/. All values are synthetic,
generated from simple models with a fixed seed, so re-running reproduces the files.
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


def seabirds(rng: random.Random):
    """Three seabird species: bill depth vs length shows Simpson's paradox."""
    species = {
        # mean bill length, depth, flipper, mass (female); island weights
        "Adélie": (38.8, 18.3, 190, 3370, {"Torgersen": 0.35, "Biscoe": 0.3, "Dream": 0.35}),
        "Chinstrap": (48.8, 18.4, 196, 3530, {"Dream": 1.0}),
        "Gentoo": (47.5, 15.0, 217, 4680, {"Biscoe": 1.0}),
    }
    counts = {"Adélie": 152, "Chinstrap": 68, "Gentoo": 124}
    rows = []
    for sp, (bl, bd, fl, bm, islands) in species.items():
        for _ in range(counts[sp]):
            sex = rng.choice(["female", "male"])
            m = 1.0 if sex == "female" else 1.0
            size = rng.gauss(0, 1)  # shared body size drives a positive within-species slope
            male = sex == "male"
            length = bl + (2.2 if male else -1.0) + 2.0 * size + rng.gauss(0, 1.3)
            depth = bd + (0.9 if male else -0.4) + 0.55 * size + rng.gauss(0, 0.45)
            flipper = fl + (5 if male else -3) + 4.5 * size + rng.gauss(0, 3)
            mass = bm * m + (550 if male else 0) + 260 * size + rng.gauss(0, 170)
            island = rng.choices(list(islands), weights=list(islands.values()))[0]
            rows.append({
                "species": sp, "island": island, "sex": sex, "year": rng.choice([2021, 2022, 2023]),
                "bill_length_mm": round(length, 1), "bill_depth_mm": round(depth, 1),
                "flipper_length_mm": round(flipper), "body_mass_g": int(round(mass / 25) * 25),
            })
    return rows


def dose_response(rng: random.Random):
    """Cell viability for five compounds over a log-spaced concentration series."""
    compounds = {"Cmpd-A": (0.08, 1.2), "Cmpd-B": (0.9, 1.0), "Cmpd-C": (4.5, 1.6), "Cmpd-D": (22.0, 0.9), "Vehicle": (1e9, 1.0)}
    lines = {"HeLa": 1.0, "MCF-7": 2.6}
    concs = [10 ** (k / 2) for k in range(-6, 5)]  # 0.001 .. 100 µM
    rows = []
    for line, shift in lines.items():
        for cmpd, (ic50, hill) in compounds.items():
            for c in concs:
                for rep in (1, 2, 3, 4):
                    v = 100 / (1 + (c / (ic50 * shift)) ** hill)
                    v = max(0.0, v + rng.gauss(0, 3.5))
                    rows.append({"cell_line": line, "compound": cmpd, "conc_uM": round(c, 4), "replicate": rep, "viability_pct": round(v, 1)})
    return rows


def volcano(rng: random.Random):
    """Differential expression of 4,000 genes, treated vs control."""
    syll = ["AR", "BC", "CD", "DN", "EF", "FG", "GL", "HX", "IK", "JM", "KR", "LT", "MY", "NP", "OS", "PL", "RB", "SL", "TN", "WD", "ZF"]
    rows, used = [], set()
    for i in range(4000):
        while True:
            g = rng.choice(syll) + rng.choice(syll) + str(rng.randint(1, 30))
            if g not in used:
                used.add(g)
                break
        de = rng.random() < 0.07
        lfc = rng.gauss(0, 0.35) if not de else rng.choice([-1, 1]) * rng.uniform(0.8, 4.5)
        se = rng.uniform(0.18, 0.5)
        z = abs(lfc / se) + (rng.gauss(0, 0.6) if de else 0)
        p = max(1e-300, math.erfc(z / math.sqrt(2)))
        base = round(10 ** rng.uniform(0.7, 4.5), 1)
        sig = p < 0.05 and abs(lfc) >= 1
        rows.append({
            "gene": g, "log2_fold_change": round(lfc, 3), "p_value": float(f"{p:.3g}"), "neg_log10_p": round(-math.log10(p), 3),
            "base_mean": base, "regulation": ("up" if lfc > 0 else "down") if sig else "n.s.",
        })
    return rows


def temperature(rng: random.Random):
    """Monthly temperature anomalies (°C vs 1951-1980), 1880-2025, four regions."""
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    regions = {"Global": 1.0, "Northern Hemisphere": 1.25, "Southern Hemisphere": 0.75, "Arctic": 2.9}
    rows = []
    for region, amp in regions.items():
        r = random.Random(sum(map(ord, region)))  # stable across runs, unlike hash()
        ar = 0.0
        for year in range(1880, 2026):
            t = year - 1880
            # slow early drift, mid-century pause, accelerating warming after 1975
            trend = -0.28 + 0.0025 * t + (0.06 if 1935 < year < 1950 else 0) + max(0, year - 1975) ** 1.35 * 0.0062
            enso = 0.12 * math.sin(2 * math.pi * (year - 1880) / 4.7)
            for m, name in enumerate(months):
                ar = 0.6 * ar + r.gauss(0, 0.1 * (1.6 if region == "Arctic" else 1))
                season = (0.25 if region == "Arctic" and name in ("Jan", "Feb", "Mar", "Nov", "Dec") else 0) * max(0, trend)
                anomaly = amp * trend + enso + ar + season
                rows.append({"date": f"{year}-{m + 1:02d}-01", "year": year, "month": name, "region": region, "anomaly_C": round(anomaly, 3)})
    return rows


def clinical_trial(rng: random.Random):
    """LDL cholesterol over 12 weeks in a three-arm randomised trial."""
    arms = {"placebo": 0.03, "10 mg": 0.22, "40 mg": 0.41}
    weeks = [0, 2, 4, 8, 12]
    rows = []
    pid = 0
    for arm, effect in arms.items():
        for _ in range(50):
            pid += 1
            age = rng.randint(38, 79)
            sex = rng.choice(["F", "M"])
            base = rng.gauss(4.4, 0.6) + (0.2 if sex == "M" else 0)
            resp = max(0.0, rng.gauss(1.0, 0.3))
            drop = rng.random() < 0.12
            for w in weeks:
                if drop and w >= 8:
                    break
                frac = effect * resp * (1 - math.exp(-w / 2.5))
                ldl = base * (1 - frac) + rng.gauss(0, 0.18)
                rows.append({
                    "patient": f"P{pid:03d}", "arm": arm, "week": w, "age": age, "sex": sex, "site": rng.choice(["Milan", "Lyon", "Leiden", "Basel"]) if w == 0 else None,
                    "ldl_mmol_l": round(ldl, 2), "adverse_event": "yes" if rng.random() < (0.02 + effect * 0.06) else "no",
                })
    # site is per patient
    site = {}
    for r in rows:
        site.setdefault(r["patient"], r["site"])
        r["site"] = site[r["patient"]]
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
    write("seabirds.csv", seabirds(random.Random(3)))
    write("dose_response.csv", dose_response(random.Random(5)))
    write("rnaseq_volcano.csv", volcano(random.Random(13)))
    write("temperature_anomalies.csv", temperature(random.Random(17)))
    write("clinical_trial.csv", clinical_trial(random.Random(19)))
