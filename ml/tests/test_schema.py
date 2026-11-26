"""Schema d'entree : valeurs valides acceptees, manquantes / hors plage / incoherentes refusees."""
import math

import pytest
from pydantic import ValidationError

from examguard_ml.schemas import BrowserSessionFeatures, WebcamFrameFeatures

from .conftest import requires_browser, requires_webcam, to_payload

VALID_SESSION = {"exam_mode": "remote", "tot_question": 20, "tot_que_attempted": 18,
                 "que_att_within_idl_time": 10, "idl_time_correct_que": 7, "tot_correct_que": 12,
                 "exam_finish_time_in_sec": 2400.0}


def test_valid_session_accepted():
    s = BrowserSessionFeatures.model_validate(VALID_SESSION)
    assert s.out_of_domain() == []


@pytest.mark.parametrize("field", list(VALID_SESSION))
def test_missing_field_rejected(field):
    payload = {k: v for k, v in VALID_SESSION.items() if k != field}
    with pytest.raises(ValidationError):
        BrowserSessionFeatures.model_validate(payload)


@pytest.mark.parametrize("field,value", [
    ("tot_question", 0), ("tot_question", -5), ("tot_que_attempted", -1),
    ("exam_finish_time_in_sec", -1.0), ("exam_finish_time_in_sec", math.nan),
    ("exam_finish_time_in_sec", math.inf), ("exam_mode", "online"), ("tot_question", None),
    ("tot_question", "vingt"),
])
def test_out_of_range_or_wrong_type_rejected(field, value):
    with pytest.raises(ValidationError):
        BrowserSessionFeatures.model_validate({**VALID_SESSION, field: value})


@pytest.mark.parametrize("patch", [
    {"tot_que_attempted": 25},                              # plus de reponses que de questions
    {"tot_correct_que": 19},                                # plus de bonnes reponses que de reponses
    {"que_att_within_idl_time": 19},                        # > repondues
    {"idl_time_correct_que": 11},                           # > dans le temps ideal
    {"idl_time_correct_que": 10, "tot_correct_que": 9},     # rapides correctes > correctes
])
def test_incoherent_session_rejected(patch):
    with pytest.raises(ValidationError):
        BrowserSessionFeatures.model_validate({**VALID_SESSION, **patch})


def test_unknown_field_rejected():
    with pytest.raises(ValidationError):
        BrowserSessionFeatures.model_validate({**VALID_SESSION, "tab_switches": 3})


def test_out_of_domain_warnings():
    s = BrowserSessionFeatures.model_validate({**VALID_SESSION, "tot_question": 25,
                                               "tot_que_attempted": 5, "que_att_within_idl_time": 3,
                                               "idl_time_correct_que": 2, "tot_correct_que": 4,
                                               "exam_finish_time_in_sec": 99999 % 86400})
    w = s.out_of_domain()
    assert len(w) == 3


@requires_browser
def test_every_training_session_is_valid(browser_ds):
    for row in browser_ds.X.to_dict(orient="records"):
        BrowserSessionFeatures.model_validate(to_payload(row, "browser"))


@requires_webcam
def test_every_training_frame_is_valid(webcam_ds):
    for row in webcam_ds.X.to_dict(orient="records"):
        WebcamFrameFeatures.model_validate(to_payload(row, "webcam"))


@requires_webcam
def test_webcam_invalid_inputs(webcam_payload):
    WebcamFrameFeatures.model_validate(webcam_payload)
    for patch in ({"face_present": 2}, {"hand_count": -1}, {"left_hand_x": 3.0},
                  {"phone_loc_x": 900.0}, {"face_w": math.nan}, {"face_present": 1, "no_of_face": 0},
                  {"face_present": 0, "no_of_face": 1}):
        with pytest.raises(ValidationError):
            WebcamFrameFeatures.model_validate({**webcam_payload, **patch})
    missing = dict(webcam_payload)
    missing.pop("nose_tip_x")
    with pytest.raises(ValidationError):
        WebcamFrameFeatures.model_validate(missing)
