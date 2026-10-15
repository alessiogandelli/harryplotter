"""Generate a synthetic-but-realistic dataset for playing with FigureLab.

Deterministic (fixed seed), so re-running reproduces the same file.

    python samples/generate.py

Writes ``samples/polarization_topics.csv`` with one row per piece of content:

    date                datetime
    source              categorical  (news | social | forum | blog)
    topic               categorical  (climate | economy | health | immigration | technology)
    polarization        categorical  (low | medium | high)
    sentiment           numeric      (-1 .. 1)
    engagement          numeric      (# interactions)
    likes               numeric      (# upvotes)
    stance_confidence   numeric      (0 .. 1)
"""

from __future__ import annotations

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 42
ROWS = 600

SOURCES = ["news", "social", "forum", "blog"]
SOURCE_WEIGHTS = [0.30, 0.35, 0.20, 0.15]
SOURCE_ENGAGEMENT = {"news": 120, "social": 400, "forum": 90, "blog": 60}

TOPICS = ["climate", "economy", "health", "immigration", "technology"]
POLARIZATION = ["low", "medium", "high"]
SENTIMENT_MEAN = {"low": 0.35, "medium": 0.0, "high": -0.35}

OUTPUT = Path(__file__).resolve().parent / "polarization_topics.csv"


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def generate() -> list[dict]:
    random.seed(SEED)
    start = date(2024, 1, 1)
    rows: list[dict] = []
    for _ in range(ROWS):
        source = random.choices(SOURCES, weights=SOURCE_WEIGHTS, k=1)[0]
        topic = random.choice(TOPICS)
        polarization = random.choice(POLARIZATION)

        sentiment = clamp(
            random.gauss(SENTIMENT_MEAN[polarization], 0.25), -1.0, 1.0
        )
        engagement = max(
            1.0,
            random.lognormvariate(math.log(SOURCE_ENGAGEMENT[source]), 0.8),
        )
        likes = max(
            0.0,
            engagement * random.uniform(0.3, 0.9) + random.gauss(0, 15),
        )
        stance_confidence = clamp(
            0.5 + abs(sentiment) * 0.5 + random.gauss(0, 0.08), 0.0, 1.0
        )

        rows.append(
            {
                "date": (start + timedelta(days=random.randint(0, 364))).isoformat(),
                "source": source,
                "topic": topic,
                "polarization": polarization,
                "sentiment": round(sentiment, 3),
                "engagement": round(engagement, 1),
                "likes": round(likes, 1),
                "stance_confidence": round(stance_confidence, 3),
            }
        )
    rows.sort(key=lambda row: row["date"])
    return rows


def main() -> None:
    rows = generate()
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows -> {OUTPUT}")


if __name__ == "__main__":
    main()
