"""Service HTTP du module ML (FastAPI) — appele par l'application Next.js, jamais par le navigateur.

    cd ml
    python -m uvicorn service:app --host 127.0.0.1 --port 8000
    # documentation interactive : http://127.0.0.1:8000/docs

Route principale : POST /score-session — une session d'examen terminee -> score navigateur (B),
score webcam agrege (A, si des images sont fournies), fusion et explications lisibles.
Seuls des indicateurs circulent : aucune image ni video n'est envoyee ni stockee.
"""
from __future__ import annotations

import math
import sys
import time
from pathlib import Path
from typing import Literal

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from pydantic import BaseModel, ConfigDict, Field, ValidationError  # noqa: E402

import pandas as pd  # noqa: E402

import inference  # noqa: E402
from examguard_ml import states  # noqa: E402
from examguard_ml.explain import WARNING_FR  # noqa: E402
from examguard_ml.features import webcam_features  # noqa: E402
from examguard_ml.schemas import WebcamFrameFeatures  # noqa: E402

FRAME_PERIOD_S = 2.0       # l'application releve une image toutes les 2 s
_STATE_THRESHOLDS: dict | None = None


def _thresholds() -> dict:
    global _STATE_THRESHOLDS
    if _STATE_THRESHOLDS is None:
        _STATE_THRESHOLDS = states.load_thresholds()
    return _STATE_THRESHOLDS

MAX_FRAMES = 3000          # ~ 50 min a 1 image / s
TIMELINE_POINTS = 120      # points de la chronologie renvoyee a l'enseignant

app = FastAPI(
    title="ExamGuard AI — service ML",
    version="0.1.0",
    description="Scores de risque calibrés, fusion et explications SHAP. Un score n'est pas une preuve.",
)


@app.exception_handler(ValidationError)
async def _pydantic_error(_: Request, exc: ValidationError):
    return JSONResponse(status_code=422, content={"erreurs": [
        {"champ": ".".join(map(str, e["loc"])) or "(ensemble)", "message": e["msg"]} for e in exc.errors()]})


@app.exception_handler(ValueError)
async def _value_error(_: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"erreurs": [{"champ": "(requête)", "message": str(exc)}]})


