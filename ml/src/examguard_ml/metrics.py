"""Metriques adaptees aux classes desequilibrees (pas d'accuracy comme metrique principale)."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import (average_precision_score, brier_score_loss, confusion_matrix,
                             f1_score, log_loss, precision_recall_curve, precision_score,
                             recall_score, roc_auc_score)


def recall_at_precision(y, p, target: float) -> float:
    """Rappel maximal atteignable avec une precision >= target (0 si jamais atteinte)."""
    prec, rec, _ = precision_recall_curve(y, p)
    ok = prec[:-1] >= target  # le dernier point (P=1, R=0) n'a pas de seuil associe
    return float(rec[:-1][ok].max()) if ok.any() else 0.0


def best_f1_threshold(y, p) -> float:
    """Seuil maximisant le F1 (a calculer sur des predictions hors-echantillon, jamais sur le test)."""
    prec, rec, thr = precision_recall_curve(y, p)
    prec, rec = prec[:-1], rec[:-1]
    f1 = np.where(prec + rec > 0, 2 * prec * rec / np.maximum(prec + rec, 1e-12), 0.0)
    i = int(np.nanargmax(f1))
    return float(thr[i])


def classification_metrics(y, p, threshold: float) -> dict:
    y = np.asarray(y).astype(int)
    p = np.clip(np.asarray(p, dtype=float), 1e-7, 1 - 1e-7)
    yhat = (p >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, yhat, labels=[0, 1]).ravel()
    return {
        "n": int(len(y)), "n_pos": int(y.sum()), "prevalence": float(y.mean()),
        "pr_auc": float(average_precision_score(y, p)),
        "roc_auc": float(roc_auc_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "log_loss": float(log_loss(y, p, labels=[0, 1])),
        "threshold": float(threshold),
        "precision": float(precision_score(y, yhat, zero_division=0)),
        "recall": float(recall_score(y, yhat, zero_division=0)),
        "f1": float(f1_score(y, yhat, zero_division=0)),
        "fpr": float(fp / max(fp + tn, 1)),
        "recall_at_p80": recall_at_precision(y, p, 0.80),
        "recall_at_p90": recall_at_precision(y, p, 0.90),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
    }


def bootstrap_ci(y, p, threshold: float, n_boot: int = 1000, seed: int = 42,
                 alpha: float = 0.05) -> dict:
    """IC a 95 % par bootstrap stratifie (re-echantillonnage separe des positifs et des negatifs)."""
    y = np.asarray(y).astype(int)
    p = np.asarray(p, dtype=float)
    rng = np.random.default_rng(seed)
    pos, neg = np.flatnonzero(y == 1), np.flatnonzero(y == 0)
    stats = {"pr_auc": [], "f1": [], "recall": [], "precision": []}
    for _ in range(n_boot):
        idx = np.concatenate([rng.choice(pos, len(pos)), rng.choice(neg, len(neg))])
        yy, pp = y[idx], p[idx]
        yhat = (pp >= threshold).astype(int)
        stats["pr_auc"].append(average_precision_score(yy, pp))
        stats["f1"].append(f1_score(yy, yhat, zero_division=0))
        stats["recall"].append(recall_score(yy, yhat, zero_division=0))
        stats["precision"].append(precision_score(yy, yhat, zero_division=0))
    lo, hi = 100 * alpha / 2, 100 * (1 - alpha / 2)
    return {k: [float(np.percentile(v, lo)), float(np.percentile(v, hi))] for k, v in stats.items()}
