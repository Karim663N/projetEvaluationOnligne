"""Convention de l'equipe : temps ideal = 180 s cumulees par question (branche B)."""
import pytest
from pydantic import ValidationError

import inference
from examguard_ml.features import IDEAL_SECONDS_PER_QUESTION, session_counts
from examguard_ml.schemas import SECONDS_PER_QUESTION_ALLOTTED

from .conftest import requires_artifacts

ANSWERS = [
    {"seconds": 30, "correct": True},     # rapide, correcte
    {"seconds": 180, "correct": True},    # limite : compte comme dans le temps ideal
    {"seconds": 181, "correct": True},    # juste au-dessus : hors temps ideal
    {"seconds": 90, "correct": False},    # rapide, fausse
    {"seconds": 600, "correct": False},   # lente, fausse
]


def test_convention_value():
    assert IDEAL_SECONDS_PER_QUESTION == 180
    assert IDEAL_SECONDS_PER_QUESTION == SECONDS_PER_QUESTION_ALLOTTED


def test_session_counts():
    c = session_counts("remote", 20, ANSWERS, 1500)
    assert c == {"exam_mode": "remote", "tot_question": 20, "tot_que_attempted": 5,
                 "que_att_within_idl_time": 3, "idl_time_correct_que": 2, "tot_correct_que": 3,
                 "exam_finish_time_in_sec": 1500.0}


def test_session_counts_rejects_bad_input():
    with pytest.raises(ValueError):
        session_counts("remote", 3, ANSWERS, 1500)                      # plus de reponses que de questions
    with pytest.raises(ValueError):
        session_counts("remote", 20, [{"seconds": -1, "correct": True}], 10)
    with pytest.raises(ValueError):
        session_counts("remote", 20, [{"seconds": float("nan"), "correct": True}], 10)


def test_build_browser_features_validates():
    f = inference.build_browser_features("center_based", 20, ANSWERS, 1500)
    assert f["que_att_within_idl_time"] == 3
    with pytest.raises(ValidationError):
        inference.build_browser_features("online", 20, ANSWERS, 1500)  # mode inconnu


@requires_artifacts
def test_build_then_predict():
    f = inference.build_browser_features("remote", 20, ANSWERS * 2, 1500)
    p = inference.predict_browser(f)
    assert 0 <= p["probabilite"] <= 1
