"""Phase 1 : audit des donnees et audit de parite (entrainement vs inference navigateur).

Produit reports/audit_browser.md, reports/audit_webcam.md, reports/audit_keystroke.md
et reports/audit_summary.json. Tous les chiffres sont calcules ici, rien n'est saisi a la main.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.tree import DecisionTreeClassifier

from . import config, data
from .features import browser_features, webcam_features
from .utils import md_table, write_json


def _schema(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for c in df.columns:
        s = df[c]
        num = pd.api.types.is_numeric_dtype(s)
        rows.append({
            "variable": c,
            "type": str(s.dtype),
            "manquants": int(s.isna().sum()),
            "valeurs distinctes": int(s.nunique(dropna=True)),
            "min": float(s.min()) if num else None,
            "max": float(s.max()) if num else None,
            "exemple": ("(masqué : donnée personnelle)" if c == "student_name"
                        else s.dropna().iloc[0] if s.notna().any() else None),
        })
    return pd.DataFrame(rows)


def _single_auc(X: pd.DataFrame, y: np.ndarray) -> pd.DataFrame:
    rows = []
    for c in X.columns:
        if not pd.api.types.is_numeric_dtype(X[c]) or X[c].nunique() < 2:
            continue
        a = roc_auc_score(y, X[c])
        rows.append({"variable": c, "AUC univariee (max(a,1-a))": max(a, 1 - a)})
    out = pd.DataFrame(rows, columns=["variable", "AUC univariee (max(a,1-a))"])
    return out.sort_values("AUC univariee (max(a,1-a))", ascending=False).reset_index(drop=True)


def _tree_fit(X: pd.DataFrame, y: np.ndarray) -> pd.DataFrame:
    rows = []
    for d in (1, 2, 3, 4, 6):
        t = DecisionTreeClassifier(max_depth=d, random_state=config.SEED).fit(X, y)
        rows.append({"profondeur": d, "erreurs (apprentissage)": int((t.predict(X) != y).sum()),
                     "exactitude (apprentissage)": t.score(X, y)})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Branche B
# ---------------------------------------------------------------------------
BROWSER_PARITY = [
    # variable, source a l'inference, reproductible, decision
    ("student_name", "identite de l'etudiant", "non pertinent", "EXCLUE (identifiant personnel)"),
    ("exam_mode", "configuration de l'examen (serveur)", "OUI", "utilisee (remote = 1/0)"),
    ("tot_question", "configuration de l'examen (serveur)", "OUI", "utilisee"),
    ("tot_que_attempted", "reponses enregistrees (serveur)", "OUI", "utilisee"),
    ("que_att_within_idl_time", "temps cumule par question (navigateur), compte si <= 180 s",
     "OUI (convention de l'equipe : temps ideal = 3 min/question)", "utilisee dans B1, retiree dans B2 (ablation)"),
    ("idl_time_correct_que", "idem + correction (serveur)",
     "OUI (meme convention)", "utilisee dans B1, retiree dans B2 et B3"),
    ("tot_correct_que", "correction (serveur, apres soumission)", "OUI", "utilisee dans B1/B2, retiree dans B3"),
    ("questions_to_pass", "configuration", "OUI", "EXCLUE (= 0,6 x tot_question, redondante)"),
    ("result", "derivee de la note", "OUI", "EXCLUE (derivee, redondante)"),
    ("tot_exam_time", "configuration", "OUI", "EXCLUE (= 3 x tot_question, redondante)"),
    ("exam_finish_time_in_sec", "horodatage debut/fin de session", "OUI", "utilisee"),
    ("finish_time_in_min", "= floor(sec / 60)", "OUI", "EXCLUE (redondante)"),
    ("prediction", "etiquette", "—", "CIBLE (Cheating = 1)"),
]
BROWSER_EXPECTED_BUT_MISSING = [
    ("changements d'onglet / perte de focus", "visibilitychange, blur/focus"),
    ("copier-coller", "evenements copy / paste / cut"),
    ("mouvements de souris", "mousemove (vitesse, inactivite)"),
    ("rythme de frappe", "keydown / keyup (H, DD, UD)"),
    ("temps par question (detail)", "horodatage par question"),
]


def audit_browser() -> dict:
    df = data.load_browser_raw()
    y = (df[data.BROWSER_TARGET] == data.BROWSER_POSITIVE).astype(int).to_numpy()
    facts = {
        "n_lignes": len(df), "n_colonnes": df.shape[1],
        "manquants_total": int(df.isna().sum().sum()),
        "doublons_lignes": int(df.duplicated().sum()),
        "noms_uniques": int(df["student_name"].nunique()),
        "positifs": int(y.sum()), "taux_positifs": float(y.mean()),
        "tot_exam_time_eq_3x_questions": float((df.tot_exam_time == 3 * df.tot_question).mean()),
        "questions_to_pass_eq_0.6x": float((df.questions_to_pass == 0.6 * df.tot_question).mean()),
        "result_derive_de_la_note": float(((df.tot_correct_que >= df.questions_to_pass)
                                           == (df.result == "pass")).mean()),
        "finish_min_eq_floor_sec": float((df.finish_time_in_min == df.exam_finish_time_in_sec // 60).mean()),
        "triche_parmi_echecs": int(((df.result == "fail") & (y == 1)).sum()),
        "triche_parmi_reussites": int(((df.result == "pass") & (y == 1)).sum()),
        "taux_triche_si_reussite": float(y[(df.result == "pass").to_numpy()].mean()),
        "contraintes_logiques_respectees": float(np.mean([
            (df.tot_que_attempted <= df.tot_question).mean(),
            (df.que_att_within_idl_time <= df.tot_que_attempted).mean(),
            (df.idl_time_correct_que <= df.que_att_within_idl_time).mean(),
            (df.tot_correct_que <= df.tot_que_attempted).mean(),
            (df.idl_time_correct_que <= df.tot_correct_que).mean(),
            (df.exam_finish_time_in_sec <= df.tot_exam_time * 60).mean(),
        ])),
    }
    feats = browser_features(df[data.BROWSER_RAW_COLUMNS])
    auc = _single_auc(feats, y)
    tree = _tree_fit(feats, y)
    facts["auc_univariee_max"] = float(auc.iloc[0, 1])
    facts["variable_auc_max"] = str(auc.iloc[0, 0])
    facts["arbre_prof4_erreurs"] = int(tree.loc[tree.profondeur == 4, "erreurs (apprentissage)"].iloc[0])

    cls = df[data.BROWSER_TARGET].value_counts().rename_axis("classe").reset_index(name="effectif")
    cls["proportion"] = cls["effectif"] / len(df)
    by_cfg = pd.crosstab(df.tot_question, df[data.BROWSER_TARGET]).reset_index()
    by_mode = pd.crosstab(df.exam_mode, df[data.BROWSER_TARGET]).reset_index()
    by_res = pd.crosstab(df.result, df[data.BROWSER_TARGET]).reset_index()

    parity = pd.DataFrame(BROWSER_PARITY, columns=["variable", "source a l'inference",
                                                   "reproductible", "decision"])
    missing = pd.DataFrame(BROWSER_EXPECTED_BUT_MISSING,
                           columns=["signal prevu par le cahier des charges", "evenement navigateur"])

    md = f"""# Audit — branche B : `online_exam_data.csv`

