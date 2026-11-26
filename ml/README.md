# ExamGuard AI — module ML

Module d'apprentissage automatique d'ExamGuard AI, **indépendant de l'application** (Next.js / FastAPI).
Il audite les données, entraîne, évalue, calibre et explique les modèles, puis expose un contrat
d'interface Python (`inference.py`) que l'API pourra appeler. Rapport complet : [reports/RAPPORT_ML.md](reports/RAPPORT_ML.md)
(en Word : [reports/RAPPORT_ML.docx](reports/RAPPORT_ML.docx)) — fiche modèle : [MODEL_CARD.md](MODEL_CARD.md) —
documentation technique (étapes, code, modèles, sources, variables) :
[docs/DOCUMENTATION_TECHNIQUE.md](docs/DOCUMENTATION_TECHNIQUE.md), aussi en Word :
[docs/DOCUMENTATION_TECHNIQUE.docx](docs/DOCUMENTATION_TECHNIQUE.docx).

Régénérer les versions Word après une modification du Markdown ou un nouveau `pipeline` (Node 18+ ; à l'ouverture,
accepter la mise à jour des champs pour remplir le sommaire) :

```bash
npm install docx@9.5.1
python scripts/make_architecture_png.py
node scripts/md_to_docx.js all          # ou : documentation | rapport
```

## Installation (CPU, aucune GPU requise)

```bash
conda env create -f environment.yml
conda activate examguard-ml
```

Sans conda : Python 3.11 puis `pip install -r requirements.txt` dans un venv.
Sous Windows, placez le venv dans un chemin court (limite de 260 caractères des chemins).

## Données (jamais versionnées)

| Fichier attendu | Source | Obtention |
|---|---|---|
| `data/raw/online_exam_data.csv` | fourni par l'équipe (source et licence non documentées) | copie manuelle |
| `data/raw/mendeley/students_suspicious_behaviors_v1.csv` | Hossen & Uddin, Mendeley Data, DOI 10.17632/39xs8th543.1, CC BY 4.0 | `python -m examguard_ml.data --download` |
| `data/raw/DSL-StrongPasswordData.csv` (optionnel) | CMU Keystroke Benchmark (Killourhy & Maxion 2009) | copie manuelle |

`python -m examguard_ml.data --check` vérifie la présence et l'empreinte SHA-256 de chaque fichier.

## Tout réentraîner (commande unique)

Depuis le dossier `ml/`, avec `src` dans le chemin Python (`pip install -e .` ou `set PYTHONPATH=src`) :

```bash
python -m examguard_ml.pipeline
```

