"""Figures du rapport (matplotlib, sans affichage)."""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sklearn.calibration import calibration_curve  # noqa: E402
from sklearn.metrics import average_precision_score, precision_recall_curve  # noqa: E402

COLORS = ["#2a6f97", "#c44536", "#3d8b37", "#8e5ea2", "#e09f3e", "#555555"]


def pr_curves(curves: dict, prevalence: float, title: str, path) -> None:
    fig, ax = plt.subplots(figsize=(6.4, 4.8), dpi=120)
    for i, (name, (y, p)) in enumerate(curves.items()):
        prec, rec, _ = precision_recall_curve(y, p)
        ap = average_precision_score(y, p)
        ax.step(rec, prec, where="post", color=COLORS[i % len(COLORS)], lw=1.8,
                label=f"{name} (PR-AUC = {ap:.3f})")
    ax.axhline(prevalence, color="grey", ls="--", lw=1, label=f"hasard (prévalence = {prevalence:.3f})")
    ax.set_xlabel("Rappel")
    ax.set_ylabel("Précision")
    ax.set_xlim(0, 1.01)
    ax.set_ylim(0, 1.03)
    ax.set_title(title, fontsize=11)
    ax.legend(loc="lower left", fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def confusion(m: dict, title: str, path, labels=("Normal", "Suspect")) -> None:
    cm = np.array([[m["tn"], m["fp"]], [m["fn"], m["tp"]]])
    fig, ax = plt.subplots(figsize=(4.2, 3.8), dpi=120)
    ax.imshow(cm, cmap="Blues")
    for i in range(2):
        for j in range(2):
            ax.text(j, i, str(cm[i, j]), ha="center", va="center", fontsize=14,
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
    ax.set_xticks([0, 1], [f"prédit {labels[0]}", f"prédit {labels[1]}"])
    ax.set_yticks([0, 1], [f"réel {labels[0]}", f"réel {labels[1]}"])
    ax.set_title(f"{title}\nseuil = {m['threshold']:.3f}", fontsize=10)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def reliability(y, p, title: str, path, n_bins: int = 10) -> None:
    frac, mean = calibration_curve(y, p, n_bins=n_bins, strategy="quantile")
    fig, ax = plt.subplots(figsize=(4.8, 4.4), dpi=120)
    ax.plot([0, 1], [0, 1], ls="--", color="grey", lw=1, label="calibration parfaite")
    ax.plot(mean, frac, marker="o", color=COLORS[0], label="modèle")
    ax.set_xlabel("Probabilité prédite")
    ax.set_ylabel("Fréquence observée")
    ax.set_title(title, fontsize=10)
    ax.legend(fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
