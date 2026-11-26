"""Phase 5 : fusion par moyenne ponderee des deux scores calibres — evaluation SIMULEE.

AVERTISSEMENT : il n'existe aucun jeu ou les memes sessions ont a la fois des indicateurs webcam et
des donnees navigateur. Les paires (score A, score B) ci-dessous sont SIMULEES en associant au hasard
une prediction de la branche A et une prediction de la branche B de meme etiquette (independance
conditionnelle supposee). Ces chiffres illustrent le mecanisme de fusion ; ils ne mesurent PAS la
performance reelle du systeme, qui devra etre evaluee sur le pilote avec consentement.

    python -m examguard_ml.fusion
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

from . import config, plots
from .metrics import best_f1_threshold, classification_metrics, recall_at_precision
from .utils import md_table, read_json, write_json

# Prevalence de deploiement supposee (hypothese a revoir avec le pilote) :
# proche du taux de la branche B (4,8 %), la triche est rare en conditions reelles.
DEPLOYMENT_PRIOR = 0.05
WEIGHTS = np.round(np.linspace(0, 1, 21), 2)
SCENARIOS = {
    "concordant": "la triche se voit dans les deux modalités",
    "partiel": "la triche se voit dans les deux (1/3), seulement webcam (1/3) ou seulement navigateur (1/3)",
}


def adjust_prior(p, train_prior: float, target_prior: float = DEPLOYMENT_PRIOR):
    """Corrige une probabilite calibree a la prevalence d'apprentissage vers une autre prevalence
    (regle de Bayes sur les cotes). Indispensable avant de moyenner A (47,6 %) et B (4,8 %)."""
    p = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
    odds = p / (1 - p) * (target_prior / (1 - target_prior)) / (train_prior / (1 - train_prior))
    return odds / (1 + odds)


def fuse(sa, sb, w: float):
    """Score fusionne = w * score_webcam + (1 - w) * score_navigateur (scores a la meme prevalence)."""
    if not 0.0 <= float(w) <= 1.0:
        raise ValueError("w doit etre dans [0, 1]")
    return float(w) * np.asarray(sa, dtype=float) + (1 - float(w)) * np.asarray(sb, dtype=float)


def simulate(pools: dict, n: int, prevalence: float, scenario: str, rng: np.random.Generator):
    """pools = {'A1','A0','B1','B0'} : probabilites des exemples positifs/negatifs de chaque branche."""
    n_pos = int(round(n * prevalence))
    n_neg = n - n_pos
    a_neg = rng.choice(pools["A0"], n_neg)
    b_neg = rng.choice(pools["B0"], n_neg)
    if scenario == "concordant":
        a_pos, b_pos = rng.choice(pools["A1"], n_pos), rng.choice(pools["B1"], n_pos)
    elif scenario == "partiel":
        kind = rng.integers(0, 3, n_pos)  # 0 = les deux, 1 = webcam seule, 2 = navigateur seul
        a_pos = np.where(kind == 2, rng.choice(pools["A0"], n_pos), rng.choice(pools["A1"], n_pos))
        b_pos = np.where(kind == 1, rng.choice(pools["B0"], n_pos), rng.choice(pools["B1"], n_pos))
    else:
        raise ValueError(scenario)
    sa = np.concatenate([a_pos, a_neg])
    sb = np.concatenate([b_pos, b_neg])
    y = np.concatenate([np.ones(n_pos, int), np.zeros(n_neg, int)])
    return sa, sb, y


def _pools(pred_a: dict, pred_b: dict, which: str, prior_a: float, prior_b: float) -> dict:
    ya, pa = (pred_a["y_tr"], pred_a["p_oof"]) if which == "val" else (pred_a["y_te"], pred_a["p_te"])
    yb, pb = (pred_b["y_tr"], pred_b["p_oof"]) if which == "val" else (pred_b["y_te"], pred_b["p_te"])
    pa = adjust_prior(pa, prior_a)
    pb = adjust_prior(pb, prior_b)
    return {"A1": pa[ya == 1], "A0": pa[ya == 0], "B1": pb[yb == 1], "B0": pb[yb == 0]}


def _scores(sa, sb, w):
    return {"webcam seule (A)": sa, "navigateur seul (B)": sb,
            f"fusion pondérée (w={w:.2f})": fuse(sa, sb, w), "fusion w=0,5": fuse(sa, sb, 0.5),
            "max(A, B) (comparaison)": np.maximum(sa, sb)}


def run(n_pairs: int = 2000, n_sim_val: int = 50, n_sim_test: int = 200, figures: bool = True,
        artifacts_dir=None) -> dict:
    config.set_seed()
    art = artifacts_dir or config.ARTIFACTS
    pred_a = dict(np.load(art / "webcam_predictions.npz"))
    pred_b = dict(np.load(art / "browser_predictions.npz"))
    prior_a = float(read_json(art / "webcam_model.json")["train_prior"])
    prior_b = float(read_json(art / "browser_model.json")["train_prior"])
    val = _pools(pred_a, pred_b, "val", prior_a, prior_b)
    test = _pools(pred_a, pred_b, "test", prior_a, prior_b)
    out = {"warning": "SIMULATION — paires artificielles, pas un jeu commun réel",
           "deployment_prior": DEPLOYMENT_PRIOR, "prior_train_A": prior_a, "prior_train_B": prior_b,
           "n_pairs": n_pairs, "n_sim_val": n_sim_val, "n_sim_test": n_sim_test,
           "pool_sizes_test": {k: int(len(v)) for k, v in test.items()},
           "pool_sizes_val": {k: int(len(v)) for k, v in val.items()}, "scenarios": {}}

    for sc in SCENARIOS:
        rng = np.random.default_rng(config.SEED)
        sims = [simulate(val, n_pairs, DEPLOYMENT_PRIOR, sc, rng) for _ in range(n_sim_val)]
        curve = [float(np.mean([average_precision_score(y, fuse(a, b, w)) for a, b, y in sims]))
                 for w in WEIGHTS]
        w_star = float(WEIGHTS[int(np.argmax(curve))])
        # seuils choisis sur la validation simulee (jamais sur le test)
        y_all = np.concatenate([s[2] for s in sims])
        thr = {}
        for name, s in _scores(np.concatenate([s[0] for s in sims]),
                               np.concatenate([s[1] for s in sims]), w_star).items():
            thr[name] = best_f1_threshold(y_all, s)
        rng_t = np.random.default_rng(config.SEED + 1)
        rows = {name: {"pr_auc": [], "f1": [], "recall_at_p80": [], "precision": [], "recall": []}
                for name in thr}
        first = None
        for r in range(n_sim_test):
            sa, sb, y = simulate(test, n_pairs, DEPLOYMENT_PRIOR, sc, rng_t)
            scores = _scores(sa, sb, w_star)
            if first is None:
                first = (y, scores)
            for name, s in scores.items():
                m = classification_metrics(y, s, thr[name])
                rows[name]["pr_auc"].append(m["pr_auc"])
                rows[name]["f1"].append(m["f1"])
                rows[name]["precision"].append(m["precision"])
                rows[name]["recall"].append(m["recall"])
                rows[name]["recall_at_p80"].append(recall_at_precision(y, s, 0.8))
        summary = {name: {k: [float(np.mean(v)), float(np.std(v))] for k, v in d.items()}
                   for name, d in rows.items()}
        out["scenarios"][sc] = {"description": SCENARIOS[sc], "w_star": w_star,
                                "val_pr_auc_by_w": dict(zip(map(float, WEIGHTS), curve)),
                                "thresholds": thr, "test": summary}
        if figures:
            y0, s0 = first
            plots.pr_curves({k: (y0, v) for k, v in s0.items()}, DEPLOYMENT_PRIOR,
                            f"SIMULATION — fusion, scénario {sc}",
                            config.FIGURES / f"fusion_pr_{sc}.png")
        print(f"[fusion {sc}] w* = {w_star:.2f}", flush=True)

    # Poids de deploiement : choisi sur le scenario partiel (le plus prudent), sur validation.
    w_dep = out["scenarios"]["partiel"]["w_star"]
    cfg = {"w_webcam": w_dep, "w_browser": round(1 - w_dep, 2), "deployment_prior": DEPLOYMENT_PRIOR,
           "prior_train_webcam": prior_a, "prior_train_browser": prior_b,
           "threshold_fused": out["scenarios"]["partiel"]["thresholds"][f"fusion pondérée (w={w_dep:.2f})"],
           "source": "SIMULATION (paires artificielles) — à recalibrer sur le pilote"}
    write_json(cfg, art / "fusion_config.json")
    out["deployed"] = cfg
    return out


def write_report(res: dict) -> None:
    parts = [f"""# Fusion des branches A et B — **SIMULATION**

