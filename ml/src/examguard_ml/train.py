"""Phases 2 et 3 : entrainement, selection, calibration et sauvegarde d'une branche.

    python -m examguard_ml.train browser
    python -m examguard_ml.train webcam
"""
from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import average_precision_score
from sklearn.model_selection import (RepeatedStratifiedKFold, StratifiedGroupKFold, StratifiedKFold,
                                     train_test_split)

from . import config, data, plots
from .features import BrowserFeatures, WebcamFeatures, WebcamReferenceFeatures
from .metrics import best_f1_threshold, bootstrap_ci, classification_metrics
from .modeling import (CALIBRATORS, BalancedXGB, CalibratedPipeline, ModelSpec, choose_calibration,
                       cv_predict, default_specs, leakage_checks, make_pipeline)
from .utils import md_table, versions, write_json

TIE_TOLERANCE = 0.005  # ecart de PR-AUC CV en dessous duquel on prefere le modele le plus simple


# ---------------------------------------------------------------------------
# Decoupages
# ---------------------------------------------------------------------------
def browser_test_split(ds: data.Dataset, seed: int = config.SEED):
    idx = np.arange(len(ds.y))
    # Une ligne = un participant : la stratification par ligne est un decoupage par participant.
    return train_test_split(idx, test_size=0.25, stratify=ds.y, random_state=seed)


def browser_cv_splits(X, y, groups, seed: int = config.SEED, n_repeats: int = 3, n_splits: int = 5):
    rskf = RepeatedStratifiedKFold(n_splits=n_splits, n_repeats=n_repeats, random_state=seed)
    return [(i // n_splits, tr, va) for i, (tr, va) in enumerate(rskf.split(X, y))]


def group_test_split(ds: data.Dataset, seed: int = config.SEED):
    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=seed)
    tr, te = next(sgkf.split(np.zeros(len(ds.y)), ds.y, ds.groups))
    return tr, te


def group_cv_splits(X, y, groups, seed: int = config.SEED, n_splits: int = 5):
    sgkf = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)
    return [(0, tr, va) for tr, va in sgkf.split(X, y, groups)]


@dataclass
class BranchConfig:
    name: str
    title: str
    dataset: data.Dataset
    features: object
    specs: list
    test_split: callable
    cv_splits: callable
    extra: dict = field(default_factory=dict)


def browser_config(fast: bool = False, feature_set: str = "complet") -> BranchConfig:
    ds = data.prepare_browser()
    cv = (lambda X, y, g: browser_cv_splits(X, y, g, n_repeats=1, n_splits=3)) if fast else browser_cv_splits
    return BranchConfig("browser", "Branche B — session d'examen (online_exam_data.csv)", ds,
                        BrowserFeatures(feature_set), default_specs("browser", fast),
                        browser_test_split, cv, {"feature_set": feature_set})


def webcam_config(fast: bool = False) -> BranchConfig:
    ds = data.prepare_webcam()
    cv = (lambda X, y, g: group_cv_splits(X, y, g, n_splits=3)) if fast else group_cv_splits
    return BranchConfig("webcam", "Branche A — indicateurs webcam (Mendeley 10.17632/39xs8th543.1)", ds,
                        WebcamFeatures(), default_specs("webcam", fast), group_test_split, cv,
                        {"block_size": data.WEBCAM_BLOCK_SIZE})