Généré par `python -m examguard_ml.audit`. Fichier SHA-256 `{config.LOCAL_SHA256['online_exam_data.csv'][:16]}…`.

## 1. Constat principal (à lire en premier)

Le cahier des charges décrit ce fichier comme contenant « changements d'onglet, copier-coller,
temps par question, mouvements de souris et rythme de frappe ». **Ce n'est pas le cas.** Le fichier
contient {facts['n_lignes']} sessions décrites par des **compteurs de réponses, de bonnes réponses et une durée**.
Aucun des signaux navigateur ci-dessous n'est présent :

{md_table(missing)}

Conséquence : le modèle B entraîné ici est un modèle **« session d'examen » (rythme et réussite)**, pas un modèle
d'événements navigateur. Les événements navigateur capturés par l'application (EF5) n'ont **aucune donnée
étiquetée publique** dans ce projet : ils devront être traités par des règles explicites et/ou collectés lors
du pilote (10–20 volontaires) avant de pouvoir être appris.

Provenance : le fichier a été fourni par l'équipe ; sa source et sa licence ne sont pas documentées.
Les noms d'étudiants ressemblent à des noms générés automatiquement, ce qui suggère un **jeu synthétique**
(hypothèse non vérifiée, à confirmer auprès de la source).

## 2. Schéma

