# Audit — branche B : `online_exam_data.csv`

Généré par `python -m examguard_ml.audit`. Fichier SHA-256 `7043dc7d8aa98c7b…`.

## 1. Constat principal (à lire en premier)

Le cahier des charges décrit ce fichier comme contenant « changements d'onglet, copier-coller,
temps par question, mouvements de souris et rythme de frappe ». **Ce n'est pas le cas.** Le fichier
contient 1600 sessions décrites par des **compteurs de réponses, de bonnes réponses et une durée**.
Aucun des signaux navigateur ci-dessous n'est présent :

| signal prevu par le cahier des charges | evenement navigateur |
|---|---|
| changements d'onglet / perte de focus | visibilitychange, blur/focus |
| copier-coller | evenements copy / paste / cut |
| mouvements de souris | mousemove (vitesse, inactivite) |
| rythme de frappe | keydown / keyup (H, DD, UD) |
| temps par question (detail) | horodatage par question |

Conséquence : le modèle B entraîné ici est un modèle **« session d'examen » (rythme et réussite)**, pas un modèle
d'événements navigateur. Les événements navigateur capturés par l'application (EF5) n'ont **aucune donnée
étiquetée publique** dans ce projet : ils devront être traités par des règles explicites et/ou collectés lors
du pilote (10–20 volontaires) avant de pouvoir être appris.

Provenance : le fichier a été fourni par l'équipe ; sa source et sa licence ne sont pas documentées.
Les noms d'étudiants ressemblent à des noms générés automatiquement, ce qui suggère un **jeu synthétique**
(hypothèse non vérifiée, à confirmer auprès de la source).

## 2. Schéma

| variable | type | manquants | valeurs distinctes | min | max | exemple |
|---|---|---|---|---|---|---|
| student_name | str | 0 | 1600 | — | — | (masqué : donnée personnelle) |
| exam_mode | str | 0 | 2 | — | — | remote |
| tot_question | int64 | 0 | 4 | 20.000 | 50.000 | 20 |
| tot_que_attempted | int64 | 0 | 41 | 10.000 | 50.000 | 10 |
| que_att_within_idl_time | int64 | 0 | 45 | 0.000 | 47.000 | 6 |
| idl_time_correct_que | int64 | 0 | 35 | 0.000 | 36.000 | 4 |
| tot_correct_que | int64 | 0 | 47 | 0.000 | 50.000 | 5 |
| questions_to_pass | int64 | 0 | 4 | 12.000 | 30.000 | 12 |
| result | str | 0 | 2 | — | — | fail |
| tot_exam_time | int64 | 0 | 4 | 60.000 | 150.000 | 60 |
| exam_finish_time_in_sec | int64 | 0 | 1448 | 60.000 | 8996.000 | 757 |
| finish_time_in_min | int64 | 0 | 147 | 1.000 | 149.000 | 12 |
| prediction | str | 0 | 2 | — | — | Genuine |

- Lignes : **1600**, colonnes : 13
- Valeurs manquantes : **0**
- Lignes dupliquées : **0**
- Contraintes logiques (répondues ≤ total, correctes ≤ répondues, durée ≤ temps alloué, …) respectées : 100%

## 3. Équilibre des classes

| classe | effectif | proportion |
|---|---|---|
| Genuine | 1523 | 0.952 |
| Cheating | 77 | 0.048 |

Classe positive très minoritaire (4.8%) : l'exactitude (*accuracy*) n'est pas utilisée ;
un modèle qui répond toujours « Genuine » aurait 95.2% d'exactitude.

Par configuration d'examen (nombre de questions) :

| tot_question | Cheating | Genuine |
|---|---|---|
| 20 | 35 | 365 |
| 30 | 11 | 389 |
| 40 | 19 | 381 |
| 50 | 12 | 388 |

Par mode d'examen :

| exam_mode | Cheating | Genuine |
|---|---|---|
| center_based | 25 | 504 |
| remote | 52 | 1019 |

Par résultat :

| result | Cheating | Genuine |
|---|---|---|
| fail | 0 | 1203 |
| pass | 77 | 320 |

**Les 77 cas de triche ont tous réussi l'examen** (0 triche parmi les échecs).
L'étiquette est donc fortement liée à la réussite : un modèle appris sur ces données associera « bonne note »
et « suspicion ». C'est un **biais important** (risque de faux positifs sur les bons étudiants) documenté dans
la fiche modèle ; l'ablation B3 (sans aucune variable de correction) mesure ce qu'il reste sans la note.

