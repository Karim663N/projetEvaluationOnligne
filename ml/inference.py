"""Contrat d'interface du module ML d'ExamGuard AI (a appeler depuis FastAPI, sans re-entrainer).

    from inference import predict_browser, predict_webcam, fuse, explain

    pb = predict_browser({...})            # branche B, une session
    pa = predict_webcam({...})             # branche A, une image (ou predict_webcam_session([...]))
    f = fuse(pa["probabilite_deploiement"], pb["probabilite_deploiement"])
    e = explain("browser", {...}, k=5)     # k contributions principales, JSON lisible

Les entrees sont validees par pydantic (src/examguard_ml/schemas.py) : une valeur manquante,
NaN, hors plage ou incoherente leve pydantic.ValidationError (a convertir en HTTP 422 cote API).
Les modeles sont lus dans ml/artifacts/ (ou dans $EXAMGUARD_ARTIFACTS).
"""
from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE / "src") not in sys.path:
    sys.path.insert(0, str(_HERE / "src"))

import joblib  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from examguard_ml.explain import WARNING_FR, explain_bundle  # noqa: E402
from examguard_ml.features import IDEAL_SECONDS_PER_QUESTION, session_counts  # noqa: E402
from examguard_ml.fusion import DEPLOYMENT_PRIOR, adjust_prior  # noqa: E402
from examguard_ml.fusion import fuse as _fuse  # noqa: E402
from examguard_ml.schemas import (BranchPrediction, BrowserSessionFeatures, Explanation,  # noqa: E402
                                  FusionResult, WebcamFrameFeatures)
from examguard_ml.utils import read_json  # noqa: E402

__all__ = ["build_browser_features", "predict_browser", "predict_webcam", "predict_webcam_batch",
           "predict_webcam_session", "fuse", "explain", "BrowserSessionFeatures", "WebcamFrameFeatures",
           "IDEAL_SECONDS_PER_QUESTION"]

_SCHEMAS = {"browser": BrowserSessionFeatures, "webcam": WebcamFrameFeatures}
_BRANCH_FR = {"browser": "navigateur", "webcam": "webcam"}


def _artifacts_dir() -> Path:
    return Path(os.environ.get("EXAMGUARD_ARTIFACTS", _HERE / "artifacts"))


@lru_cache(maxsize=4)
def _load(branch: str) -> dict:
    path = _artifacts_dir() / f"{branch}_model.joblib"
    if not path.exists():
        raise FileNotFoundError(f"{path} absent : lancez `python -m examguard_ml.pipeline`")
    return joblib.load(path)


@lru_cache(maxsize=1)
def _fusion_config() -> dict:
    return read_json(_artifacts_dir() / "fusion_config.json")


def _validate(branch: str, features):
    schema = _SCHEMAS[branch]
    return features if isinstance(features, schema) else schema.model_validate(features)


def _predict_many(branch: str, objs: list) -> list[dict]:
    """Predictions vectorisees pour des observations deja validees (un seul appel au modele)."""
    bundle = _load(branch)
    X = pd.DataFrame([o.model_dump() for o in objs])[bundle["raw_columns"]]
    proba = bundle["model"].predict_proba(X)[:, 1]
    p_dep = adjust_prior(proba, bundle["train_prior"], DEPLOYMENT_PRIOR)
    version = f"{bundle['branch']}-{bundle['model_name']}-{bundle['trained_at']}"
    return [BranchPrediction(
        branche=_BRANCH_FR[branch],
        probabilite=float(p),
        probabilite_deploiement=float(pd_),
        prevalence_deploiement=DEPLOYMENT_PRIOR,
        seuil=float(bundle["threshold"]),
        alerte=bool(p >= bundle["threshold"]),
        modele=bundle["model_label"],
        version=version,
        hors_domaine=o.out_of_domain(),
    ).model_dump() for o, p, pd_ in zip(objs, proba, np.atleast_1d(p_dep))]


def _predict(branch: str, features) -> dict:
    return _predict_many(branch, [_validate(branch, features)])[0]