{md_table(_schema(df))}

- Lignes : **{facts['n_lignes']}**, colonnes : {facts['n_colonnes']}
- Valeurs manquantes : **{facts['manquants_total']}**
- Lignes dupliquées : **{facts['doublons_lignes']}**
- Contraintes logiques (répondues ≤ total, correctes ≤ répondues, durée ≤ temps alloué, …) respectées : {facts['contraintes_logiques_respectees']:.0%}

## 3. Équilibre des classes

{md_table(cls)}

Classe positive très minoritaire ({facts['taux_positifs']:.1%}) : l'exactitude (*accuracy*) n'est pas utilisée ;
un modèle qui répond toujours « Genuine » aurait {1 - facts['taux_positifs']:.1%} d'exactitude.

Par configuration d'examen (nombre de questions) :

{md_table(by_cfg)}

Par mode d'examen :

{md_table(by_mode)}

Par résultat :

{md_table(by_res)}

**Les {facts['positifs']} cas de triche ont tous réussi l'examen** ({facts['triche_parmi_echecs']} triche parmi les échecs).
L'étiquette est donc fortement liée à la réussite : un modèle appris sur ces données associera « bonne note »
et « suspicion ». C'est un **biais important** (risque de faux positifs sur les bons étudiants) documenté dans
la fiche modèle ; l'ablation B3 (sans aucune variable de correction) mesure ce qu'il reste sans la note.

## 4. Identifiant et risque de fuite

- `student_name` : {facts['noms_uniques']} valeurs uniques pour {facts['n_lignes']} lignes → **une ligne = un participant**.
  Un découpage stratifié par ligne est donc aussi un découpage par participant (aucun participant à cheval
  entre apprentissage et test). Le nom n'est jamais utilisé comme variable.
- Redondances (pas des fuites de la cible, mais des colinéarités parfaites retirées) :
  `tot_exam_time = 3 × tot_question` ({facts['tot_exam_time_eq_3x_questions']:.0%}),
  `questions_to_pass = 0,6 × tot_question` ({facts['questions_to_pass_eq_0.6x']:.0%}),
  `result` dérivé de la note ({facts['result_derive_de_la_note']:.0%}),
  `finish_time_in_min = ⌊sec/60⌋` ({facts['finish_min_eq_floor_sec']:.0%}).
- La cible est-elle une règle simple des variables ? Un arbre de profondeur 4 laisse encore
  {facts['arbre_prof4_erreurs']} erreurs sur l'apprentissage : pas de règle déterministe triviale détectée.

AUC univariée de chaque variable (après construction des ratios) :

{md_table(auc)}

Ajustement d'arbres de décision sur tout le jeu (diagnostic de déterminisme de l'étiquette, pas une évaluation) :

{md_table(tree)}

## 5. Audit de parité (entraînement ↔ inférence dans l'application)

