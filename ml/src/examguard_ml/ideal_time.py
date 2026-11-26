"""Vérification de la règle « temps idéal » de la branche B — SIMULATION de promotions.

Constat : dans online_exam_data.csv, un étudiant honnête a en médiane 50 % de ses réponses « dans le temps
idéal » (4,2 % seulement à 100 %). Avec un temps idéal fixe de 180 s, presque toutes les réponses d'un
étudiant normal sont « dans le temps idéal » : il sort du domaine appris et le modèle l'alerte.
On compare la règle fixe (180 s) et une règle adaptative (médiane des temps de réponse de l'examen).
Les temps simulés sont des hypothèses explicites, à remplacer par les données du pilote.

    python -m examguard_ml.ideal_time
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from . import config
from .features import session_counts
from .utils import md_table, write_json

N_Q, N_HONEST, N_CHEAT, N_COHORTS = 20, 28, 2, 25
PACES = [40, 75, 120, 200]   # temps median par question des etudiants honnetes (s)


def _cohort(pace: float, rng: np.random.Generator):
    students = []
    for s in range(N_HONEST + N_CHEAT):
        cheat = s >= N_HONEST
        if cheat:
            times = rng.uniform(5, 20, N_Q)
            correct = rng.random(N_Q) < 0.95
        else:
            speed = rng.lognormal(0, 0.35)                   # etudiant plus ou moins rapide
            times = pace * speed * rng.lognormal(0, 0.45, N_Q)
            correct = rng.random(N_Q) < rng.beta(6.5, 3.5)  # ~65 % de bonnes reponses en moyenne
        students.append((cheat, np.clip(times, 2, 3600), correct))
    return students


def _proba(model_bundle, students, ideal):
    rows = []
    for _, times, correct in students:
        answers = [{"seconds": float(t), "correct": bool(c)} for t, c in zip(times, correct)]
        rows.append(session_counts("remote", N_Q, answers, float(times.sum() + 30), ideal_seconds=ideal))
    X = pd.DataFrame(rows)[model_bundle["raw_columns"]]
    p = model_bundle["model"].predict_proba(X)[:, 1]
    return p >= model_bundle["threshold"]


def run(seed: int = config.SEED) -> pd.DataFrame:
    import joblib

    bundle = joblib.load(config.ARTIFACTS / "browser_model.joblib")
    rng = np.random.default_rng(seed)
    out = []
    for pace in PACES:
        stats = {"fixe": [[], []], "adaptatif": [[], []]}
        for _ in range(N_COHORTS):
            students = _cohort(pace, rng)
            cheat = np.array([s[0] for s in students])
            median = float(np.median(np.concatenate([s[1] for s in students])))
            for mode, ideal in (("fixe", 180.0), ("adaptatif", median)):
                alert = _proba(bundle, students, ideal)
                stats[mode][0].append(alert[~cheat].mean())
                stats[mode][1].append(alert[cheat].mean())
        for mode, (fp, tp) in stats.items():
            out.append({"rythme (s/question, honnêtes)": pace, "temps idéal": "180 s fixe" if mode == "fixe" else "médiane de l'examen",
                        "fausses alertes (honnêtes)": float(np.mean(fp)), "tricheurs détectés": float(np.mean(tp))})
    tab = pd.DataFrame(out)
    md = f"""# Règle « temps idéal » — vérification par SIMULATION

> Simulation : {N_COHORTS} promotions de {N_HONEST} étudiants honnêtes + {N_CHEAT} tricheurs par rythme d'examen,
> {N_Q} questions. Honnêtes : temps log-normaux autour du rythme, ~65 % de bonnes réponses. Tricheurs : 5–20 s par
> question, 95 % de bonnes réponses. Hypothèses à remplacer par les données du pilote.

Constat sur les données réelles (`online_exam_data.csv`) : un étudiant honnête a en médiane **50 %** de réponses
« dans le temps idéal » ; seuls 4,2 % en ont 100 %. La règle fixe de 180 s met presque toutes les réponses d'un étudiant
normal « dans le temps idéal » : il sort du domaine appris.

{md_table(tab, nd=2)}

Règle adaptative : temps idéal = médiane des temps de réponse de toutes les copies de l'examen (≈ 50 % des réponses
d'un étudiant typique en dessous, comme dans le jeu d'entraînement). Elle suppose qu'une majorité d'étudiants est
honnête et nécessite quelques copies avant d'être stable (repli prévu dans l'application).
"""
    (config.REPORTS / "ideal_time.md").write_text(md, encoding="utf-8")
    write_json(tab.to_dict(orient="records"), config.REPORTS / "results_ideal_time.json")
    return tab


if __name__ == "__main__":
    print(run().to_string(index=False))
    sys.exit(0)
