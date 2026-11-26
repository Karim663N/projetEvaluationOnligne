# Audit — branche A : jeu Mendeley « Students suspicious behaviors detection dataset »

Source : Hossen M. K. & Uddin M. S., *Students suspicious behaviors detection dataset for AI-powered online
exam proctoring*, Mendeley Data, v1, 2025, DOI 10.17632/39xs8th543.1 — licence **CC BY 4.0**
(attribution obligatoire ; données modifiées : voir ci-dessous). Téléchargé via l'API publique Mendeley,
SHA-256 vérifié (`840e3bce713926ec…`).

## 1. Schéma

| variable | type | manquants | valeurs distinctes | min | max | exemple |
|---|---|---|---|---|---|---|
| face_present | int64 | 0 | 2 | 0.000 | 1.000 | 1 |
| no_of_face | int64 | 0 | 3 | 0.000 | 2.000 | 1 |
| face_x | float64 | 0 | 5313 | -19.789 | 521.926 | 262.580 |
| face_y | float64 | 0 | 5318 | -40.600 | 434.430 | 312.063 |
| face_w | float64 | 0 | 5313 | 0.000 | 486.327 | 151.788 |
| face_h | float64 | 0 | 5311 | 0.000 | 486.350 | 151.788 |
| left_eye_x | float64 | 0 | 3366 | 0.000 | 563.952 | 307.919 |
| left_eye_y | float64 | 0 | 3366 | -2.351 | 443.906 | 354.479 |
| right_eye_x | float64 | 0 | 3364 | 0.000 | 626.042 | 373.060 |
| right_eye_y | float64 | 0 | 3366 | 0.000 | 454.584 | 353.495 |
| nose_tip_x | float64 | 0 | 3363 | 0.000 | 580.591 | 344.517 |
| nose_tip_y | float64 | 0 | 3363 | 0.000 | 503.155 | 387.335 |
| mouth_x | float64 | 0 | 3366 | 0.000 | 574.558 | 345.073 |
| mouth_y | float64 | 0 | 3364 | 0.000 | 521.316 | 419.541 |
| face_conf | float64 | 0 | 5312 | 0.000 | 98.507 | 87.762 |
| hand_count | int64 | 0 | 4 | 0.000 | 3.000 | 0 |
| left_hand_x | float64 | 0 | 396 | -0.009 | 0.494 | 0.000 |
| left_hand_y | float64 | 0 | 393 | 0.000 | 1.098 | 0.000 |
| right_hand_x | float64 | 0 | 1179 | 0.000 | 0.956 | 0.000 |
| right_hand_y | float64 | 0 | 1178 | 0.000 | 1.099 | 0.000 |
| hand_obj_interaction | int64 | 0 | 2 | 0.000 | 1.000 | 0 |
| head_pose | str | 569 | 4 | — | — | forward |
| head_pitch | float64 | 0 | 4668 | -0.057 | 0.310 | 0.019 |
| head_yaw | float64 | 0 | 4668 | -0.098 | 0.740 | 0.015 |
| head_roll | float64 | 0 | 2854 | -0.006 | 0.002 | -0.001 |
| phone_present | int64 | 0 | 2 | 0.000 | 1.000 | 0 |
| phone_loc_x | int64 | 0 | 279 | 0.000 | 500.000 | 0 |
| phone_loc_y | int64 | 0 | 262 | 0.000 | 447.000 | 0 |
| phone_conf | float64 | 0 | 774 | 0.000 | 0.934 | 0.000 |
| gaze_on_script | int64 | 0 | 2 | 0.000 | 1.000 | 1 |
| gaze_direction | str | 1051 | 5 | — | — | center |
| gazePoint_x | int64 | 0 | 471 | 0.000 | 639.000 | 336 |
| gazePoint_y | int64 | 0 | 344 | 0.000 | 480.000 | 325 |
| pupil_left_x | int64 | 0 | 281 | 0.000 | 501.000 | 304 |
| pupil_left_y | int64 | 0 | 244 | 0.000 | 430.000 | 348 |
| pupil_right_x | int64 | 0 | 297 | 0.000 | 579.000 | 368 |
| pupil_right_y | int64 | 0 | 254 | 0.000 | 430.000 | 354 |
| label | int64 | 0 | 2 | 0.000 | 1.000 | 0 |

- Lignes : **5500**, colonnes : 38 (37 indicateurs + étiquette)
- Valeurs manquantes : `head_pose` 569, `gaze_direction` 1051
  → ce sont les modalités « None » documentées (pas de visage / regard non estimé), recodées `none`.