# ---------------------------------------------------------------------------
# Entrainement d'une famille de modeles
# ---------------------------------------------------------------------------
def run_family(features, spec: ModelSpec, X_tr, y_tr, X_te, y_te, splits) -> dict:
    t0 = time.perf_counter()
    pipes = [make_pipeline(features, spec, p) for p in spec.grid]
    cv = cv_predict(pipes, X_tr, y_tr, splits)
    best_i = int(np.argmax([c["ap_mean"] for c in cv]))
    best = cv[best_i]
    params = spec.grid[best_i]
    cal = choose_calibration(best["oof"], y_tr)
    threshold = best_f1_threshold(y_tr, cal["p_oof"])
    base = make_pipeline(features, spec, params).fit(X_tr, y_tr)
    calibrator = CALIBRATORS[cal["method"]]().fit(best["oof"], y_tr)
    model = CalibratedPipeline(base, calibrator)
    p_te = model.predict_proba(X_te)[:, 1]
    return {
        "name": spec.name, "label": spec.label, "complexity": spec.complexity,
        "best_params": {k: (list(v) if isinstance(v, tuple) else v) for k, v in params.items()},
        "cv_ap_mean": best["ap_mean"], "cv_ap_std": best["ap_std"], "oof_ap": best["oof_ap"],
        "n_folds": len(best["fold_ap"]),
        "grid": [{"params": str(spec.grid[i]), "ap_mean": c["ap_mean"], "ap_std": c["ap_std"]}
                 for i, c in enumerate(cv)],
        "calibration": cal["method"], "calibration_brier_oof": cal["brier"],
        "threshold": threshold,
        "oof_metrics": classification_metrics(y_tr, cal["p_oof"], threshold),
        "test": classification_metrics(y_te, p_te, threshold),
        "test_raw_pr_auc": float(average_precision_score(y_te, model.raw_score(X_te))),
        "fit_seconds": time.perf_counter() - t0,
        # objets (non serialises en JSON)
        "_model": model, "_p_te": p_te, "_p_oof": cal["p_oof"], "_oof_raw": best["oof"],
    }


def select(families: dict) -> tuple[str, str]:
    best = max(families.values(), key=lambda f: f["cv_ap_mean"])
    close = [f for f in families.values() if best["cv_ap_mean"] - f["cv_ap_mean"] < TIE_TOLERANCE]
    chosen = min(close, key=lambda f: f["complexity"])
    rule = (f"meilleure PR-AUC en validation croisée sur l'apprentissage ; à moins de {TIE_TOLERANCE} "
            f"du meilleur, le modèle le plus simple est préféré (logreg < RF < XGBoost < MLP). "
            f"Le jeu de test n'intervient pas dans le choix.")
    return chosen["name"], rule


def _public(d: dict) -> dict:
    return {k: v for k, v in d.items() if not k.startswith("_")}


def high_score_flags(name: str, m: dict) -> list[str]:
    flags = []
    for k in ("pr_auc", "roc_auc"):
        if m[k] > 0.99:
            flags.append(f"{name} : {k} = {m[k]:.4f} > 0,99 → enquête de fuite obligatoire")
    return flags


