"""Phase 6 : explicabilite SHAP (globale et locale) pour chaque branche.

explain_bundle(bundle, features, k) renvoie un dict JSON lisible par un enseignant :
les k contributions principales (variable, libelle, valeur, contribution, direction, texte).

    python -m examguard_ml.explain     # figures SHAP globales + exemples locaux
"""
from __future__ import annotations

import sys
import warnings

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import shap  # noqa: E402
from sklearn.ensemble import RandomForestClassifier  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402

from . import config, data  # noqa: E402
from .features import FEATURE_LABELS_FR  # noqa: E402
from .modeling import BalancedMLP, BalancedXGB  # noqa: E402
from .utils import md_table, write_json  # noqa: E402

WARNING_FR = ("Un score n'est pas une preuve : il signale un comportement à vérifier. "
              "L'enseignant décide et l'étudiant peut contester.")
BRANCH_FR = {"browser": "navigateur / session d'examen", "webcam": "webcam"}
_CACHE: dict = {}


def _parts(bundle: dict):
    base = bundle["model"].base
    return base.named_steps["features"], base[:-1], base.named_steps["clf"]


def _explainer(bundle: dict):
    key = id(bundle["model"])
    if key in _CACHE:
        return _CACHE[key]
    _, _, clf = _parts(bundle)
    if isinstance(clf, BalancedXGB):
        ex, unit, kind = shap.TreeExplainer(clf.model_), "log-odds (XGBoost, avant calibration)", "tree"
    elif isinstance(clf, RandomForestClassifier):
        ex, unit, kind = shap.TreeExplainer(clf), "probabilité (votes de la forêt, avant calibration)", "tree"
    elif isinstance(clf, LogisticRegression):
        ex = shap.LinearExplainer(clf, bundle["background"])
        unit, kind = "log-odds (régression logistique, avant calibration)", "linear"
    elif isinstance(clf, BalancedMLP):
        ex = shap.KernelExplainer(lambda Z: clf.predict_proba(Z)[:, 1], bundle["background"])
        unit, kind = "probabilité (MLP, avant calibration)", "kernel"
    else:  # pragma: no cover
        raise TypeError(f"modele non pris en charge : {type(clf)}")
    _CACHE[key] = (ex, unit, kind)
    return _CACHE[key]


def shap_values(bundle: dict, X_raw: pd.DataFrame) -> tuple[np.ndarray, float, pd.DataFrame, str]:
    """Valeurs SHAP (n, f), valeur de base, variables construites (non normalisees), unite."""
    feats, pre, clf = _parts(bundle)
    X_raw = pd.DataFrame(X_raw)[bundle["raw_columns"]]
    F = feats.transform(X_raw)                # valeurs lisibles (avant normalisation)
    Z = pre.transform(X_raw)                  # entree reelle du modele
    ex, unit, kind = _explainer(bundle)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if kind == "kernel":
            sv = ex.shap_values(np.asarray(Z, float), nsamples=200, silent=True)
        else:
            sv = ex.shap_values(np.asarray(Z, float) if kind == "tree" and isinstance(clf, BalancedXGB) else Z)
    sv = np.asarray(sv[1] if isinstance(sv, list) else sv)
    if sv.ndim == 3:
        sv = sv[..., 1]
    base = np.asarray(ex.expected_value).ravel()
    base_value = float(base[-1])
    return sv, base_value, F, unit


def _fmt_value(v: float) -> float:
    return float(round(float(v), 4))


def explain_bundle(bundle: dict, features, k: int = 5) -> dict:
    """Explication locale d'UNE observation (dict ou DataFrame d'une ligne)."""
    X = pd.DataFrame([features]) if isinstance(features, dict) else pd.DataFrame(features)
    if len(X) != 1:
        raise ValueError("explain attend exactement une observation")
    sv, base_value, F, unit = shap_values(bundle, X)
    proba = float(bundle["model"].predict_proba(X[bundle["raw_columns"]])[0, 1])
    order = np.argsort(-np.abs(sv[0]))[:k]
    contribs = []
    for j in order:
        name = bundle["feature_names"][j]
        c = float(sv[0, j])
        direction = "augmente le risque" if c > 0 else ("diminue le risque" if c < 0 else "neutre")
        label = FEATURE_LABELS_FR.get(name, name)
        val = _fmt_value(F.iloc[0, j])
        contribs.append({"variable": name, "libelle": label, "valeur": val,
                         "contribution": round(c, 5), "direction": direction,
                         "texte": f"{label} = {val:g} → {direction}"})
    return {
        "branche": BRANCH_FR.get(bundle["branch"], bundle["branch"]),
        "probabilite": round(proba, 5),
        "seuil": round(float(bundle["threshold"]), 5),
        "alerte": bool(proba >= bundle["threshold"]),
        "valeur_de_base": round(base_value, 5),
        "unite_contribution": unit,
        "contributions": contribs,
        "avertissement": WARNING_FR,
    }