- Doublons exacts : **76** lignes (83 lignes impliquées),
  aucune étiquette contradictoire, 7 motifs distincts seulement :
  93% des lignes concernées sont « aucun visage détecté » (valeurs nulles répétées), pas des
  copies d'images voisines. Écart médian avec la première occurrence : 896 lignes
  (max 5141) ; 5% dans le même bloc de 100 lignes.
  Ils sont supprimés avant le découpage (sinon des entrées identiques seraient à la fois apprises et testées).
- Repère image : `gazePoint_x` ≤ 639, `gazePoint_y` ≤ 480 → images **640×480**.
- Unités : la documentation annonce des **degrés** pour `head_pitch/yaw/roll`, mais `head_yaw` varie de
  -0.098 à 0.740 : l'unité réelle est inconnue (voir parité).

## 2. Équilibre des classes

| classe | effectif | proportion |
|---|---|---|
| 0 (normal) | 2881 | 0.524 |
| 1 (triche) | 2619 | 0.476 |

Jeu quasi équilibré (47.6% de triche), très loin de la réalité d'un examen
(la triche y est rare) : les probabilités calibrées sur ce jeu doivent être **corrigées de la prévalence**
avant fusion (voir `fusion.adjust_prior`).

## 3. Identifiant participant et fuite de données

- **Aucun identifiant de participant, de session ou d'horodatage** dans le fichier. Le découpage par
  participant demandé est **impossible** : c'est une limite majeure.
- Les lignes sont des **images successives** de vidéos : la distance médiane (position du visage) entre deux
  lignes consécutives est de 18.4 px contre 119.3 px entre deux lignes
  tirées au hasard. L'étiquette change 989 fois d'une ligne à la suivante (ce ne sont pas
  des blocs triés par classe).
- Un découpage aléatoire mettrait des images quasi identiques dans l'apprentissage et le test (**fuite**).
  Mesure retenue : **blocs de 100 lignes contiguës** comme proxy de session, découpage
  apprentissage/test et validation croisée **par bloc** (`StratifiedGroupKFold`). L'écart avec un découpage
  aléatoire est mesuré dans le rapport final.

## 4. L'étiquette est en grande partie une règle sur les sorties des détecteurs

| condition | lignes | dont classe 1 | P(triche \| condition) |
|---|---|---|---|
| head_pose != forward | 1564 | 1564 | 1.000 |
| gaze_direction hors {center, none} | 858 | 858 | 1.000 |
| gaze_direction = none (non estimé) | 1051 | 646 | 0.615 |
| phone_present = 1 | 774 | 774 | 1.000 |
| hand_obj_interaction = 1 | 838 | 838 | 1.000 |
| no_of_face != 1 | 290 | 290 | 1.000 |
| face_present = 0 | 176 | 176 | 1.000 |
| hand_count = 3 | 2 | 2 | 1.000 |

Profil de **toutes** les lignes « normales » : head_pose ∈ ['forward'], gaze_direction ∈ ['center', 'none'], téléphone détecté : 0 ligne(s), objet en main : 0 ligne(s), nombre de visages ∈ [1].
98.9% des lignes « triche » présentent au moins une anomalie de détecteur (tête non
frontale, regard décentré, téléphone, objet en main, nombre de visages ≠ 1), contre 0.0% des lignes normales. L'annotation semble donc **dérivée en partie des sorties des détecteurs
eux-mêmes** (circularité) : des scores très élevés sur ce jeu ne prouveraient pas une bonne détection de la
triche réelle, seulement la capacité à retrouver la règle d'annotation.

AUC univariées (toutes variables, 15 premières) :

| variable | AUC univariee (max(a,1-a)) |
|---|---|
| head_pose_forward | 0.799 |
| gaze_direction_center | 0.717 |
| gaze_on_script | 0.717 |
| face_h | 0.703 |
| face_w | 0.703 |
| hand_obj_interaction | 0.660 |
| face_conf | 0.650 |
| phone_present | 0.648 |
| phone_conf | 0.648 |
| phone_loc_y | 0.647 |
| phone_loc_x | 0.643 |
| head_roll | 0.635 |
| gazePoint_x | 0.627 |
| head_pose_none | 0.609 |
| left_hand_x | 0.603 |

Arbres de décision ajustés sur tout le jeu (diagnostic, pas une évaluation), toutes variables :

