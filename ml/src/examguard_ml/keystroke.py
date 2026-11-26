"""Phase 4 (optionnelle) : verification d'identite par la frappe — protocole CMU.

Reimplementation propre du protocole de Killourhy & Maxion (DSN 2009) :
- pour chaque sujet legitime : apprentissage = ses 200 premieres saisies (sessions 1-4),
  test legitime = ses 200 saisies suivantes (sessions 5-8),
  test imposteurs = les 5 premieres saisies de chacun des 50 autres sujets (250 saisies) ;
- detecteurs : Manhattan mis a l'echelle (« scaled » / normalise) et Mahalanobis ;
- EER par sujet (interpolation lineaire entre les deux points du ROC qui encadrent
  taux d'acceptation = taux de rejet, comme le script R des auteurs), puis moyenne et ecart-type.

    python -m examguard_ml.keystroke
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from . import config, data
from .utils import md_table, write_json

N_TRAIN, N_GENUINE_TEST, N_IMPOSTOR_PER_SUBJECT = 200, 200, 5
# Valeurs validees par l'equipe (a reproduire) et valeurs publiees (Killourhy & Maxion 2009, tableau 2)
EXPECTED_TEAM = {"manhattan_scaled": 0.0955, "mahalanobis": 0.1097}
PUBLISHED = {"manhattan_scaled": 0.0962, "mahalanobis": 0.1101}


def timing_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in data.KEYSTROKE_META]


def protocol_split(df: pd.DataFrame, subject: str, cols: list[str]):
    own = df[df["subject"] == subject]
    train = own.iloc[:N_TRAIN][cols].to_numpy(float)
    genuine = own.iloc[N_TRAIN:N_TRAIN + N_GENUINE_TEST][cols].to_numpy(float)
    others = df[df["subject"] != subject]
    impostor = others.groupby("subject", sort=False).head(N_IMPOSTOR_PER_SUBJECT)[cols].to_numpy(float)
    return train, genuine, impostor


# ---------------------------------------------------------------------------
# Detecteurs d'anomalie (score eleve = probablement un imposteur)
# ---------------------------------------------------------------------------
class ManhattanScaled:
    """Somme des |x - moyenne| / ecart absolu moyen (Araujo et al. 2004)."""

    def fit(self, X):
        self.mean_ = X.mean(axis=0)
        self.mad_ = np.abs(X - self.mean_).mean(axis=0)
        self.mad_[self.mad_ == 0] = 1e-12
        return self

    def score(self, X):
        return (np.abs(X - self.mean_) / self.mad_).sum(axis=1)


class Mahalanobis:
    """(x - moyenne)^T S^+ (x - moyenne) ; pseudo-inverse car DD = H + UD rend S singuliere."""

    def fit(self, X):
        self.mean_ = X.mean(axis=0)
        self.inv_ = np.linalg.pinv(np.cov(X, rowvar=False))
        return self

    def score(self, X):
        d = X - self.mean_
        return np.einsum("ij,jk,ik->i", d, self.inv_, d)


DETECTORS = {"manhattan_scaled": ManhattanScaled, "mahalanobis": Mahalanobis}


# ---------------------------------------------------------------------------
# EER
# ---------------------------------------------------------------------------
def _rates(genuine: np.ndarray, impostor: np.ndarray):
    """Pour chaque seuil c (de +inf aux scores decroissants), alerte si score >= c.
    miss = imposteurs acceptes (score < c), fa = legitimes rejetes (score >= c)."""
    cut = np.concatenate([[np.inf], np.unique(np.concatenate([genuine, impostor]))[::-1]])
    g, i = np.sort(genuine), np.sort(impostor)
    miss = np.searchsorted(i, cut, side="left") / len(i)
    fa = 1.0 - np.searchsorted(g, cut, side="left") / len(g)
    return miss, fa


def eer(genuine: np.ndarray, impostor: np.ndarray) -> float:
    """EER par interpolation lineaire (equivalent du script R `computeEER` des auteurs)."""
    miss, fa = _rates(np.asarray(genuine, float), np.asarray(impostor, float))
    dists = miss - fa  # decroissant
    nonneg = np.flatnonzero(dists >= 0)
    if len(nonneg) == 0:
        return float(fa[0])
    i1 = int(nonneg[-1])
    if i1 + 1 >= len(dists):
        return float((miss[i1] + fa[i1]) / 2)
    i2 = i1 + 1
    x, y = (miss[i1], fa[i1]), (miss[i2], fa[i2])
    den = y[1] - x[1] - y[0] + x[0]
    a = 0.0 if den == 0 else (x[0] - x[1]) / den
    return float(x[0] + a * (y[0] - x[0]))


def eer_closest(genuine: np.ndarray, impostor: np.ndarray) -> float:
    """Variante simple : moyenne (miss + fa)/2 au seuil ou |miss - fa| est minimal."""
    miss, fa = _rates(np.asarray(genuine, float), np.asarray(impostor, float))
    k = int(np.argmin(np.abs(miss - fa)))
    return float((miss[k] + fa[k]) / 2)


def evaluate(df: pd.DataFrame | None = None, detectors=None) -> dict:
    df = data.load_keystroke_raw() if df is None else df
    cols = timing_columns(df)
    detectors = detectors or list(DETECTORS)
    rows = []
    for subject in df["subject"].unique():
        train, genuine, impostor = protocol_split(df, subject, cols)
        row = {"subject": subject, "n_train": len(train), "n_genuine": len(genuine),
               "n_impostor": len(impostor)}
        for name in detectors:
            det = DETECTORS[name]().fit(train)
            sg, si = det.score(genuine), det.score(impostor)
            row[f"{name}_eer"] = eer(sg, si)
            row[f"{name}_eer_closest"] = eer_closest(sg, si)
        rows.append(row)
    per = pd.DataFrame(rows)
    summary = {}
    for name in detectors:
        summary[name] = {
            "eer_mean": float(per[f"{name}_eer"].mean()),
            "eer_std": float(per[f"{name}_eer"].std(ddof=1)),
            "eer_closest_mean": float(per[f"{name}_eer_closest"].mean()),
            "expected_team": EXPECTED_TEAM.get(name), "published": PUBLISHED.get(name),
        }
    return {"summary": summary, "per_subject": per, "n_subjects": int(len(per)),
            "n_features": len(cols)}


def run() -> dict:
    res = evaluate()
    s = res["summary"]
    tab = pd.DataFrame([{
        "détecteur": k,
        "EER moyen (interpolé)": v["eer_mean"], "écart-type": v["eer_std"],
        "EER moyen (point le plus proche)": v["eer_closest_mean"],
        "valeur équipe": v["expected_team"], "valeur publiée": v["published"],
        "écart à la valeur équipe": v["eer_mean"] - v["expected_team"],
    } for k, v in s.items()])
    worst = res["per_subject"].sort_values("manhattan_scaled_eer", ascending=False).head(5)[
        ["subject", "manhattan_scaled_eer", "mahalanobis_eer"]]
    md = f"""# Module CMU Keystroke — reproduction des EER

Protocole Killourhy & Maxion (2009) : {res['n_subjects']} sujets, {res['n_features']} variables temporelles,
200 saisies d'apprentissage, 200 saisies légitimes de test et 5 × 50 = 250 saisies d'imposteurs par sujet.
EER par sujet puis moyenne. Le script d'origine de l'équipe n'a pas été trouvé sur le disque : le protocole a été
réimplémenté (`src/examguard_ml/keystroke.py`) et testé (`tests/test_keystroke.py`).

{md_table(tab, nd=4)}

Sujets les plus difficiles (EER Manhattan la plus élevée) :

{md_table(worst, nd=4)}

Usage dans ExamGuard : vérification d'identité (usurpation), **pas** détection de triche ; texte fixe
(`.tie5Roanl`) à faire taper à l'inscription puis pendant l'examen. Hors fusion.
"""
    (config.REPORTS / "keystroke.md").write_text(md, encoding="utf-8")
    out = {"summary": s, "n_subjects": res["n_subjects"], "n_features": res["n_features"]}
    write_json(out, config.REPORTS / "results_keystroke.json")
    return out


if __name__ == "__main__":
    import json
    print(json.dumps(run(), indent=2))
    sys.exit(0)
