"""Construction des variables (identique a l'entrainement et a l'inference).

Les transformateurs prennent en entree les colonnes BRUTES du contrat
(data.BROWSER_RAW_COLUMNS / data.WEBCAM_RAW_COLUMNS) et produisent les variables
du modele. Ils sont serialises dans le pipeline : l'API n'a jamais a recalculer
les ratios elle-meme.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from .data import FRAME_H, FRAME_W

# ---------------------------------------------------------------------------
# Branche B : session d'examen
# ---------------------------------------------------------------------------
# Convention retenue par l'equipe (15/11/2026) : temps ideal = 3 min par question.
# Une question repondue compte "dans le temps ideal" si le temps cumule passe dessus
# (somme de toutes les visites) est <= 180 s. Meme valeur que le temps alloue par
# question dans online_exam_data.csv (tot_exam_time = 3 x tot_question).
IDEAL_SECONDS_PER_QUESTION = 180.0


def session_counts(exam_mode: str, tot_question: int, answers: list, session_seconds: float,
                   ideal_seconds: float = IDEAL_SECONDS_PER_QUESTION) -> dict:
    """Construit les 7 indicateurs de la branche B a partir des reponses d'une session.

    answers : une entree par question REPONDUE, dict {"seconds": temps cumule passe sur la
    question, "correct": bool}. Les questions non repondues ne sont pas listees.
    """
    if len(answers) > int(tot_question):
        raise ValueError("plus de reponses que de questions")
    secs, correct = [], []
    for a in answers:
        s = float(a["seconds"])
        if not np.isfinite(s) or s < 0:
            raise ValueError("seconds doit etre un nombre fini >= 0")
        secs.append(s)
        correct.append(bool(a["correct"]))
    within = [c for s, c in zip(secs, correct) if s <= ideal_seconds]
    return {
        "exam_mode": exam_mode,
        "tot_question": int(tot_question),
        "tot_que_attempted": len(secs),
        "que_att_within_idl_time": len(within),
        "idl_time_correct_que": int(sum(within)),
        "tot_correct_que": int(sum(correct)),
        "exam_finish_time_in_sec": float(session_seconds),
    }


BROWSER_FEATURE_SETS = {
    # B1 : toutes les variables calculables par l'application (retenu)
    "complet": [
        "remote", "tot_question", "tot_que_attempted", "que_att_within_idl_time",
        "idl_time_correct_que", "tot_correct_que", "exam_finish_time_in_sec",
        "frac_attempted", "frac_correct", "acc_attempted", "frac_idl", "idl_corr_rate",
        "frac_time_used", "sec_per_attempt",
    ],
    # B2 : parite stricte, sans les variables dependant du "temps ideal" (definition non documentee)
    "sans_temps_ideal": [
        "remote", "tot_question", "tot_que_attempted", "tot_correct_que",
        "exam_finish_time_in_sec", "frac_attempted", "frac_correct", "acc_attempted",
        "frac_time_used", "sec_per_attempt",
    ],
    # B3 : comportement pur, sans aucune variable de correction (equite envers les bons etudiants)
    "sans_correction": [
        "remote", "tot_question", "tot_que_attempted", "que_att_within_idl_time",
        "exam_finish_time_in_sec", "frac_attempted", "frac_idl", "frac_time_used",
        "sec_per_attempt",
    ],
}


def browser_features(X: pd.DataFrame) -> pd.DataFrame:
    X = X.copy()
    n_q = X["tot_question"].astype(float).clip(lower=1)
    att = X["tot_que_attempted"].astype(float)
    att1 = att.clip(lower=1)
    idl = X["que_att_within_idl_time"].astype(float)
    # Duree allouee : 3 min par question dans 100 % du jeu (tot_exam_time = 3 x tot_question)
    allotted_sec = n_q * 3.0 * 60.0
    out = pd.DataFrame(index=X.index)
    out["remote"] = (X["exam_mode"].astype(str) == "remote").astype(float)
    for c in ("tot_question", "tot_que_attempted", "que_att_within_idl_time",
              "idl_time_correct_que", "tot_correct_que", "exam_finish_time_in_sec"):
        out[c] = X[c].astype(float)
    out["frac_attempted"] = att / n_q
    out["frac_correct"] = X["tot_correct_que"].astype(float) / n_q
    out["acc_attempted"] = X["tot_correct_que"].astype(float) / att1
    out["frac_idl"] = idl / att1
    out["idl_corr_rate"] = X["idl_time_correct_que"].astype(float) / idl.clip(lower=1)
    out["frac_time_used"] = X["exam_finish_time_in_sec"].astype(float) / allotted_sec
    out["sec_per_attempt"] = X["exam_finish_time_in_sec"].astype(float) / att1
    return out


class BrowserFeatures(BaseEstimator, TransformerMixin):
    def __init__(self, feature_set: str = "complet"):
        self.feature_set = feature_set

    def fit(self, X, y=None):
        self.feature_names_ = list(BROWSER_FEATURE_SETS[self.feature_set])
        return self

    def transform(self, X):
        return browser_features(pd.DataFrame(X))[self.feature_names_]

    def get_feature_names_out(self, input_features=None):
        return np.asarray(self.feature_names_, dtype=object)


# ---------------------------------------------------------------------------
# Branche A : indicateurs webcam (une image)
# ---------------------------------------------------------------------------
WEBCAM_FEATURES = [
    "face_present", "no_of_face", "face_size", "face_cx", "face_cy",
    "eye_dist_ratio", "yaw_proxy", "pitch_proxy", "roll_proxy", "mouth_nose_ratio",
    "hand_count", "left_hand_x", "left_hand_y", "right_hand_x", "right_hand_y",
    "hand_face_dist", "phone_present", "phone_x", "phone_y",
    "pupils_detected", "pupil_dx", "pupil_dy",
]


def webcam_features(X: pd.DataFrame) -> pd.DataFrame:
    X = pd.DataFrame(X).astype(float)
    out = pd.DataFrame(index=X.index)
    face = (X["face_present"] > 0) & (X["face_w"] > 0)
    lx, ly, rx, ry = X["left_eye_x"], X["left_eye_y"], X["right_eye_x"], X["right_eye_y"]
    inter_eye = np.hypot(rx - lx, ry - ly)
    geo_ok = face & (inter_eye > 1.0)
    ie = inter_eye.where(geo_ok, 1.0)
    mid_x, mid_y = (lx + rx) / 2.0, (ly + ry) / 2.0

    out["face_present"] = X["face_present"]
    out["no_of_face"] = X["no_of_face"]
    out["face_size"] = (X["face_w"] / FRAME_W).where(face, 0.0)
    out["face_cx"] = ((X["face_x"] + X["face_w"] / 2.0) / FRAME_W).where(face, 0.0)
    out["face_cy"] = ((X["face_y"] + X["face_h"] / 2.0) / FRAME_H).where(face, 0.0)
    out["eye_dist_ratio"] = (inter_eye / X["face_w"].where(face, 1.0)).where(geo_ok, 0.0)
    out["yaw_proxy"] = ((X["nose_tip_x"] - mid_x) / ie).where(geo_ok, 0.0)
    out["pitch_proxy"] = ((X["nose_tip_y"] - mid_y) / ie).where(geo_ok, 0.0)
    out["roll_proxy"] = np.arctan2(ry - ly, rx - lx).where(geo_ok, 0.0)
    out["mouth_nose_ratio"] = ((X["mouth_y"] - X["nose_tip_y"]) / ie).where(geo_ok, 0.0)

    out["hand_count"] = X["hand_count"]
    for c in ("left_hand_x", "left_hand_y", "right_hand_x", "right_hand_y"):
        out[c] = X[c]
    fcx, fcy = out["face_cx"], out["face_cy"]
    far = float(np.sqrt(2.0))  # distance maximale dans le carre unite = "pas de main"
    d_left = np.hypot(X["left_hand_x"] - fcx, X["left_hand_y"] - fcy)
    d_right = np.hypot(X["right_hand_x"] - fcx, X["right_hand_y"] - fcy)
    has_left = (X["left_hand_x"] != 0) | (X["left_hand_y"] != 0)
    has_right = (X["right_hand_x"] != 0) | (X["right_hand_y"] != 0)
    d = np.minimum(d_left.where(has_left, far), d_right.where(has_right, far))
    out["hand_face_dist"] = d.where(face, far)

    out["phone_present"] = X["phone_present"]
    out["phone_x"] = (X["phone_loc_x"] / FRAME_W).where(X["phone_present"] > 0, 0.0)
    out["phone_y"] = (X["phone_loc_y"] / FRAME_H).where(X["phone_present"] > 0, 0.0)

    pl = (X["pupil_left_x"] > 0) & (X["pupil_left_y"] > 0)
    pr = (X["pupil_right_x"] > 0) & (X["pupil_right_y"] > 0)
    both = pl & pr & geo_ok
    out["pupils_detected"] = both.astype(float)
    dx = ((X["pupil_left_x"] - lx) + (X["pupil_right_x"] - rx)) / 2.0 / ie
    dy = ((X["pupil_left_y"] - ly) + (X["pupil_right_y"] - ry)) / 2.0 / ie
    out["pupil_dx"] = dx.where(both, 0.0)
    out["pupil_dy"] = dy.where(both, 0.0)
    return out[WEBCAM_FEATURES].astype(float)


class WebcamFeatures(BaseEstimator, TransformerMixin):
    def fit(self, X, y=None):
        self.feature_names_ = list(WEBCAM_FEATURES)
        return self

    def transform(self, X):
        return webcam_features(pd.DataFrame(X))

    def get_feature_names_out(self, input_features=None):
        return np.asarray(self.feature_names_, dtype=object)


class WebcamReferenceFeatures(BaseEstimator, TransformerMixin):
    """Toutes les colonnes Mendeley (modele de reference NON deployable)."""

    CATEGORICAL = {"head_pose": ["forward", "down", "left", "right", "none"],
                   "gaze_direction": ["center", "bottom_left", "bottom_right", "top_left",
                                      "top_right", "none"]}

    def fit(self, X, y=None):
        X = pd.DataFrame(X)
        self.numeric_ = [c for c in X.columns if c not in self.CATEGORICAL and c != "label"]
        self.feature_names_ = self.numeric_ + [
            f"{c}={v}" for c, vals in self.CATEGORICAL.items() for v in vals]
        return self

    def transform(self, X):
        X = pd.DataFrame(X)
        out = X[self.numeric_].astype(float).copy()
        for c, vals in self.CATEGORICAL.items():
            col = X[c].fillna("none").astype(str)
            for v in vals:
                out[f"{c}={v}"] = (col == v).astype(float)
        return out[self.feature_names_]

    def get_feature_names_out(self, input_features=None):
        return np.asarray(self.feature_names_, dtype=object)


# ---------------------------------------------------------------------------
# Libelles lisibles par un enseignant (utilises par explain())
# ---------------------------------------------------------------------------
FEATURE_LABELS_FR = {
    # branche B
    "remote": "Examen passé à distance (1 = oui)",
    "tot_question": "Nombre de questions de l'examen",
    "tot_que_attempted": "Nombre de questions répondues",
    "que_att_within_idl_time": "Questions répondues dans le temps idéal",
    "idl_time_correct_que": "Bonnes réponses données dans le temps idéal",
    "tot_correct_que": "Nombre de bonnes réponses",
    "exam_finish_time_in_sec": "Durée de la session (secondes)",
    "frac_attempted": "Part des questions répondues",
    "frac_correct": "Part de bonnes réponses (sur l'examen)",
    "acc_attempted": "Taux de réussite sur les questions répondues",
    "frac_idl": "Part des réponses données dans le temps idéal",
    "idl_corr_rate": "Taux de réussite des réponses rapides (temps idéal)",
    "frac_time_used": "Part du temps alloué utilisée",
    "sec_per_attempt": "Temps moyen par question répondue (s)",
    # branche A
    "face_present": "Visage détecté (1 = oui)",
    "no_of_face": "Nombre de visages dans l'image",
    "face_size": "Taille du visage (proximité de la caméra)",
    "face_cx": "Position horizontale du visage",
    "face_cy": "Position verticale du visage",
    "eye_dist_ratio": "Écart des yeux / largeur du visage (rotation de la tête)",
    "yaw_proxy": "Rotation de la tête gauche/droite",
    "pitch_proxy": "Inclinaison de la tête haut/bas",
    "roll_proxy": "Bascule latérale de la tête",
    "mouth_nose_ratio": "Distance bouche-nez (tête baissée/levée)",
    "hand_count": "Nombre de mains visibles",
    "left_hand_x": "Main gauche : position horizontale",
    "left_hand_y": "Main gauche : position verticale",
    "right_hand_x": "Main droite : position horizontale",
    "right_hand_y": "Main droite : position verticale",
    "hand_face_dist": "Distance main-visage",
    "phone_present": "Téléphone détecté (1 = oui)",
    "phone_x": "Téléphone : position horizontale",
    "phone_y": "Téléphone : position verticale",
    "pupils_detected": "Pupilles détectées (1 = oui)",
    "pupil_dx": "Regard : décalage horizontal des pupilles",
    "pupil_dy": "Regard : décalage vertical des pupilles",
}