## 4. Identifiant et risque de fuite

- `student_name` : 1600 valeurs uniques pour 1600 lignes → **une ligne = un participant**.
  Un découpage stratifié par ligne est donc aussi un découpage par participant (aucun participant à cheval
  entre apprentissage et test). Le nom n'est jamais utilisé comme variable.
- Redondances (pas des fuites de la cible, mais des colinéarités parfaites retirées) :
  `tot_exam_time = 3 × tot_question` (100%),
  `questions_to_pass = 0,6 × tot_question` (100%),
  `result` dérivé de la note (100%),
  `finish_time_in_min = ⌊sec/60⌋` (100%).
- La cible est-elle une règle simple des variables ? Un arbre de profondeur 4 laisse encore
  32 erreurs sur l'apprentissage : pas de règle déterministe triviale détectée.

AUC univariée de chaque variable (après construction des ratios) :

| variable | AUC univariee (max(a,1-a)) |
|---|---|
| idl_time_correct_que | 0.939 |
| frac_correct | 0.906 |
| idl_corr_rate | 0.836 |
| que_att_within_idl_time | 0.829 |
| frac_idl | 0.814 |
| frac_attempted | 0.801 |
| tot_correct_que | 0.790 |
| acc_attempted | 0.786 |
| tot_que_attempted | 0.635 |
| sec_per_attempt | 0.612 |
| tot_question | 0.604 |
| exam_finish_time_in_sec | 0.551 |
| frac_time_used | 0.508 |
| remote | 0.503 |

Ajustement d'arbres de décision sur tout le jeu (diagnostic de déterminisme de l'étiquette, pas une évaluation) :

| profondeur | erreurs (apprentissage) | exactitude (apprentissage) |
|---|---|---|
| 1.000 | 77.000 | 0.952 |
| 2.000 | 49.000 | 0.969 |
| 3.000 | 44.000 | 0.973 |
| 4.000 | 32.000 | 0.980 |
| 6.000 | 13.000 | 0.992 |

## 5. Audit de parité (entraînement ↔ inférence dans l'application)

| variable | source a l'inference | reproductible | decision |
|---|---|---|---|
| student_name | identite de l'etudiant | non pertinent | EXCLUE (identifiant personnel) |
| exam_mode | configuration de l'examen (serveur) | OUI | utilisee (remote = 1/0) |
| tot_question | configuration de l'examen (serveur) | OUI | utilisee |
| tot_que_attempted | reponses enregistrees (serveur) | OUI | utilisee |
| que_att_within_idl_time | temps cumule par question (navigateur), compte si <= 180 s | OUI (convention de l'equipe : temps ideal = 3 min/question) | utilisee dans B1, retiree dans B2 (ablation) |
| idl_time_correct_que | idem + correction (serveur) | OUI (meme convention) | utilisee dans B1, retiree dans B2 et B3 |
| tot_correct_que | correction (serveur, apres soumission) | OUI | utilisee dans B1/B2, retiree dans B3 |
| questions_to_pass | configuration | OUI | EXCLUE (= 0,6 x tot_question, redondante) |
| result | derivee de la note | OUI | EXCLUE (derivee, redondante) |
| tot_exam_time | configuration | OUI | EXCLUE (= 3 x tot_question, redondante) |
| exam_finish_time_in_sec | horodatage debut/fin de session | OUI | utilisee |
| finish_time_in_min | = floor(sec / 60) | OUI | EXCLUE (redondante) |
| prediction | etiquette | — | CIBLE (Cheating = 1) |

Variables construites dans le pipeline (identiques à l'entraînement et à l'inférence, fichier
`src/examguard_ml/features.py`) : part de questions répondues, part de bonnes réponses, taux de réussite sur
les questions répondues, part des réponses dans le temps idéal, taux de réussite des réponses rapides,
part du temps alloué utilisée (temps alloué = 3 min × nombre de questions), temps moyen par question.

**Convention retenue par l'équipe (15/11/2026) : temps idéal = 3 min (180 s) par question**, soit le temps
alloué par question dans ce fichier. Une question répondue compte « dans le temps idéal » si le temps **cumulé**
passé dessus (somme de toutes les visites) est ≤ 180 s. L'application doit calculer les compteurs avec
`build_browser_features` (`inference.py`), qui applique exactement cette règle. Le fichier lui-même ne documente
pas sa définition d'origine : si la source en donne une autre, il faudra réaligner la convention ou réentraîner.
L'ablation B2 mesure le modèle sans ces deux variables.
