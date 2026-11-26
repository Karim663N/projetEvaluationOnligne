import numpy as np
import pytest

from examguard_ml import config, data


def _has(path):
    return path.exists()


requires_browser = pytest.mark.skipif(not _has(config.BROWSER_CSV), reason="online_exam_data.csv absent")
requires_webcam = pytest.mark.skipif(not _has(config.WEBCAM_CSV), reason="jeu Mendeley absent")
requires_keystroke = pytest.mark.skipif(not _has(config.KEYSTROKE_CSV), reason="CMU absent")
requires_artifacts = pytest.mark.skipif(
    not all(_has(config.ARTIFACTS / f) for f in ("browser_model.joblib", "webcam_model.joblib",
                                                 "fusion_config.json", "browser_predictions.npz",
                                                 "webcam_predictions.npz")),
    reason="modeles absents : lancez python -m examguard_ml.pipeline")


@pytest.fixture(scope="session")
def browser_ds():
    return data.prepare_browser()


@pytest.fixture(scope="session")
def webcam_ds():
    return data.prepare_webcam()


def to_payload(row: dict, branch: str) -> dict:
    """Ligne de DataFrame -> dict conforme au schema (types python natifs)."""
    ints = {"browser": {"tot_question", "tot_que_attempted", "que_att_within_idl_time",
                        "idl_time_correct_que", "tot_correct_que"},
            "webcam": {"face_present", "no_of_face", "hand_count", "phone_present"}}[branch]
    out = {}
    for k, v in row.items():
        if isinstance(v, str):
            out[k] = v
        elif k in ints:
            out[k] = int(v)
        else:
            out[k] = float(v)
    return out


@pytest.fixture(scope="session")
def browser_payload(browser_ds):
    return to_payload(browser_ds.X.iloc[np.flatnonzero(browser_ds.y == 1)[0]].to_dict(), "browser")


@pytest.fixture(scope="session")
def webcam_payload(webcam_ds):
    return to_payload(webcam_ds.X.iloc[0].to_dict(), "webcam")