def global_importance(bundle: dict, X_raw: pd.DataFrame, path_prefix=None, max_rows: int = 600) -> pd.DataFrame:
    X_raw = pd.DataFrame(X_raw)
    if len(X_raw) > max_rows:
        X_raw = X_raw.sample(max_rows, random_state=config.SEED)
    sv, _, F, unit = shap_values(bundle, X_raw)
    imp = pd.DataFrame({"variable": bundle["feature_names"],
                        "libellé": [FEATURE_LABELS_FR.get(f, f) for f in bundle["feature_names"]],
                        "importance moyenne |SHAP|": np.abs(sv).mean(axis=0)})
    imp = imp.sort_values("importance moyenne |SHAP|", ascending=False).reset_index(drop=True)
    if path_prefix is not None:
        for plot_type, suffix in (("bar", "bar"), ("dot", "beeswarm")):
            plt.figure()
            shap.summary_plot(sv, F, feature_names=bundle["feature_names"], plot_type=plot_type,
                              show=False, max_display=15, rng=np.random.default_rng(config.SEED))
            plt.title(f"SHAP — {BRANCH_FR[bundle['branch']]} ({unit})", fontsize=9)
            plt.tight_layout()
            plt.savefig(f"{path_prefix}_{suffix}.png", dpi=120)
            plt.close("all")
    return imp


def _test_rows(branch: str):
    import joblib  # noqa: F401
    pred = dict(np.load(config.ARTIFACTS / f"{branch}_predictions.npz"))
    ds = data.prepare_browser() if branch == "browser" else data.prepare_webcam()
    return ds.X.iloc[pred["idx_te"]].reset_index(drop=True), pred["y_te"], pred["p_te"]


def run() -> dict:
    import joblib

    out = {}
    md = ["# Explicabilité (SHAP)\n",
          "Contributions calculées sur le modèle **avant calibration** (la calibration est monotone : le sens "
          "des contributions est conservé). Global = moyenne des |SHAP| sur le jeu de test.\n"]
    for branch in ("browser", "webcam"):
        bundle = joblib.load(config.ARTIFACTS / f"{branch}_model.joblib")
        X_te, y_te, p_te = _test_rows(branch)
        imp = global_importance(bundle, X_te, config.FIGURES / f"shap_{branch}")
        thr = bundle["threshold"]
        yhat = p_te >= thr
        examples = {}
        for name, mask in (("vrai positif", (y_te == 1) & yhat), ("faux positif", (y_te == 0) & yhat),
                           ("faux négatif", (y_te == 1) & ~yhat)):
            idx = np.flatnonzero(mask)
            if len(idx):
                i = int(idx[np.argmax(p_te[idx])] if name != "faux négatif" else idx[np.argmin(p_te[idx])])
                examples[name] = explain_bundle(bundle, X_te.iloc[[i]], k=5)
        out[branch] = {"global": imp.to_dict(orient="records"), "examples": examples}
        md.append(f"## Branche {BRANCH_FR[branch]} — {bundle['model_label']}\n")
        md.append(md_table(imp.head(12), nd=4))
        md.append(f"\n![SHAP bar](figures/shap_{branch}_bar.png)\n![SHAP beeswarm](figures/shap_{branch}_beeswarm.png)\n")
        for name, ex in examples.items():
            lines = "\n".join(f"  - {c['texte']} (contribution {c['contribution']:+.3f})" for c in ex["contributions"])
            md.append(f"**Exemple — {name}** : probabilité {ex['probabilite']:.3f} (seuil {ex['seuil']:.3f})\n{lines}\n")
    md.append("\nFormat JSON renvoyé par `explain()` (exemple réel) :\n\n```json\n"
              + __import__("json").dumps(out["browser"]["examples"].get("vrai positif", {}),
                                         indent=2, ensure_ascii=False) + "\n```\n")
    (config.REPORTS / "explainability.md").write_text("\n".join(md), encoding="utf-8")
    write_json(out, config.REPORTS / "results_explain.json")
    return out


if __name__ == "__main__":
    run()
    sys.exit(0)