{md_table(parity)}

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
"""
    (config.REPORTS / "audit_browser.md").write_text(md, encoding="utf-8")
    return facts


# ---------------------------------------------------------------------------
# Branche A
# ---------------------------------------------------------------------------
WEBCAM_PARITY_KEPT = [
    ("face_present, no_of_face", "MediaPipe Face Detector / FaceLandmarker (numFaces)", "OUI"),
    ("face_x, face_y, face_w, face_h", "boîte englobante normalisée × 640×480", "OUI (convention : repère 640×480)"),
    ("left/right_eye, nose_tip, mouth (x, y)", "6 points clés du Face Detector (yeux, nez, bouche) × 640×480", "OUI"),
    ("hand_count", "MediaPipe HandLandmarker (numHands)", "OUI"),
    ("left/right_hand (x, y)", "poignet (landmark 0), coordonnées normalisées 0–1, latéralité", "OUI (convention : image non miroir)"),
    ("phone_present, phone_loc_x/y", "MediaPipe ObjectDetector (COCO « cell phone »)", "PARTIEL : autre détecteur que YOLOv5/v7, rappel à vérifier"),
    ("pupil_left/right (x, y)", "iris FaceLandmarker (landmarks 468 et 473) × 640×480", "OUI"),
]


def audit_webcam() -> dict:
    raw = data.load_webcam_raw()
    df = raw.copy()
    for c in ("head_pose", "gaze_direction"):
        df[c] = df[c].fillna("none").astype(str)
    y = df[data.WEBCAM_TARGET].to_numpy()
    feat_cols = [c for c in df.columns if c != data.WEBCAM_TARGET]
    dup_mask = df.duplicated(keep=False)
    dup_first = df.duplicated(keep="first")
    # position des doublons : dans le meme bloc que leur premiere occurrence ?
    key = df[feat_cols].astype(str).agg("|".join, axis=1)
    first_idx = key.groupby(key).transform(lambda s: s.index[0])
    blocks = np.arange(len(df)) // data.WEBCAM_BLOCK_SIZE
    same_block = float((blocks[dup_first.to_numpy()] ==
                        blocks[first_idx[dup_first].to_numpy()]).mean()) if dup_first.any() else 1.0
    gap = (np.arange(len(df))[dup_first.to_numpy()] - first_idx[dup_first].to_numpy())

    # autocorrelation temporelle
    f = df[["face_x", "face_y", "face_w", "nose_tip_x", "nose_tip_y"]].to_numpy()
    d_consec = np.linalg.norm(np.diff(f, axis=0), axis=1)
    rng = np.random.default_rng(config.SEED)
    perm = rng.permutation(len(f))
    d_rand = np.linalg.norm(f[perm[1:]] - f[perm[:-1]], axis=1)
    label_changes = int((np.diff(y) != 0).sum())

    # regles d'etiquetage : modalites qui n'apparaissent qu'en classe 1
    off_gaze = ~df.gaze_direction.isin(["center", "none"])
    rules = []
    for c, test in [("head_pose != forward", df.head_pose != "forward"),
                    ("gaze_direction hors {center, none}", off_gaze),
                    ("gaze_direction = none (non estimé)", df.gaze_direction == "none"),
                    ("phone_present = 1", df.phone_present == 1),
                    ("hand_obj_interaction = 1", df.hand_obj_interaction == 1),
                    ("no_of_face != 1", df.no_of_face != 1),
                    ("face_present = 0", df.face_present == 0),
                    ("hand_count = 3", df.hand_count == 3)]:
        rules.append({"condition": c, "lignes": int(test.sum()),
                      "dont classe 1": int(y[test.to_numpy()].sum()),
                      "P(triche | condition)": float(y[test.to_numpy()].mean()) if test.any() else None})
    any_rule = ((df.head_pose != "forward") | off_gaze | (df.phone_present == 1)
                | (df.hand_obj_interaction == 1) | (df.no_of_face != 1)).to_numpy()
    neg = df[y == 0]
    normal_profile = (
        f"head_pose ∈ {sorted(neg.head_pose.unique().tolist())}, "
        f"gaze_direction ∈ {sorted(neg.gaze_direction.unique().tolist())}, "
        f"téléphone détecté : {int(neg.phone_present.sum())} ligne(s), "
        f"objet en main : {int(neg.hand_obj_interaction.sum())} ligne(s), "
        f"nombre de visages ∈ {sorted(neg.no_of_face.unique().tolist())}"
    )
    dup_rows = df[dup_mask]
    dup_patterns = int(len(dup_rows.drop_duplicates()))
    dup_noface = float((dup_rows.face_present == 0).mean()) if len(dup_rows) else 0.0
    facts = {
        "n_lignes": len(df), "n_colonnes": df.shape[1],
        "manquants_head_pose": int(raw.head_pose.isna().sum()),
        "manquants_gaze_direction": int(raw.gaze_direction.isna().sum()),
        "doublons_exacts": int(dup_first.sum()), "lignes_impliquees_doublons": int(dup_mask.sum()),
        "doublons_meme_bloc": same_block,
        "doublons_motifs_distincts": dup_patterns,
        "doublons_part_sans_visage": dup_noface,
        "profil_lignes_normales": normal_profile,
        "doublons_ecart_median_lignes": float(np.median(gap)) if len(gap) else 0.0,
        "doublons_ecart_max_lignes": int(gap.max()) if len(gap) else 0,
        "positifs": int(y.sum()), "taux_positifs": float(y.mean()),
        "changements_etiquette_consecutifs": label_changes,
        "distance_mediane_consecutive_px": float(np.median(d_consec)),
        "distance_mediane_aleatoire_px": float(np.median(d_rand)),
        "lignes_avec_anomalie_detecteur": int(any_rule.sum()),
        "part_triche_expliquee_par_anomalie": float(any_rule[y == 1].mean()),
        "part_non_triche_avec_anomalie": float(any_rule[y == 0].mean()),
        "max_gazePoint_x": float(df.gazePoint_x.max()), "max_gazePoint_y": float(df.gazePoint_y.max()),
        "head_yaw_min": float(df.head_yaw.min()), "head_yaw_max": float(df.head_yaw.max()),
    }
    Xall = pd.get_dummies(df.drop(columns=data.WEBCAM_TARGET), dtype=float)
    auc_all = _single_auc(Xall, y).head(15)
    tree_all = _tree_fit(Xall, y)
    feats = webcam_features(df[data.WEBCAM_RAW_COLUMNS])
    auc_par = _single_auc(feats, y)
    tree_par = _tree_fit(feats, y)

    cls = pd.Series(y).map({0: "0 (normal)", 1: "1 (triche)"}).value_counts() \
        .rename_axis("classe").reset_index(name="effectif")
    cls["proportion"] = cls["effectif"] / len(df)
    kept = pd.DataFrame(WEBCAM_PARITY_KEPT, columns=["variables Mendeley", "équivalent navigateur",
                                                     "reproductible"])
    excl = pd.DataFrame([(k, v) for k, v in data.WEBCAM_EXCLUDED.items()],
                        columns=["variable exclue", "raison"])

    md = f"""# Audit — branche A : jeu Mendeley « Students suspicious behaviors detection dataset »

