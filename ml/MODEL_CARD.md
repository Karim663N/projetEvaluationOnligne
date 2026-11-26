# Fiche modèle — ExamGuard AI (module ML)

## Modèles

| | Branche B — session d'examen | Branche A — webcam (une image) |
|---|---|---|
| Fichier | `artifacts/browser_model.joblib` | `artifacts/webcam_model.joblib` |
| Algorithme | XGBoost {'max_depth': 2, 'n_estimators': 200, 'balanced': False} | Random Forest {'max_depth': None, 'min_samples_leaf': 1, 'class_weight': None} |
| Calibration | platt (sur prédictions hors-échantillon) | platt |
| Seuil d'alerte de branche | 0.597 | 0.488 |
| Prévalence d'apprentissage | 0.048 | 0.470 |
| Entrées | 7 indicateurs de session (`BrowserSessionFeatures`) | 26 indicateurs MediaPipe (`WebcamFrameFeatures`) |
| Entraîné le | 2026-11-19T09:18:50+00:00 | 2026-11-19T09:22:20+00:00 |

Fusion : `artifacts/fusion_config.json` — moyenne pondérée des probabilités ramenées à une prévalence de
5%, w_webcam = 0.6 (**choisi sur paires simulées**).
Versions : {'python': '3.11.18', 'numpy': '2.4.6', 'pandas': '3.0.6', 'scipy': '1.17.1', 'scikit-learn': '1.9.1', 'xgboost': '3.2.0', 'shap': '0.51.0', 'joblib': '1.6.0', 'matplotlib': '3.11.2'}.

## Usage prévu
Aide à la surveillance d'examens en ligne : signaler à un enseignant des sessions **à vérifier**, avec une
explication. L'enseignant décide ; l'étudiant peut contester (cahier des charges, EF9 et EF16).

## Usages interdits
- Sanction automatique, ou toute décision sans validation humaine.
- Présenter un score comme une preuve de triche.
- Identifier, profiler ou classer des étudiants en dehors d'un examen pour lequel ils ont donné leur consentement.
- Utiliser la branche A sur une image isolée pour déclencher une alerte (agréger sur une fenêtre de temps).
- Utiliser le modèle sur une population, une caméra ou un type d'examen très différents sans ré-évaluation.
- Utiliser le module de frappe (CMU) pour autre chose que la vérification d'identité consentie.

## Données
- B : `online_exam_data.csv` (1 600 sessions, 77 triches ; source et licence non documentées, probablement
  synthétique ; **aucune télémétrie navigateur**).
- A : Hossen & Uddin (2025), Mendeley Data, DOI 10.17632/39xs8th543.1, CC BY 4.0 — 5 500 images en laboratoire
  (76 doublons retirés), aucun identifiant de participant ; 11 colonnes exclues pour la parité navigateur.

## Métriques (jeu de test, une seule évaluation)
| | PR-AUC | F1 | précision | rappel | rappel@P≥0,8 | taux de FP | Brier |
|---|---|---|---|---|---|---|---|
| B | 0.821 | 0.722 | 0.765 | 0.684 | 0.526 | 0.010 | 0.018 |
| A | 0.934 | 0.847 | 0.869 | 0.826 | 0.901 | 0.108 | 0.103 |

B : 19 positifs en test seulement (IC 95 % PR-AUC [0.685 ; 0.953]).
A : découpage par blocs contigus (pas d'identifiant) — estimation probablement optimiste.
Latence médiane : B 11.1 ms, A 53.5 ms par prédiction (CPU).

## Limites et biais
- B associe bonne note et suspicion (les 77 tricheurs ont tous réussi) : risque de faux positifs sur les bons étudiants.
- B dépend de variables « temps idéal » : convention retenue par l'équipe = 180 s cumulées par question
  (`build_browser_features`) ; la définition d'origine du jeu n'est pas documentée.
- A : étiquette en grande partie dérivée des sorties des détecteurs (circularité) ; données de laboratoire ;
  pas de mesure possible par sous-groupe (éclairage, handicap, qualité de caméra) ; position du visage utilisée.
- Fusion validée uniquement sur paires simulées.
- Aucun modèle des événements navigateur (onglets, copier-coller) : pas de données étiquetées.

## Réentraîner
```bash
conda env create -f environment.yml && conda activate examguard-ml
python -m examguard_ml.pipeline
pytest
```
Rapport complet : `reports/RAPPORT_ML.md`.
