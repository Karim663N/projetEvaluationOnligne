"""Donnees et construction des variables."""
import numpy as np
import pandas as pd
import pytest

from examguard_ml import data
from examguard_ml.features import (BROWSER_FEATURE_SETS, WEBCAM_FEATURES, BrowserFeatures,
                                   browser_features, webcam_features)

from .conftest import requires_browser, requires_webcam


@requires_browser
def test_browser_dataset(browser_ds):
    assert len(browser_ds.y) == 1600 and browser_ds.y.sum() == 77
    assert list(browser_ds.X.columns) == data.BROWSER_RAW_COLUMNS
    assert "student_name" not in browser_ds.X.columns          # identifiant jamais utilise
    assert len(set(browser_ds.groups)) == len(browser_ds.groups)  # 1 ligne = 1 participant


@requires_webcam
def test_webcam_dataset(webcam_ds):
    assert not webcam_ds.full.duplicated().any()               # doublons retires
    assert len(webcam_ds.y) == 5500 - 76
    assert list(webcam_ds.X.columns) == data.WEBCAM_RAW_COLUMNS
    for excluded in data.WEBCAM_EXCLUDED:                       # parite : colonnes exclues
        assert excluded not in webcam_ds.X.columns
    assert np.all(np.diff(webcam_ds.groups) >= 0)               # blocs contigus et ordonnes


def test_browser_features_values():
    X = pd.DataFrame([{"exam_mode": "remote", "tot_question": 20, "tot_que_attempted": 10,
                       "que_att_within_idl_time": 5, "idl_time_correct_que": 4, "tot_correct_que": 8,
                       "exam_finish_time_in_sec": 1800}])
    f = browser_features(X).iloc[0]
    assert f["remote"] == 1 and f["frac_attempted"] == 0.5 and f["frac_correct"] == 0.4
    assert f["acc_attempted"] == 0.8 and f["frac_idl"] == 0.5 and f["idl_corr_rate"] == 0.8
    assert f["frac_time_used"] == pytest.approx(1800 / 3600) and f["sec_per_attempt"] == 180


def test_browser_feature_sets_exclude_what_they_claim():
    assert not {"que_att_within_idl_time", "idl_time_correct_que", "frac_idl", "idl_corr_rate"} \
        & set(BROWSER_FEATURE_SETS["sans_temps_ideal"])
    assert not {"tot_correct_que", "idl_time_correct_que", "frac_correct", "acc_attempted",
                "idl_corr_rate"} & set(BROWSER_FEATURE_SETS["sans_correction"])
    t = BrowserFeatures("complet").fit(None)
    assert list(t.get_feature_names_out()) == BROWSER_FEATURE_SETS["complet"]


@requires_webcam
def test_webcam_features_finite(webcam_ds):
    F = webcam_features(webcam_ds.X)
    assert list(F.columns) == WEBCAM_FEATURES
    assert np.isfinite(F.to_numpy()).all()


@requires_webcam
def test_webcam_geometry_translation_invariant(webcam_ds):
    """Les proxies de pose ne dependent pas de la position du visage dans l'image."""
    X = webcam_ds.X[webcam_ds.X.face_present == 1].head(200).copy()
    shifted = X.copy()
    px = ["face_x", "left_eye_x", "right_eye_x", "nose_tip_x", "mouth_x"]
    shifted[px] += 25.0
    shifted.loc[shifted.pupil_left_x > 0, "pupil_left_x"] += 25.0
    shifted.loc[shifted.pupil_right_x > 0, "pupil_right_x"] += 25.0
    a, b = webcam_features(X), webcam_features(shifted)
    for c in ("yaw_proxy", "pitch_proxy", "roll_proxy", "eye_dist_ratio", "mouth_nose_ratio",
              "pupil_dx", "pupil_dy", "face_size"):
        np.testing.assert_allclose(a[c], b[c], atol=1e-9, err_msg=c)


def test_webcam_features_no_face_is_safe():
    row = {c: 0.0 for c in data.WEBCAM_RAW_COLUMNS}
    F = webcam_features(pd.DataFrame([row]))
    assert np.isfinite(F.to_numpy()).all()
    assert F.iloc[0]["face_present"] == 0 and F.iloc[0]["hand_face_dist"] == pytest.approx(np.sqrt(2))