| profondeur | erreurs (apprentissage) | exactitude (apprentissage) |
|---|---|---|
| 1.000 | 1055.000 | 0.808 |
| 2.000 | 486.000 | 0.912 |
| 3.000 | 229.000 | 0.958 |
| 4.000 | 159.000 | 0.971 |
| 6.000 | 63.000 | 0.989 |

## 5. Audit de parité (entraînement ↔ inférence dans le navigateur, MediaPipe Tasks JS)

Variables **retenues** (calculables à l'identique dans le navigateur, sous les conventions indiquées) :

| variables Mendeley | équivalent navigateur | reproductible |
|---|---|---|
| face_present, no_of_face | MediaPipe Face Detector / FaceLandmarker (numFaces) | OUI |
| face_x, face_y, face_w, face_h | boîte englobante normalisée × 640×480 | OUI (convention : repère 640×480) |
| left/right_eye, nose_tip, mouth (x, y) | 6 points clés du Face Detector (yeux, nez, bouche) × 640×480 | OUI |
| hand_count | MediaPipe HandLandmarker (numHands) | OUI |
| left/right_hand (x, y) | poignet (landmark 0), coordonnées normalisées 0–1, latéralité | OUI (convention : image non miroir) |
| phone_present, phone_loc_x/y | MediaPipe ObjectDetector (COCO « cell phone ») | PARTIEL : autre détecteur que YOLOv5/v7, rappel à vérifier |
| pupil_left/right (x, y) | iris FaceLandmarker (landmarks 468 et 473) × 640×480 | OUI |

Variables **exclues** de l'entraînement du modèle déployable :

| variable exclue | raison |
|---|---|
| face_conf | score propre au detecteur d'origine (echelle 0-100) : non comparable a MediaPipe Tasks JS |
| phone_conf | score propre a YOLOv5/v7 : un autre detecteur (MediaPipe ObjectDetector) n'a pas la meme calibration |
| hand_obj_interaction | regle maison non documentee (interaction main-objet) |
| head_pose | categorie issue de seuils non documentes |
| head_pitch | unite non conforme a la documentation ("degres" mais valeurs ~0,01) : echelle non reproductible |
| head_yaw | idem head_pitch |
| head_roll | idem head_pitch |
| gaze_on_script | zone "script" non definie dans la documentation |
| gaze_direction | modele de regard maison (solvePnP + projectPoints), seuils non documentes |
| gazePoint_x | point de regard issu du modele maison non documente |
| gazePoint_y | idem gazePoint_x |

À partir des variables retenues, le pipeline calcule des variables **invariantes à la position et à l'échelle**
(`src/examguard_ml/features.py`) : taille et centre du visage normalisés, écart des yeux / largeur du visage,
proxies de rotation (nez par rapport au milieu des yeux), bascule (angle de la ligne des yeux), distance
bouche-nez, distance main-visage, position normalisée du téléphone, décalage des pupilles par rapport aux yeux.
Ces formules remplacent `head_pose`, `head_pitch/yaw/roll` et `gaze_*`, dont le calcul d'origine n'est pas
documenté.

AUC univariées des variables reproductibles :

| variable | AUC univariee (max(a,1-a)) |
|---|---|
| face_size | 0.703 |
| phone_present | 0.648 |
| phone_y | 0.647 |
| phone_x | 0.643 |
| hand_face_dist | 0.612 |
| pupil_dy | 0.603 |
| left_hand_x | 0.603 |
| hand_count | 0.595 |
| left_hand_y | 0.591 |
| face_cx | 0.583 |
| right_hand_y | 0.582 |
| right_hand_x | 0.575 |
| mouth_nose_ratio | 0.571 |
| face_cy | 0.568 |
| roll_proxy | 0.563 |
| pupils_detected | 0.561 |
| yaw_proxy | 0.535 |
| face_present | 0.534 |
| pitch_proxy | 0.530 |
| eye_dist_ratio | 0.524 |
| no_of_face | 0.512 |
| pupil_dx | 0.505 |

Arbres de décision ajustés sur tout le jeu, variables reproductibles seulement (diagnostic) :

| profondeur | erreurs (apprentissage) | exactitude (apprentissage) |
|---|---|---|
| 1.000 | 1845.000 | 0.665 |
| 2.000 | 1594.000 | 0.710 |
| 3.000 | 1524.000 | 0.723 |
| 4.000 | 1232.000 | 0.776 |
| 6.000 | 1038.000 | 0.811 |

Un modèle de **référence non déployable** (toutes les colonnes Mendeley) est entraîné uniquement pour mesurer
le coût de la parité.