Source : Hossen M. K. & Uddin M. S., *Students suspicious behaviors detection dataset for AI-powered online
exam proctoring*, Mendeley Data, v1, 2025, DOI 10.17632/39xs8th543.1 — licence **CC BY 4.0**
(attribution obligatoire ; données modifiées : voir ci-dessous). Téléchargé via l'API publique Mendeley,
SHA-256 vérifié (`{config.MENDELEY_FILES['students_suspicious_behaviors_v1.csv']['sha256'][:16]}…`).

## 1. Schéma

{md_table(_schema(raw))}

- Lignes : **{facts['n_lignes']}**, colonnes : {facts['n_colonnes']} (37 indicateurs + étiquette)
- Valeurs manquantes : `head_pose` {facts['manquants_head_pose']}, `gaze_direction` {facts['manquants_gaze_direction']}
  → ce sont les modalités « None » documentées (pas de visage / regard non estimé), recodées `none`.
- Doublons exacts : **{facts['doublons_exacts']}** lignes ({facts['lignes_impliquees_doublons']} lignes impliquées),
  aucune étiquette contradictoire, {facts['doublons_motifs_distincts']} motifs distincts seulement :
  {facts['doublons_part_sans_visage']:.0%} des lignes concernées sont « aucun visage détecté » (valeurs nulles répétées), pas des
  copies d'images voisines. Écart médian avec la première occurrence : {facts['doublons_ecart_median_lignes']:.0f} lignes
  (max {facts['doublons_ecart_max_lignes']}) ; {facts['doublons_meme_bloc']:.0%} dans le même bloc de {data.WEBCAM_BLOCK_SIZE} lignes.
  Ils sont supprimés avant le découpage (sinon des entrées identiques seraient à la fois apprises et testées).
- Repère image : `gazePoint_x` ≤ {facts['max_gazePoint_x']:.0f}, `gazePoint_y` ≤ {facts['max_gazePoint_y']:.0f} → images **640×480**.
- Unités : la documentation annonce des **degrés** pour `head_pitch/yaw/roll`, mais `head_yaw` varie de
  {facts['head_yaw_min']:.3f} à {facts['head_yaw_max']:.3f} : l'unité réelle est inconnue (voir parité).

## 2. Équilibre des classes

{md_table(cls)}

Jeu quasi équilibré ({facts['taux_positifs']:.1%} de triche), très loin de la réalité d'un examen
(la triche y est rare) : les probabilités calibrées sur ce jeu doivent être **corrigées de la prévalence**
avant fusion (voir `fusion.adjust_prior`).

