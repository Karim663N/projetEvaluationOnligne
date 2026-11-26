"""Modeles, validation croisee, calibration et selection (communs aux deux branches)."""
from __future__ import annotations

import os
import warnings
from dataclasses import dataclass
from typing import Callable

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.base import BaseEstimator, ClassifierMixin, clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss
from sklearn.model_selection import StratifiedKFold
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

from .config import SEED

N_JOBS = max(1, min(6, (os.cpu_count() or 2) - 1))


# ---------------------------------------------------------------------------
# Estimateurs avec gestion du desequilibre
# ---------------------------------------------------------------------------
class BalancedXGB(ClassifierMixin, BaseEstimator):
    """XGBoost ; si balanced=True, scale_pos_weight = n_neg / n_pos calcule sur les donnees d'apprentissage."""

    def __init__(self, max_depth=3, n_estimators=300, learning_rate=0.05, subsample=0.8,
                 colsample_bytree=0.8, min_child_weight=1.0, reg_lambda=1.0, balanced=True,
                 random_state=SEED):
        self.max_depth = max_depth
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.subsample = subsample
        self.colsample_bytree = colsample_bytree
        self.min_child_weight = min_child_weight
        self.reg_lambda = reg_lambda
        self.balanced = balanced
        self.random_state = random_state

    def fit(self, X, y):
        y = np.asarray(y).astype(int)
        spw = float((y == 0).sum() / max((y == 1).sum(), 1)) if self.balanced else 1.0
        self.model_ = XGBClassifier(
            max_depth=self.max_depth, n_estimators=self.n_estimators,
            learning_rate=self.learning_rate, subsample=self.subsample,
            colsample_bytree=self.colsample_bytree, min_child_weight=self.min_child_weight,
            reg_lambda=self.reg_lambda, scale_pos_weight=spw, tree_method="hist",
            n_jobs=1, random_state=self.random_state, eval_metric="logloss")
        self.model_.fit(np.asarray(X, dtype=float), y)
        self.classes_ = self.model_.classes_
        return self

    def predict_proba(self, X):
        return self.model_.predict_proba(np.asarray(X, dtype=float))

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


class BalancedMLP(ClassifierMixin, BaseEstimator):
    """Perceptron multicouche (reseau de neurones dense) ; poids d'echantillons equilibres si balanced=True."""

    def __init__(self, hidden_layer_sizes=(64, 32), alpha=1e-3, balanced=True, max_iter=400,
                 learning_rate_init=1e-3, random_state=SEED):
        self.hidden_layer_sizes = hidden_layer_sizes
        self.alpha = alpha
        self.balanced = balanced
        self.max_iter = max_iter
        self.learning_rate_init = learning_rate_init
        self.random_state = random_state

    def fit(self, X, y):
        y = np.asarray(y).astype(int)
        sw = compute_sample_weight("balanced", y) if self.balanced else None
        self.model_ = MLPClassifier(
            hidden_layer_sizes=self.hidden_layer_sizes, alpha=self.alpha, activation="relu",
            solver="adam", learning_rate_init=self.learning_rate_init, max_iter=self.max_iter,
            random_state=self.random_state)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ConvergenceWarning)
            self.model_.fit(np.asarray(X, dtype=float), y, sample_weight=sw)
        self.classes_ = self.model_.classes_
        return self

    def predict_proba(self, X):
        return self.model_.predict_proba(np.asarray(X, dtype=float))

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


@dataclass
class ModelSpec:
    name: str
    label: str
    build: Callable[..., BaseEstimator]
    grid: list
    scale: bool
    complexity: int  # departage en cas d'egalite : le plus simple gagne


def _grid(**kw) -> list[dict]:
    keys = list(kw)
    out = [{}]
    for k in keys:
        out = [dict(o, **{k: v}) for o in out for v in kw[k]]
    return out


def default_specs(branch: str, fast: bool = False) -> list[ModelSpec]:
    """Grilles volontairement petites (16 Go de RAM, CPU, < 10 min au total)."""
    if fast:
        return [
            ModelSpec("logreg", "Régression logistique",
                      lambda **p: LogisticRegression(max_iter=5000, **p),
                      _grid(C=[1.0], class_weight=["balanced"]), True, 0),
            ModelSpec("xgboost", "XGBoost", lambda **p: BalancedXGB(**p),
                      _grid(max_depth=[3], n_estimators=[100], balanced=[True]), False, 2),
        ]
    depths = [2, 4] if branch == "browser" else [4, 6]
    return [
        ModelSpec("logreg", "Régression logistique",
                  lambda **p: LogisticRegression(max_iter=5000, **p),
                  _grid(C=[0.01, 0.1, 1.0, 10.0], class_weight=[None, "balanced"]), True, 0),
        ModelSpec("random_forest", "Random Forest",
                  lambda **p: RandomForestClassifier(n_estimators=300, n_jobs=1, random_state=SEED, **p),
                  _grid(max_depth=[None, 8], min_samples_leaf=[1, 5],
                        class_weight=[None, "balanced_subsample"]), False, 1),
        ModelSpec("xgboost", "XGBoost", lambda **p: BalancedXGB(**p),
                  _grid(max_depth=depths, n_estimators=[200, 500], balanced=[False, True]), False, 2),
        ModelSpec("mlp", "MLP (réseau de neurones)", lambda **p: BalancedMLP(**p),
                  _grid(hidden_layer_sizes=[(32,), (64, 32)], alpha=[1e-4, 1e-2, 1.0]), True, 3),
    ]