> **Avertissement.** Aucun jeu de données public ne contient, pour les mêmes sessions, des indicateurs
> webcam ET des données de session/navigateur. Les paires ci-dessous sont **simulées** : on associe au hasard
> une prédiction de test de la branche A et une prédiction de test de la branche B de même étiquette
> (indépendance conditionnelle supposée), à une prévalence de {res['deployment_prior']:.0%}.
> Ces chiffres servent à **choisir et vérifier le mécanisme de fusion**, pas à annoncer une performance.
> Les poids devront être ré-estimés sur le pilote (10–20 volontaires, scénarios scriptés).

- Avant fusion, chaque probabilité calibrée est **ramenée à la même prévalence** ({res['deployment_prior']:.0%}) :
  la branche A est calibrée sur un jeu à {res['prior_train_A']:.1%} de triche, la branche B à {res['prior_train_B']:.1%}.
- Poids choisi sur des paires simulées à partir des prédictions **hors-échantillon de l'apprentissage**
  ({res['n_sim_val']} simulations), évalué sur des paires simulées à partir des **jeux de test** ({res['n_sim_test']} simulations
  de {res['n_pairs']} paires). Seuils choisis sur la validation simulée.
- Taille des réservoirs de test : {res['pool_sizes_test']} — la branche B n'a que {res['pool_sizes_test']['B1']} positifs de test,
  réutilisés de nombreuses fois : la variabilité réelle est sous-estimée.