# ---------------------------------------------------------------------------
# Branche complete
# ---------------------------------------------------------------------------
def run_branch(cfg: BranchConfig, out_dir: Path | None = None, figures: bool = True,
               bootstrap: int = 1000) -> dict:
    config.set_seed()
    out_dir = Path(out_dir or config.ARTIFACTS)
    out_dir.mkdir(parents=True, exist_ok=True)
    ds = cfg.dataset
    t0 = time.perf_counter()
    idx_tr, idx_te = cfg.test_split(ds)
    X_tr, X_te = ds.X.iloc[idx_tr].reset_index(drop=True), ds.X.iloc[idx_te].reset_index(drop=True)
    y_tr, y_te = ds.y[idx_tr], ds.y[idx_te]
    g_tr, g_te = ds.groups[idx_tr], ds.groups[idx_te]
    splits = cfg.cv_splits(X_tr, y_tr, g_tr)

    families = {}
    for spec in cfg.specs:
        families[spec.name] = run_family(cfg.features, spec, X_tr, y_tr, X_te, y_te, splits)
        f = families[spec.name]
        print(f"[{cfg.name}] {spec.name:14s} CV PR-AUC {f['cv_ap_mean']:.4f} ± {f['cv_ap_std']:.4f} "
              f"| test PR-AUC {f['test']['pr_auc']:.4f} | {f['fit_seconds']:.1f}s", flush=True)
    selected, rule = select(families)
    sel = families[selected]
    ci = bootstrap_ci(y_te, sel["_p_te"], sel["threshold"], n_boot=bootstrap) if bootstrap else {}
    leak = leakage_checks(X_tr, X_te, g_tr, g_te)
    flags = [fl for f in families.values() for fl in high_score_flags(f["name"], f["test"])]

    feature_names = list(sel["_model"].base.named_steps["features"].get_feature_names_out())
    # Fond pour les explicateurs lineaire/noyau : 10 centroides k-means (pas de lignes reelles stockees)
    Z_tr = np.asarray(sel["_model"].base[:-1].transform(X_tr), dtype=float)
    background = KMeans(n_clusters=10, n_init=10, random_state=config.SEED).fit(Z_tr).cluster_centers_
    res = {
        "branch": cfg.name, "title": cfg.title, "group_kind": ds.group_kind,
        "n_train": int(len(y_tr)), "n_test": int(len(y_te)),
        "pos_train": int(y_tr.sum()), "pos_test": int(y_te.sum()),
        "prevalence_train": float(y_tr.mean()), "prevalence_test": float(y_te.mean()),
        "n_cv_folds": len(splits), "leakage": leak, "high_score_flags": flags,
        "families": {k: _public(v) for k, v in families.items()},
        "selected": selected, "selection_rule": rule, "test_ci": ci,
        "feature_names": feature_names, "extra": cfg.extra,
    }

    bundle = {
        "branch": cfg.name, "model_name": selected, "model_label": sel["label"],
        "params": sel["best_params"], "model": sel["_model"], "threshold": sel["threshold"],
        "calibration": sel["calibration"],
        "raw_columns": list(ds.X.columns), "feature_names": feature_names, "background": background,
        "train_prior": float(y_tr.mean()), "metrics_test": sel["test"],
        "metrics_cv": {"pr_auc_mean": sel["cv_ap_mean"], "pr_auc_std": sel["cv_ap_std"]},
        "extra": cfg.extra, "seed": config.SEED, "versions": versions(),
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    joblib.dump(bundle, out_dir / f"{cfg.name}_model.joblib", compress=3)
    write_json({k: v for k, v in bundle.items() if k not in ("model", "background")},
               out_dir / f"{cfg.name}_model.json")
    np.savez_compressed(out_dir / f"{cfg.name}_predictions.npz",
                        idx_tr=idx_tr, idx_te=idx_te, y_tr=y_tr, y_te=y_te,
                        p_oof=sel["_p_oof"], p_te=sel["_p_te"])
    res["artifact_bytes"] = (out_dir / f"{cfg.name}_model.joblib").stat().st_size

    if figures:
        fig = config.FIGURES
        fig.mkdir(parents=True, exist_ok=True)
        plots.pr_curves({f["label"]: (y_te, f["_p_te"]) for f in families.values()},
                        float(y_te.mean()), f"{cfg.title.split(' (')[0]} — test", fig / f"{cfg.name}_pr_test.png")
        plots.confusion(sel["test"], f"{sel['label']} — test", fig / f"{cfg.name}_confusion_test.png")
        plots.reliability(y_te, sel["_p_te"], f"Calibration ({sel['calibration']}) — {sel['label']}",
                          fig / f"{cfg.name}_calibration_test.png")
    res["seconds"] = time.perf_counter() - t0
    res["_families"] = families
    res["_split"] = (idx_tr, idx_te)
    return res


# ---------------------------------------------------------------------------
# Experiences complementaires
# ---------------------------------------------------------------------------
def _spec(cfg: BranchConfig, name: str) -> ModelSpec:
    return next(s for s in cfg.specs if s.name == name)


def browser_ablations(selected: str) -> dict:
    out = {}
    for fs in ("sans_temps_ideal", "sans_correction"):
        cfg = browser_config(feature_set=fs)
        ds = cfg.dataset
        idx_tr, idx_te = cfg.test_split(ds)
        X_tr, X_te = ds.X.iloc[idx_tr].reset_index(drop=True), ds.X.iloc[idx_te].reset_index(drop=True)
        y_tr, y_te = ds.y[idx_tr], ds.y[idx_te]
        r = run_family(cfg.features, _spec(cfg, selected), X_tr, y_tr, X_te, y_te,
                       cfg.cv_splits(X_tr, y_tr, ds.groups[idx_tr]))
        out[fs] = {"cv_ap_mean": r["cv_ap_mean"], "cv_ap_std": r["cv_ap_std"],
                   "test": r["test"], "best_params": r["best_params"]}
        print(f"[browser ablation {fs}] CV {r['cv_ap_mean']:.4f} test {r['test']['pr_auc']:.4f}", flush=True)
    return out


def webcam_leakage_experiments(selected: str, params: dict) -> dict:
    """Mesure l'optimisme d'un decoupage aleatoire et l'effet de la taille des blocs."""
    cfg = webcam_config()
    spec = _spec(cfg, selected)
    pipe = make_pipeline(cfg.features, spec, {k: (tuple(v) if isinstance(v, list) else v)
                                              for k, v in params.items()})
    out = {"cv_random_vs_blocks": {}, "block_size": {}}
    ds = cfg.dataset
    X, y = ds.X, ds.y
    rnd = [(0, tr, va) for tr, va in StratifiedKFold(5, shuffle=True, random_state=config.SEED).split(X, y)]
    r = cv_predict([pipe], X, y, rnd)[0]
    out["cv_random_vs_blocks"]["aleatoire (lignes melangees)"] = {"ap_mean": r["ap_mean"], "ap_std": r["ap_std"]}
    for bs in (25, 100, 250, 500):
        dsb = data.prepare_webcam(block_size=bs)
        splits = group_cv_splits(dsb.X, dsb.y, dsb.groups)
        r = cv_predict([pipe], dsb.X, dsb.y, splits)[0]
        out["block_size"][bs] = {"ap_mean": r["ap_mean"], "ap_std": r["ap_std"],
                                 "n_blocks": int(len(np.unique(dsb.groups)))}
        print(f"[webcam blocs {bs}] CV {r['ap_mean']:.4f} ± {r['ap_std']:.4f}", flush=True)
    out["cv_random_vs_blocks"][f"blocs de {data.WEBCAM_BLOCK_SIZE}"] = out["block_size"][data.WEBCAM_BLOCK_SIZE]
    return out


def webcam_reference(split: tuple) -> dict:
    """Modele de reference NON deployable : toutes les colonnes Mendeley (dont celles non reproductibles)."""
    ds = data.prepare_webcam()
    full = ds.full.drop(columns=[data.WEBCAM_TARGET])
    idx_tr, idx_te = split
    X_tr, X_te = full.iloc[idx_tr].reset_index(drop=True), full.iloc[idx_te].reset_index(drop=True)
    y_tr, y_te = ds.y[idx_tr], ds.y[idx_te]
    spec = ModelSpec("xgboost_reference", "XGBoost — toutes variables (référence)",
                     lambda **p: BalancedXGB(**p), [{"max_depth": 4, "n_estimators": 300, "balanced": True}],
                     False, 2)
    r = run_family(WebcamReferenceFeatures(), spec, X_tr, y_tr, X_te, y_te,
                   group_cv_splits(X_tr, y_tr, ds.groups[idx_tr]))
    leak = leakage_checks(X_tr, X_te, ds.groups[idx_tr], ds.groups[idx_te])
    # Enquete : une simple regle sur les sorties des detecteurs, sans apprentissage, suffit-elle ?
    rule_te = detector_rule(X_te)
    rule_all = detector_rule(full)
    print(f"[webcam reference] CV {r['cv_ap_mean']:.4f} test {r['test']['pr_auc']:.4f} "
          f"| regle F1 test {classification_metrics(y_te, rule_te, 0.5)['f1']:.4f}", flush=True)
    return {"cv_ap_mean": r["cv_ap_mean"], "cv_ap_std": r["cv_ap_std"], "test": r["test"],
            "leakage": leak, "flags": high_score_flags("référence", r["test"]),
            "rule_baseline_test": classification_metrics(y_te, rule_te, 0.5),
            "rule_baseline_all": classification_metrics(ds.y, rule_all, 0.5),
            "_p_te": r["_p_te"], "_y_te": y_te}


def detector_rule(full: pd.DataFrame) -> np.ndarray:
    """Alerte si au moins une sortie de detecteur est anormale (aucun apprentissage)."""
    gaze = full["gaze_direction"].fillna("none").astype(str)
    head = full["head_pose"].fillna("none").astype(str)
    return ((head != "forward") | (~gaze.isin(["center", "none"])) | (full["phone_present"] == 1)
            | (full["hand_obj_interaction"] == 1) | (full["no_of_face"] != 1)).astype(float).to_numpy()


# ---------------------------------------------------------------------------
# Rapport de branche
# ---------------------------------------------------------------------------
def comparison_table(res: dict) -> pd.DataFrame:
    rows = []
    for f in res["families"].values():
        t = f["test"]
        rows.append({
            "modèle": f["label"] + (" ✔" if f["name"] == res["selected"] else ""),
            "PR-AUC CV (moy ± é.-t.)": f"{f['cv_ap_mean']:.3f} ± {f['cv_ap_std']:.3f}",
            "PR-AUC test": t["pr_auc"], "ROC-AUC test": t["roc_auc"],
            "F1 test": t["f1"], "précision": t["precision"], "rappel": t["recall"],
            "rappel@P≥0,8": t["recall_at_p80"], "rappel@P≥0,9": t["recall_at_p90"],
            "Brier": t["brier"], "calibration": f["calibration"], "seuil": f["threshold"],
        })
    return pd.DataFrame(rows)


def write_branch_report(res: dict, path: Path) -> None:
    sel = res["families"][res["selected"]]
    t = sel["test"]
    ci = res.get("test_ci", {})
    ci_txt = (f"IC 95 % bootstrap : PR-AUC [{ci['pr_auc'][0]:.3f} ; {ci['pr_auc'][1]:.3f}], "
              f"F1 [{ci['f1'][0]:.3f} ; {ci['f1'][1]:.3f}]") if ci else ""
    md = f"""# {res['title']}

Apprentissage : {res['n_train']} lignes ({res['pos_train']} positifs) — test : {res['n_test']} lignes
({res['pos_test']} positifs). Groupes : {res['group_kind']}. Validation croisée : {res['n_cv_folds']} plis.
Contrôle de fuite train/test : {res['leakage']}.

## Comparaison des modèles (seuil choisi sur les prédictions hors-échantillon de l'apprentissage)

{md_table(comparison_table(res))}

**Modèle retenu : {sel['label']}** — paramètres {sel['best_params']}, calibration {sel['calibration']},
seuil {sel['threshold']:.3f}. Règle de sélection : {res['selection_rule']}

Test : PR-AUC {t['pr_auc']:.3f}, F1 {t['f1']:.3f}, précision {t['precision']:.3f}, rappel {t['recall']:.3f},
taux de faux positifs {t['fpr']:.3f}. {ci_txt}

Matrice de confusion (test) : VN={t['tn']}, FP={t['fp']}, FN={t['fn']}, VP={t['tp']}.

Alertes de score > 0,99 : {res['high_score_flags'] or 'aucune'}.

![PR]({'figures/' + res['branch'] + '_pr_test.png'})
![Confusion]({'figures/' + res['branch'] + '_confusion_test.png'})
![Calibration]({'figures/' + res['branch'] + '_calibration_test.png'})
"""
    path.write_text(md, encoding="utf-8")


def train_full(branch: str, fast: bool = False) -> dict:
    """Entrainement complet d'une branche + experiences complementaires + rapport de branche."""
    cfg = browser_config(fast) if branch == "browser" else webcam_config(fast)
    res = run_branch(cfg)
    if branch == "browser" and not fast:
        res["ablations"] = browser_ablations(res["selected"])
    if branch == "webcam" and not fast:
        sel = res["families"][res["selected"]]
        res["leakage_experiments"] = webcam_leakage_experiments(res["selected"], sel["best_params"])
        ref = webcam_reference(res["_split"])
        res["reference"] = {k: v for k, v in ref.items() if not k.startswith("_")}
        plots.pr_curves({res["families"][res["selected"]]["label"] + " (variables reproductibles)":
                         (ref["_y_te"], res["_families"][res["selected"]]["_p_te"]),
                         "XGBoost toutes variables (référence non déployable)": (ref["_y_te"], ref["_p_te"])},
                        float(ref["_y_te"].mean()), "Branche A — coût de la parité (test)",
                        config.FIGURES / "webcam_parity_cost.png")
    write_json({k: v for k, v in res.items() if not k.startswith("_")},
               config.REPORTS / f"results_{branch}.json")
    write_branch_report(res, config.REPORTS / f"branch_{branch}.md")
    print(f"[{branch}] termine en {res['seconds']:.0f}s, retenu : {res['selected']}", flush=True)
    return res


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("branch", choices=["browser", "webcam"])
    p.add_argument("--fast", action="store_true")
    a = p.parse_args(argv)
    train_full(a.branch, a.fast)
    return 0


if __name__ == "__main__":
    sys.exit(main())