Audit → branche B → branche A → états de fraude → règle du temps idéal (simulation) → CMU → fusion (simulée) →
SHAP → rapport. Environ 6 à 7 minutes sur un PC
8 cœurs / 16 Go sans autre charge (806 s mesurées lors d'une exécution concurrente avec une installation pip).
Aucune étape ne dépasse ~4 minutes ; aucune GPU n'est utilisée.
Les modèles sont écrits dans `artifacts/`, les rapports et figures dans `reports/`.

## Tests

```bash
pytest
pytest --junitxml=reports/pytest_junit.xml && python -m examguard_ml.report   # inclut le résultat dans le rapport
```

## Service HTTP pour l'application (FastAPI)

```bash
python -m uvicorn service:app --host 127.0.0.1 --port 8000     # documentation : http://127.0.0.1:8000/docs
```

`POST /score-session` reçoit une session terminée (nombre de questions, temps cumulé et justesse de chaque réponse,
indicateurs webcam facultatifs) et renvoie le score navigateur, le score webcam agrégé (moyenne, part d'images au-dessus
du seuil, chronologie, explication de l'image la plus suspecte), la fusion et les explications SHAP. Routes unitaires :
`/predict/browser`, `/predict/webcam`, `/fuse`, `/explain/{branch}`, `/health`. L'application Next.js
(`projetEvaluationOnligne`, branche `integration-ml`) l'appelle à chaque remise de copie.

Champ facultatif `ideal_seconds` (5 à 3600) : temps idéal par question utilisé par la branche B (défaut 180 s,
convention de l'équipe). La réponse contient aussi `navigateur.etats` (« réponses éclair » : justes en moins de 10 s)
et `webcam.etats` / `webcam.chronologie_etats` (états de fraude, voir ci-dessous).

## États de fraude lisibles (`src/examguard_ml/states.py`)

Six états, en complément du score ML : téléphone détecté, plusieurs visages, visage absent, tête tournée,
tête baissée, regard détourné. Les seuils sont calibrés **uniquement sur les images normales d'entraînement**
(quantiles 0,5 % / 99,5 % pour les règles à deux côtés, 99 % sinon) puis vérifiés sur le jeu de test ; chaque état
reçoit une fiabilité (forte ≥ 0,9, moyenne ≥ 0,7, faible sinon). Seuils : `artifacts/fraud_states.json` ;
vérification : `reports/fraud_states.md`. Sur les images normales de test, téléphone, plusieurs visages, visage
absent et tête baissée ne se déclenchent jamais (0 %) ; tête tournée 0,5 % ; regard détourné 2,6 % (fiabilité faible).
Les états se cumulent réellement dans les données (54 % des images « visage absent » contiennent aussi un téléphone).

## Temps idéal : fixe ou adaptatif (`src/examguard_ml/ideal_time.py`)

Simulation de cohortes (`reports/ideal_time.md`) : avec 180 s fixes, un rythme honnête de 75 s par question donne
63 % de fausses alertes ; avec un temps idéal adaptatif (médiane des temps de réponse de l'examen) 9 %, la triche
restant détectée à 100 % dans les deux cas. L'application utilise donc le mode **adaptatif par défaut**
(`EXAMGUARD_IDEAL_TIME_MODE=fixed` pour revenir à 180 s) et envoie la valeur dans `ideal_seconds`.

## Page de test locale (avec webcam)

```bash
python scripts/demo_server.py      # puis ouvrir http://localhost:8765 dans Chrome ou Edge
```

Exemples tirés des jeux de test, saisie manuelle, règle des 180 s, fusion avec curseur de poids, et un panneau
**webcam en direct** : MediaPipe Tasks Vision 0.10.14 tourne dans le navigateur (visage, iris, mains, téléphone),
seuls les 26 indicateurs sont envoyés au serveur local (127.0.0.1), jamais l'image. Probabilité par image +
agrégation sur une fenêtre de 10 s envoyée à la fusion. Inconnue documentée : on ne sait pas si les images du jeu
Mendeley étaient en miroir (case « analyser en miroir »).

## Contrat d'interface (`inference.py`)

```python
from inference import (build_browser_features, predict_browser, predict_webcam,
                       predict_webcam_session, fuse, explain)

# Branche B : une entree par question REPONDUE, temps cumule (toutes visites) en secondes.
# "Temps ideal" : 180 s par question par defaut (IDEAL_SECONDS_PER_QUESTION) ; l'application passe
# ideal_seconds=... (mode adaptatif : mediane des temps de reponse de l'examen).
session = build_browser_features("remote", tot_question=20, session_seconds=900,
                                 answers=[{"seconds": 45, "correct": True}, {"seconds": 240, "correct": False}])
pb = predict_browser(session)
pa = predict_webcam_session(frames)          # liste de dicts WebcamFrameFeatures (MediaPipe, repère 640×480)
f = fuse(pa["probabilite_deploiement"], pb["probabilite_deploiement"])   # poids par défaut : artifacts/fusion_config.json
e = explain("browser", {...}, k=5)            # k contributions SHAP lisibles (JSON)
```

Les entrées sont validées par pydantic (`src/examguard_ml/schemas.py`) : valeur manquante, NaN, hors plage ou
incohérente → `pydantic.ValidationError` (à traduire en HTTP 422). Les valeurs valides mais jamais vues à
l'entraînement sont signalées dans `hors_domaine`.

## Structure

```
ml/
  environment.yml, requirements.txt, pyproject.toml
  inference.py               contrat d'interface (predict_browser, predict_webcam, fuse, explain)
  MODEL_CARD.md              fiche modèle (données, métriques, limites, biais, usages interdits)
  data/raw, data/processed   données (ignorées par Git)
  notebooks/                 exploration (relit les résultats)
  src/examguard_ml/
    config.py data.py features.py      chemins, chargement, variables (identiques entraînement/inférence)
    audit.py                            Phase 1 : audit et parité
    modeling.py metrics.py train.py     Phases 2-3 : modèles, validation croisée, calibration, sélection
    keystroke.py                        Phase 4 : CMU
    fusion.py                           Phase 5 : fusion (simulation)
    explain.py                          Phase 6 : SHAP
    states.py ideal_time.py             états de fraude lisibles, simulation du temps idéal
    schemas.py                          schémas pydantic
    report.py pipeline.py               rapport final, commande unique
  tests/                     pytest (schéma, fuite, déterminisme, taille/latence, stabilité, contrat)
  artifacts/                 modèles (*.joblib) + métadonnées (*.json) + configuration de fusion
  reports/                   audits, rapport final, figures
```

## Citer les données

- Hossen, M. K., & Uddin, M. S. (2025). *Students suspicious behaviors detection dataset for AI-powered online exam
  proctoring* (v1) [Data set]. Mendeley Data. https://doi.org/10.17632/39xs8th543.1 — CC BY 4.0. Les variables
  dérivées et l'exclusion de colonnes constituent des modifications.
- Killourhy, K. S., & Maxion, R. A. (2009). Comparing anomaly-detection algorithms for keystroke dynamics. *DSN 2009*.