## 3. Identifiant participant et fuite de données

- **Aucun identifiant de participant, de session ou d'horodatage** dans le fichier. Le découpage par
  participant demandé est **impossible** : c'est une limite majeure.
- Les lignes sont des **images successives** de vidéos : la distance médiane (position du visage) entre deux
  lignes consécutives est de {facts['distance_mediane_consecutive_px']:.1f} px contre {facts['distance_mediane_aleatoire_px']:.1f} px entre deux lignes
  tirées au hasard. L'étiquette change {facts['changements_etiquette_consecutifs']} fois d'une ligne à la suivante (ce ne sont pas
  des blocs triés par classe).
- Un découpage aléatoire mettrait des images quasi identiques dans l'apprentissage et le test (**fuite**).
  Mesure retenue : **blocs de {data.WEBCAM_BLOCK_SIZE} lignes contiguës** comme proxy de session, découpage
  apprentissage/test et validation croisée **par bloc** (`StratifiedGroupKFold`). L'écart avec un découpage
  aléatoire est mesuré dans le rapport final.

## 4. L'étiquette est en grande partie une règle sur les sorties des détecteurs

{md_table(pd.DataFrame(rules))}

Profil de **toutes** les lignes « normales » : {facts['profil_lignes_normales']}.
{facts['part_triche_expliquee_par_anomalie']:.1%} des lignes « triche » présentent au moins une anomalie de détecteur (tête non
frontale, regard décentré, téléphone, objet en main, nombre de visages ≠ 1), contre {facts['part_non_triche_avec_anomalie']:.1%} des lignes normales. L'annotation semble donc **dérivée en partie des sorties des détecteurs
eux-mêmes** (circularité) : des scores très élevés sur ce jeu ne prouveraient pas une bonne détection de la
triche réelle, seulement la capacité à retrouver la règle d'annotation.

AUC univariées (toutes variables, 15 premières) :

{md_table(auc_all)}

Arbres de décision ajustés sur tout le jeu (diagnostic, pas une évaluation), toutes variables :

{md_table(tree_all)}

## 5. Audit de parité (entraînement ↔ inférence dans le navigateur, MediaPipe Tasks JS)

