"""Schemas d'entree / sortie (pydantic v2) du contrat d'interface ML.

Deux niveaux de controle :
- erreurs (ValidationError) : valeur manquante, NaN/inf, type faux, hors plage physique,
  incoherence logique (ex. plus de bonnes reponses que de reponses) ;
- avertissements « hors_domaine » (pas d'erreur) : valeur valide mais absente du domaine
  d'entrainement — la prediction est alors moins fiable et doit etre signalee a l'enseignant.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

_STRICT = ConfigDict(extra="forbid", allow_inf_nan=False, frozen=True)

# Domaine observe a l'entrainement (online_exam_data.csv)
BROWSER_TRAINING_QUESTION_COUNTS = (20, 30, 40, 50)
SECONDS_PER_QUESTION_ALLOTTED = 180  # tot_exam_time = 3 min x tot_question dans 100 % du jeu


class BrowserSessionFeatures(BaseModel):
    """Indicateurs d'UNE session d'examen (branche B). Calcules par l'application, pas par l'etudiant."""

    model_config = _STRICT
    exam_mode: Literal["remote", "center_based"]
    tot_question: int = Field(ge=1, le=500, description="nombre de questions de l'examen")
    tot_que_attempted: int = Field(ge=0, le=500, description="questions repondues")
    que_att_within_idl_time: int = Field(
        ge=0, le=500, description="repondues en <= 180 s cumulees (convention equipe : temps ideal = 3 min)")
    idl_time_correct_que: int = Field(
        ge=0, le=500, description="correctes ET repondues en <= 180 s cumulees")
    tot_correct_que: int = Field(ge=0, le=500, description="bonnes reponses")
    exam_finish_time_in_sec: float = Field(ge=0, le=86400, description="duree de la session (s)")

    @model_validator(mode="after")
    def _coherence(self):
        errs = []
        if self.tot_que_attempted > self.tot_question:
            errs.append("tot_que_attempted > tot_question")
        if self.que_att_within_idl_time > self.tot_que_attempted:
            errs.append("que_att_within_idl_time > tot_que_attempted")
        if self.idl_time_correct_que > self.que_att_within_idl_time:
            errs.append("idl_time_correct_que > que_att_within_idl_time")
        if self.tot_correct_que > self.tot_que_attempted:
            errs.append("tot_correct_que > tot_que_attempted")
        if self.idl_time_correct_que > self.tot_correct_que:
            errs.append("idl_time_correct_que > tot_correct_que")
        if errs:
            raise ValueError("incoherence : " + "; ".join(errs))
        return self

    def out_of_domain(self) -> list[str]:
        w = []
        if self.tot_question not in BROWSER_TRAINING_QUESTION_COUNTS:
            w.append(f"tot_question={self.tot_question} absent de l'entrainement {BROWSER_TRAINING_QUESTION_COUNTS}")
        if self.exam_finish_time_in_sec > self.tot_question * SECONDS_PER_QUESTION_ALLOTTED:
            w.append("duree superieure au temps alloue (3 min/question) : jamais observe a l'entrainement")
        if self.tot_que_attempted < 10:
            w.append("moins de 10 questions repondues : jamais observe a l'entrainement")
        return w


class WebcamFrameFeatures(BaseModel):
    """Indicateurs MediaPipe d'UNE image (branche A), en pixels d'un repere 640x480 (mains : 0-1).
    Mettre 0 pour un element non detecte (convention du jeu Mendeley)."""

    model_config = _STRICT
    face_present: Literal[0, 1]
    no_of_face: int = Field(ge=0, le=10)
    face_x: float = Field(ge=-640, le=1280)
    face_y: float = Field(ge=-480, le=960)
    face_w: float = Field(ge=0, le=1280)
    face_h: float = Field(ge=0, le=960)
    left_eye_x: float = Field(ge=-640, le=1280)
    left_eye_y: float = Field(ge=-480, le=960)
    right_eye_x: float = Field(ge=-640, le=1280)
    right_eye_y: float = Field(ge=-480, le=960)
    nose_tip_x: float = Field(ge=-640, le=1280)
    nose_tip_y: float = Field(ge=-480, le=960)
    mouth_x: float = Field(ge=-640, le=1280)
    mouth_y: float = Field(ge=-480, le=960)
    hand_count: int = Field(ge=0, le=4)
    left_hand_x: float = Field(ge=-0.5, le=1.5)
    left_hand_y: float = Field(ge=-0.5, le=1.5)
    right_hand_x: float = Field(ge=-0.5, le=1.5)
    right_hand_y: float = Field(ge=-0.5, le=1.5)
    phone_present: Literal[0, 1]
    phone_loc_x: float = Field(ge=0, le=640)
    phone_loc_y: float = Field(ge=0, le=480)
    pupil_left_x: float = Field(ge=0, le=640)
    pupil_left_y: float = Field(ge=0, le=480)
    pupil_right_x: float = Field(ge=0, le=640)
    pupil_right_y: float = Field(ge=0, le=480)

    @model_validator(mode="after")
    def _coherence(self):
        if self.face_present == 1 and self.no_of_face < 1:
            raise ValueError("incoherence : face_present=1 mais no_of_face=0")
        if self.face_present == 0 and self.no_of_face > 0:
            raise ValueError("incoherence : face_present=0 mais no_of_face>0")
        return self

    def out_of_domain(self) -> list[str]:
        w = []
        if self.no_of_face > 2:
            w.append("plus de 2 visages : jamais observe a l'entrainement")
        if self.hand_count > 3:
            w.append("plus de 3 mains : jamais observe a l'entrainement")
        if self.phone_present == 0 and (self.phone_loc_x or self.phone_loc_y):
            w.append("position de telephone fournie alors que phone_present=0")
        return w


class BranchPrediction(BaseModel):
    branche: Literal["navigateur", "webcam"]
    probabilite: float = Field(ge=0, le=1, description="probabilite calibree (prevalence du jeu d'entrainement)")
    probabilite_deploiement: float = Field(ge=0, le=1, description="ramenee a la prevalence de deploiement")
    prevalence_deploiement: float
    seuil: float
    alerte: bool = Field(description="probabilite >= seuil de la branche (indicatif ; l'alerte finale vient de la fusion)")
    modele: str
    version: str
    hors_domaine: list[str] = []


class FusionResult(BaseModel):
    score: float = Field(ge=0, le=1)
    w_webcam: float = Field(ge=0, le=1)
    w_navigateur: float = Field(ge=0, le=1)
    seuil: float
    alerte: bool
    source_des_poids: str
    avertissement: str


class Contribution(BaseModel):
    variable: str
    libelle: str
    valeur: float
    contribution: float
    direction: Literal["augmente le risque", "diminue le risque", "neutre"]
    texte: str


class Explanation(BaseModel):
    branche: str
    probabilite: float = Field(ge=0, le=1)
    seuil: float
    alerte: bool
    valeur_de_base: float
    unite_contribution: str
    contributions: list[Contribution]
    avertissement: str
