"""Dessine docs/architecture.png (schema de la documentation technique, version image du diagramme Mermaid).

    python scripts/make_architecture_png.py
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "docs" / "architecture.png"
C = {"nav": "#e8f1f8", "navb": "#2a6f97", "model": "#fdf0e6", "modelb": "#c4692a", "fus": "#eaf5e8",
     "fusb": "#3d8b37", "alert": "#fbe9e7", "alertb": "#c44536", "xai": "#f3eefa", "xaib": "#7b5ea7"}

fig, ax = plt.subplots(figsize=(12, 5.2), dpi=200)
ax.set_xlim(0, 120)
ax.set_ylim(0, 52)
ax.axis("off")


def box(x, y, w, h, text, fill, edge, size=9, bold=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.2",
                                fc=fill, ec=edge, lw=1.4))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=size,
            fontweight="bold" if bold else "normal", color="#1d2330", linespacing=1.3)


def arrow(x1, y1, x2, y2, color="#555555", style="-|>", ls="-", label=None, lx=0, ly=0):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=12,
                                 color=color, lw=1.3, linestyle=ls))
    if label:
        ax.text((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, label, ha="center", va="center", fontsize=7.5,
                color="#444444", style="italic")


# cadre navigateur
ax.add_patch(FancyBboxPatch((1, 4.5), 36, 45.5, boxstyle="round,pad=0.3,rounding_size=1.5",
                            fc="#f7f9fb", ec="#9fb3c8", lw=1, ls="--"))
ax.text(19, 48, "Navigateur (Next.js)", ha="center", fontsize=9.5, fontweight="bold", color="#2a6f97")

box(3, 38, 13.5, 7, "Webcam", C["nav"], C["navb"])
box(20.5, 38, 15, 7, "MediaPipe Tasks JS\nvisage, iris,\nmains, téléphone", C["nav"], C["navb"], 8)
box(20.5, 28, 15, 7, "26 indicateurs\npar image", C["nav"], C["navb"], 8.5)
box(3, 7.5, 13.5, 9, "Réponses +\nchronométrage\npar question", C["nav"], C["navb"], 8)
box(20.5, 7.5, 15, 9, "7 indicateurs\npar session\n(règle des 180 s)", C["nav"], C["navb"], 8)
arrow(16.9, 41.5, 20.1, 41.5)
arrow(28, 37.6, 28, 35.4)
arrow(16.9, 12, 20.1, 12)

# modeles + explications entre les deux branches
box(48, 27, 17, 9, "Branche A\nRandom Forest\ncalibré (Platt)", C["model"], C["modelb"], 8.5, True)
box(48, 19.3, 17, 5, "SHAP : explain()\nk raisons lisibles", C["xai"], C["xaib"], 8)
box(48, 7.5, 17, 9, "Branche B\nXGBoost\ncalibré (Platt)", C["model"], C["modelb"], 8.5, True)
arrow(35.9, 31.5, 47.6, 31.5)
ax.text(42.2, 36.2, "indicateurs\nseulement,\njamais la vidéo", ha="center", va="center", fontsize=7.2,
        color="#444444", style="italic", linespacing=1.15)
arrow(35.9, 12, 47.6, 12)
arrow(56.5, 26.6, 56.5, 24.7, color=C["xaib"], ls="--")
arrow(56.5, 16.9, 56.5, 18.9, color=C["xaib"], ls="--")

box(71, 27, 15, 9, "probabilité A\nramenée à 5 %", C["model"], C["modelb"], 8)
box(71, 7.5, 15, 9, "probabilité B\nramenée à 5 %", C["model"], C["modelb"], 8)
arrow(65.4, 31.5, 70.6, 31.5)
arrow(65.4, 12, 70.6, 12)

box(91, 16.5, 13, 10, "Fusion\nw·A + (1 − w)·B\nw = 0,60", C["fus"], C["fusb"], 8.5, True)
arrow(86.4, 30.5, 90.6, 25)
arrow(86.4, 13, 90.6, 18)
box(108, 16.5, 11, 10, "Alerte\nà vérifier par\nl'enseignant", C["alert"], C["alertb"], 8, True)
arrow(104.4, 21.5, 107.6, 21.5)

ax.text(78, 45, "Les deux branches sont entraînées séparément (aucun jeu public commun).\n"
        "La fusion est pondérée sur des paires simulées, à recalibrer sur le pilote.",
        ha="center", va="center", fontsize=8, color="#555555", linespacing=1.4)
fig.tight_layout()
OUT.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(OUT, facecolor="white")
print(OUT)