"""]
    for sc, d in res["scenarios"].items():
        tab = pd.DataFrame([{
            "score": name,
            "PR-AUC (moy ± é.-t.)": f"{v['pr_auc'][0]:.3f} ± {v['pr_auc'][1]:.3f}",
            "F1": f"{v['f1'][0]:.3f} ± {v['f1'][1]:.3f}",
            "précision": f"{v['precision'][0]:.3f}", "rappel": f"{v['recall'][0]:.3f}",
            "rappel@P≥0,8": f"{v['recall_at_p80'][0]:.3f} ± {v['recall_at_p80'][1]:.3f}",
        } for name, v in d["test"].items()])
        curve = pd.DataFrame({"w (poids webcam)": list(d["val_pr_auc_by_w"].keys()),
                              "PR-AUC validation simulée": list(d["val_pr_auc_by_w"].values())})
        parts.append(f"""## Scénario « {sc} » : {d['description']}

Poids optimal sur validation simulée : **w = {d['w_star']:.2f}** (webcam) / {1 - d['w_star']:.2f} (navigateur).

{md_table(tab)}

<details><summary>PR-AUC de validation selon w</summary>

{md_table(curve)}

</details>

![fusion {sc}](figures/fusion_pr_{sc}.png)
""")
    dep = res["deployed"]
    parts.append(f"""## Configuration exportée (`artifacts/fusion_config.json`)

w_webcam = {dep['w_webcam']}, w_navigateur = {dep['w_browser']}, prévalence de déploiement = {dep['deployment_prior']},
seuil d'alerte sur le score fusionné = {dep['threshold_fused']:.3f} (choisi sur validation simulée, scénario partiel).
Source : {dep['source']}.

La ligne « max(A, B) » n'est **pas** la règle validée (moyenne pondérée) : elle est donnée à titre de comparaison,
car une moyenne dilue un signal fort présent dans une seule modalité.
""")
    (config.REPORTS / "fusion.md").write_text("\n".join(parts), encoding="utf-8")


def main() -> int:
    res = run()
    write_json(res, config.REPORTS / "results_fusion.json")
    write_report(res)
    return 0


if __name__ == "__main__":
    sys.exit(main())