def build_browser_features(exam_mode: str, tot_question: int, answers: list,
                           session_seconds: float, ideal_seconds: float = IDEAL_SECONDS_PER_QUESTION) -> dict:
    """Calcule les 7 indicateurs de la branche B puis les valide.

    answers : une entree par question REPONDUE, {"seconds": temps cumule, "correct": bool}.
    ideal_seconds : temps ideal par question (defaut : convention de l'equipe, 180 s). L'application peut
    fournir un temps ideal adaptatif (mediane des temps de reponse de l'examen), cf. reports/fraud_states.md.
    """
    counts = session_counts(exam_mode, tot_question, answers, session_seconds, ideal_seconds=ideal_seconds)
    return BrowserSessionFeatures.model_validate(counts).model_dump()


def predict_browser(features) -> dict:
    """Branche B : features = dict conforme a BrowserSessionFeatures (une session)."""
    return _predict("browser", features)


def predict_webcam(features) -> dict:
    """Branche A : features = dict conforme a WebcamFrameFeatures (une image)."""
    return _predict("webcam", features)


def predict_webcam_batch(frames: list) -> list[dict]:
    """Branche A pour plusieurs images d'un coup (vectorise : ~100 fois plus rapide qu'une boucle).
    Leve ValidationError si une image est invalide."""
    if not frames:
        return []
    return _predict_many("webcam", [_validate("webcam", f) for f in frames])


def predict_webcam_session(frames: list) -> dict:
    """Agrege plusieurs images d'une session : moyenne des probabilites de deploiement,
    part des images au-dessus du seuil de la branche, maximum."""
    if not frames:
        raise ValueError("aucune image")
    preds = predict_webcam_batch(frames)
    pd_ = np.array([p["probabilite_deploiement"] for p in preds])
    return {"n_images": len(preds), "probabilite_deploiement": float(pd_.mean()),
            "max_probabilite_deploiement": float(pd_.max()),
            "part_images_en_alerte": float(np.mean([p["alerte"] for p in preds])),
            "hors_domaine": sorted({w for p in preds for w in p["hors_domaine"]})}


def fuse(sa: float, sb: float, w: float | None = None) -> dict:
    """Score fusionne = w * sa (webcam) + (1 - w) * sb (navigateur).
    sa et sb doivent etre des probabilites a la MEME prevalence (champ probabilite_deploiement).
    w par defaut : artifacts/fusion_config.json (choisi sur paires SIMULEES)."""
    for name, v in (("sa", sa), ("sb", sb)):
        if v is None or not np.isfinite(v) or not 0.0 <= float(v) <= 1.0:
            raise ValueError(f"{name} doit etre une probabilite dans [0, 1]")
    cfg = _fusion_config()
    w = cfg["w_webcam"] if w is None else float(w)
    score = float(_fuse(sa, sb, w))
    return FusionResult(
        score=score, w_webcam=w, w_navigateur=round(1 - w, 6), seuil=float(cfg["threshold_fused"]),
        alerte=bool(score >= cfg["threshold_fused"]), source_des_poids=cfg["source"],
        avertissement=WARNING_FR,
    ).model_dump()


def explain(branch: str, features, k: int = 5) -> dict:
    """k contributions SHAP principales pour UNE observation de la branche 'browser' ou 'webcam'."""
    if branch not in _SCHEMAS:
        raise ValueError("branch doit valoir 'browser' ou 'webcam'")
    if not 1 <= int(k) <= 30:
        raise ValueError("k doit etre entre 1 et 30")
    obj = _validate(branch, features)
    bundle = _load(branch)
    X = pd.DataFrame([obj.model_dump()])[bundle["raw_columns"]]
    return Explanation.model_validate(explain_bundle(bundle, X, k=int(k))).model_dump()


if __name__ == "__main__":  # demonstration rapide
    import json

    session = {"exam_mode": "remote", "tot_question": 20, "tot_que_attempted": 19,
               "que_att_within_idl_time": 18, "idl_time_correct_que": 17, "tot_correct_que": 18,
               "exam_finish_time_in_sec": 900}
    print(json.dumps(predict_browser(session), indent=2, ensure_ascii=False))
    print(json.dumps(explain("browser", session, k=3), indent=2, ensure_ascii=False))