# ------------------------------------------------------------------ schemas de requete
class AnswerTiming(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    seconds: float = Field(ge=0, le=86400, description="temps cumulé passé sur la question (s)")
    correct: bool


class SessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    exam_mode: Literal["remote", "center_based"] = "remote"
    tot_question: int = Field(ge=1, le=500)
    session_seconds: float = Field(ge=0, le=86400)
    answers: list[AnswerTiming] = Field(default_factory=list, max_length=500,
                                        description="une entrée par question RÉPONDUE")
    frames: list[dict] = Field(default_factory=list, max_length=MAX_FRAMES,
                               description="indicateurs webcam (WebcamFrameFeatures), dans l'ordre du temps")
    ideal_seconds: float | None = Field(default=None, ge=5, le=3600,
                                        description="temps idéal par question (défaut : 180 s, convention de l'équipe)")
    k: int = Field(default=5, ge=1, le=10, description="nombre de raisons renvoyées par branche")


class FuseRequest(BaseModel):
    sa: float = Field(ge=0, le=1)
    sb: float = Field(ge=0, le=1)
    w: float | None = Field(default=None, ge=0, le=1)


# ------------------------------------------------------------------ routes
@app.get("/health")
def health() -> dict:
    cfg = inference._fusion_config()
    return {"status": "ok",
            "modeles": {b: inference._load(b)["model_label"] for b in ("browser", "webcam")},
            "fusion": {"w_webcam": cfg["w_webcam"], "seuil": cfg["threshold_fused"], "source": cfg["source"]},
            "temps_ideal_s": inference.IDEAL_SECONDS_PER_QUESTION}


def _buckets(n: int) -> list[slice]:
    """Découpe n relevés en au plus TIMELINE_POINTS intervalles consécutifs."""
    if n <= TIMELINE_POINTS:
        return [slice(i, i + 1) for i in range(n)]
    step = n / TIMELINE_POINTS
    return [slice(int(i * step), max(int((i + 1) * step), int(i * step) + 1)) for i in range(TIMELINE_POINTS)]


def _timeline(values: list[float]) -> list[float]:
    """Risque maximal par intervalle (on ne lisse pas un pic)."""
    return [round(max(values[s]), 4) for s in _buckets(len(values))]


def _state_timeline(S: pd.DataFrame) -> list[list[str]]:
    """États présents dans chaque intervalle, alignés sur la chronologie du risque."""
    arr = S.to_numpy(dtype=bool)
    keys = list(S.columns)
    return [[keys[j] for j in range(len(keys)) if arr[s, j].any()] for s in _buckets(len(S))]


@app.post("/score-session")
def score_session(req: SessionRequest) -> dict:
    t0 = time.perf_counter()
    ideal = req.ideal_seconds or inference.IDEAL_SECONDS_PER_QUESTION
    features = inference.build_browser_features(
        req.exam_mode, req.tot_question, [a.model_dump() for a in req.answers], req.session_seconds, ideal)
    browser = {"indicateurs": features, "temps_ideal_s": ideal, "prediction": inference.predict_browser(features),
               "explication": inference.explain("browser", features, k=req.k),
               "etats": states.answer_states([a.model_dump() for a in req.answers])}

    webcam = None
    valid, invalid = [], 0
    for f in req.frames:
        try:
            valid.append(WebcamFrameFeatures.model_validate(f))
        except ValidationError:
            invalid += 1
    if valid:
        preds = inference.predict_webcam_batch(valid)
        dep = [p["probabilite_deploiement"] for p in preds]
        worst = max(range(len(preds)), key=lambda i: preds[i]["probabilite"])
        F = webcam_features(pd.DataFrame([v.model_dump() for v in valid]))
        S = states.frame_states(F, _thresholds())
        webcam = {
            "n_images": len(preds), "images_invalides": invalid,
            "probabilite_deploiement": float(sum(dep) / len(dep)),
            "max_probabilite_deploiement": float(max(dep)),
            "part_images_en_alerte": float(sum(p["alerte"] for p in preds) / len(preds)),
            "seuil_image": preds[0]["seuil"],
            "modele": preds[0]["modele"],
            "hors_domaine": sorted({w for p in preds for w in p["hors_domaine"]}),
            "chronologie": _timeline(dep),
            "etats": states.summarize(S, _thresholds(), period_s=FRAME_PERIOD_S),
            "chronologie_etats": _state_timeline(S),
            "periode_releve_s": FRAME_PERIOD_S,
            "image_la_plus_suspecte": {"index": worst, "probabilite": preds[worst]["probabilite"],
                                       "explication": inference.explain("webcam", valid[worst], k=req.k)},
        }

    pb = browser["prediction"]
    if webcam:
        fusion = inference.fuse(webcam["probabilite_deploiement"], pb["probabilite_deploiement"])
        fusion["mode"] = "webcam + navigateur"
    else:
        # sans webcam (refus ou caméra absente) : score navigateur seul, seuil de la branche B
        fusion = {"score": pb["probabilite_deploiement"], "w_webcam": 0.0, "w_navigateur": 1.0,
                  "seuil": None, "alerte": pb["alerte"], "mode": "navigateur seul",
                  "source_des_poids": "aucune image webcam : alerte = seuil de la branche navigateur",
                  "avertissement": WARNING_FR}
    return {"navigateur": browser, "webcam": webcam, "fusion": fusion,
            "images_ignorees": invalid if not valid else 0,
            "avertissement": WARNING_FR,
            "duree_ms": round(1000 * (time.perf_counter() - t0), 1)}


@app.post("/predict/browser")
def predict_browser(features: dict) -> dict:
    return inference.predict_browser(features)


@app.post("/predict/webcam")
def predict_webcam(features: dict) -> dict:
    return inference.predict_webcam(features)


@app.post("/fuse")
def fuse(req: FuseRequest) -> dict:
    return inference.fuse(req.sa, req.sb, req.w)


@app.post("/explain/{branch}")
def explain(branch: Literal["browser", "webcam"], features: dict, k: int = 5) -> dict:
    return inference.explain(branch, features, k=k)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