Variables **retenues** (calculables à l'identique dans le navigateur, sous les conventions indiquées) :

{md_table(kept)}

Variables **exclues** de l'entraînement du modèle déployable :

{md_table(excl)}

À partir des variables retenues, le pipeline calcule des variables **invariantes à la position et à l'échelle**
(`src/examguard_ml/features.py`) : taille et centre du visage normalisés, écart des yeux / largeur du visage,
proxies de rotation (nez par rapport au milieu des yeux), bascule (angle de la ligne des yeux), distance
bouche-nez, distance main-visage, position normalisée du téléphone, décalage des pupilles par rapport aux yeux.
Ces formules remplacent `head_pose`, `head_pitch/yaw/roll` et `gaze_*`, dont le calcul d'origine n'est pas
documenté.

AUC univariées des variables reproductibles :

{md_table(auc_par)}

Arbres de décision ajustés sur tout le jeu, variables reproductibles seulement (diagnostic) :

{md_table(tree_par)}

Un modèle de **référence non déployable** (toutes les colonnes Mendeley) est entraîné uniquement pour mesurer
le coût de la parité.
"""
    (config.REPORTS / "audit_webcam.md").write_text(md, encoding="utf-8")
    return facts


# ---------------------------------------------------------------------------
# CMU Keystroke
# ---------------------------------------------------------------------------
def audit_keystroke() -> dict:
    df = data.load_keystroke_raw()
    feats = [c for c in df.columns if c not in data.KEYSTROKE_META]
    H = [c for c in feats if c.startswith("H.")]
    DD = [c for c in feats if c.startswith("DD.")]
    UD = [c for c in feats if c.startswith("UD.")]
    # identite DD(k_i, k_i+1) = H(k_i) + UD(k_i, k_i+1)
    keys = [c[2:] for c in H]  # period, t, i, e, five, Shift.r, o, a, n, l, Return
    ident = []
    for a, b in zip(keys[:-1], keys[1:]):
        ident.append(float(np.abs(df[f"DD.{a}.{b}"] - (df[f"H.{a}"] + df[f"UD.{a}.{b}"])).max()))
    per_subj = df.groupby("subject").size()
    sess = df.groupby("subject")["sessionIndex"].nunique()
    facts = {
        "n_lignes": len(df), "n_sujets": int(df.subject.nunique()),
        "repetitions_par_sujet_min": int(per_subj.min()), "repetitions_par_sujet_max": int(per_subj.max()),
        "sessions_par_sujet": int(sess.max()),
        "n_variables_temporelles": len(feats), "n_H": len(H), "n_DD": len(DD), "n_UD": len(UD),
        "manquants_total": int(df.isna().sum().sum()), "doublons": int(df.duplicated().sum()),
        "ecart_max_DD_moins_H_plus_UD": max(ident),
        "UD_negatifs": int((df[UD] < 0).sum().sum()),
        "rang_matrice_variables": int(np.linalg.matrix_rank(df[feats].to_numpy(), tol=1e-3)),
    }
    desc = df[feats].describe().T[["mean", "std", "min", "max"]].reset_index() \
        .rename(columns={"index": "variable"})
    md = f"""# Audit — CMU Keystroke Dynamics (`DSL-StrongPasswordData.csv`)

Source : K. S. Killourhy & R. A. Maxion, « Comparing Anomaly-Detection Algorithms for Keystroke Dynamics »,
DSN 2009. Données du *Keystroke Dynamics – Benchmark Data Set* (CMU), mises à disposition pour la recherche
(citer l'article). Fichier fourni par l'équipe, SHA-256 `{config.LOCAL_SHA256['DSL-StrongPasswordData.csv'][:16]}…`.

## Schéma

- {facts['n_lignes']} lignes, {facts['n_sujets']} sujets, {facts['sessions_par_sujet']} sessions × 50 répétitions = {facts['repetitions_par_sujet_max']} saisies par sujet.
- Mot de passe fixe `.tie5Roanl` + Entrée ; {facts['n_variables_temporelles']} variables temporelles (secondes) :
  {facts['n_H']} durées d'appui (H), {facts['n_DD']} intervalles appui-appui (DD), {facts['n_UD']} intervalles relâché-appui (UD).
- Valeurs manquantes : {facts['manquants_total']} ; doublons : {facts['doublons']}.
- UD négatifs (touche suivante enfoncée avant le relâchement) : {facts['UD_negatifs']} valeurs — normal (chevauchement).
- **Redondance exacte** : DD = H + UD (écart max {facts['ecart_max_DD_moins_H_plus_UD']:.4f} s, arrondi des données) →
  rang numérique {facts['rang_matrice_variables']} pour {facts['n_variables_temporelles']} variables : la matrice de covariance est
  quasi singulière (le détecteur de Mahalanobis utilise une pseudo-inverse).

{md_table(desc, nd=4)}

## Étiquettes, identifiants et fuite

- **Aucune étiquette de triche** : le jeu sert uniquement à la vérification d'identité par la frappe
  (détection d'usurpation : quelqu'un d'autre tape à la place de l'étudiant).
- Identifiant `subject` présent : le protocole (Killourhy & Maxion) sépare strictement apprentissage
  (200 premières saisies du sujet légitime) et test (200 suivantes + 5 premières de chacun des 50 imposteurs).
  Les sessions d'apprentissage et de test sont disjointes (sessions 1–4 vs 5–8) : pas de fuite.

## Parité

H, DD et UD se calculent dans le navigateur avec `keydown`/`keyup` et `performance.now()` (résolution
navigateur ≈ 0,1 ms à quelques ms selon les protections anti-empreinte). **Limite** : texte fixe ; il faut faire
taper la même phrase à l'inscription et pendant l'examen. Ce module n'entre pas dans la fusion (pas d'étiquette
de triche).
"""
    (config.REPORTS / "audit_keystroke.md").write_text(md, encoding="utf-8")
    return facts


def run() -> dict:
    config.ensure_dirs()
    out = {"browser": audit_browser(), "webcam": audit_webcam()}
    if config.KEYSTROKE_CSV.exists():
        out["keystroke"] = audit_keystroke()
    out["files"] = data.check_files()
    write_json(out, config.REPORTS / "audit_summary.json")
    return out


if __name__ == "__main__":
    import json
    print(json.dumps(run(), indent=2, ensure_ascii=False, default=str))