def make_pipeline(features: BaseEstimator, spec: ModelSpec, params: dict) -> Pipeline:
    scaler = StandardScaler().set_output(transform="pandas") if spec.scale else "passthrough"
    return Pipeline([("features", clone(features)), ("scaler", scaler), ("clf", spec.build(**params))])


# ---------------------------------------------------------------------------
# Validation croisee
# ---------------------------------------------------------------------------
def _fit_predict(pipe, X, y, tr, va):
    m = clone(pipe)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ConvergenceWarning)
        warnings.simplefilter("ignore", UserWarning)
        m.fit(X.iloc[tr], y[tr])
    return m.predict_proba(X.iloc[va])[:, 1]


def cv_predict(pipes: list[Pipeline], X: pd.DataFrame, y: np.ndarray, splits: list,
               n_jobs: int = N_JOBS) -> list[dict]:
    """Pour chaque pipeline : PR-AUC par pli + predictions hors-echantillon (OOF) de la 1re repetition."""
    tasks = [(i, s) for i in range(len(pipes)) for s in range(len(splits))]
    preds = Parallel(n_jobs=n_jobs)(
        delayed(_fit_predict)(pipes[i], X, y, splits[s][1], splits[s][2]) for i, s in tasks)
    out = [{"fold_ap": [], "oof": np.full(len(y), np.nan)} for _ in pipes]
    for (i, s), p in zip(tasks, preds):
        rep, _, va = splits[s]
        out[i]["fold_ap"].append(float(average_precision_score(y[va], p)))
        if rep == 0:
            out[i]["oof"][va] = p
    for o in out:
        o["ap_mean"] = float(np.mean(o["fold_ap"]))
        o["ap_std"] = float(np.std(o["fold_ap"]))
        o["oof_ap"] = float(average_precision_score(y, o["oof"]))
    return out


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------
def _logit(s):
    s = np.clip(np.asarray(s, dtype=float), 1e-6, 1 - 1e-6)
    return np.log(s / (1 - s))


class PlattCalibrator:
    method = "platt"

    def fit(self, s, y):
        self.lr_ = LogisticRegression(C=1e4, max_iter=1000).fit(_logit(s)[:, None], np.asarray(y))
        return self

    def transform(self, s):
        return self.lr_.predict_proba(_logit(s)[:, None])[:, 1]


class IsotonicCalibrator:
    method = "isotonic"

    def fit(self, s, y):
        self.iso_ = IsotonicRegression(out_of_bounds="clip", y_min=1e-4, y_max=1 - 1e-4)
        self.iso_.fit(np.asarray(s, dtype=float), np.asarray(y))
        return self

    def transform(self, s):
        return self.iso_.predict(np.asarray(s, dtype=float))


CALIBRATORS = {"platt": PlattCalibrator, "isotonic": IsotonicCalibrator}


def choose_calibration(oof: np.ndarray, y: np.ndarray, seed: int = SEED) -> dict:
    """Compare Platt et isotonique par validation croisee sur les scores hors-echantillon (Brier)."""
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)
    res = {"none": {"brier": float(brier_score_loss(y, np.clip(oof, 0, 1))), "p": oof.copy()}}
    for name, cls in CALIBRATORS.items():
        p = np.zeros(len(y))
        for tr, va in skf.split(oof.reshape(-1, 1), y):
            p[va] = cls().fit(oof[tr], y[tr]).transform(oof[va])
        res[name] = {"brier": float(brier_score_loss(y, p)), "p": p}
    best = min(CALIBRATORS, key=lambda k: res[k]["brier"])
    return {"method": best, "p_oof": res[best]["p"],
            "brier": {k: v["brier"] for k, v in res.items()}}


class CalibratedPipeline(ClassifierMixin, BaseEstimator):
    """Pipeline (variables -> modele) + calibrateur ajuste sur les scores hors-echantillon."""

    def __init__(self, base=None, calibrator=None):
        self.base = base
        self.calibrator = calibrator

    @property
    def classes_(self):
        return np.array([0, 1])

    def raw_score(self, X):
        return self.base.predict_proba(X)[:, 1]

    def predict_proba(self, X):
        p = self.calibrator.transform(self.raw_score(X))
        return np.column_stack([1 - p, p])

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


def _row_keys(X: pd.DataFrame) -> list[tuple]:
    Xn = X.copy()
    num = Xn.select_dtypes("number").columns
    Xn[num] = Xn[num].round(9)
    return list(map(tuple, Xn.astype(str).to_numpy().tolist()))


def leakage_checks(X_tr: pd.DataFrame, X_te: pd.DataFrame, g_tr, g_te) -> dict:
    key_tr = set(_row_keys(X_tr))
    same = sum(k in key_tr for k in _row_keys(X_te))
    return {"groupes_communs_train_test": int(len(set(g_tr) & set(g_te))),
            "lignes_test_identiques_a_une_ligne_train": int(same)}
