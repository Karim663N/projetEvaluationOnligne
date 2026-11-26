"""États de fraude : règles correctes, calibration sans fuite, vérification sur le test, service."""
import numpy as np
import pandas as pd
import pytest

from examguard_ml import config, data, states
from examguard_ml.features import webcam_features

from .conftest import requires_artifacts, requires_webcam


@pytest.fixture(scope="module")
def thresholds():
    return states.load_thresholds()


def _frame(**over):
    base = {"face_present": 1, "no_of_face": 1, "face_x": 260, "face_y": 300, "face_w": 150, "face_h": 150,
            "left_eye_x": 305, "left_eye_y": 354, "right_eye_x": 370, "right_eye_y": 354,
            "nose_tip_x": 338, "nose_tip_y": 390, "mouth_x": 338, "mouth_y": 420,
            "hand_count": 0, "left_hand_x": 0, "left_hand_y": 0, "right_hand_x": 0, "right_hand_y": 0,
            "phone_present": 0, "phone_loc_x": 0, "phone_loc_y": 0,
            "pupil_left_x": 304, "pupil_left_y": 352, "pupil_right_x": 368, "pupil_right_y": 352}
    base.update(over)
    return base


@requires_artifacts
def test_rules_on_synthetic_frames(thresholds):
    rows = pd.DataFrame([
        _frame(),                                                  # normal
        _frame(phone_present=1, phone_loc_x=120, phone_loc_y=350),  # telephone
        _frame(no_of_face=2),                                      # deux visages
        {**{k: 0 for k in data.WEBCAM_RAW_COLUMNS}},               # aucun visage
    ])
    S = states.frame_states(webcam_features(rows), thresholds)
    assert not S.iloc[0].any()
    assert S.iloc[1]["telephone"] and S.iloc[2]["plusieurs_visages"] and S.iloc[3]["visage_absent"]
    assert not S.iloc[3]["tete_tournee"]          # pas de pose sans visage


@requires_artifacts
@requires_webcam
def test_calibration_uses_training_normals_only(webcam_ds, thresholds):
    """Recalibrer donne les mêmes seuils : déterministe, et seules les images normales d'apprentissage comptent."""
    p = np.load(config.ARTIFACTS / "webcam_predictions.npz")
    F = webcam_features(webcam_ds.X)
    t = states.calibrate(F, webcam_ds.y, webcam_ds.full, p["idx_tr"])
    for k in ("yaw", "pitch", "pupil_dx", "pupil_dy"):
        np.testing.assert_allclose(t[k], thresholds[k])
    y_shuffled_test = webcam_ds.y.copy()
    y_shuffled_test[p["idx_te"]] = 1 - y_shuffled_test[p["idx_te"]]   # changer le test ne doit rien changer
    t2 = states.calibrate(F, y_shuffled_test, webcam_ds.full, p["idx_tr"])
    np.testing.assert_allclose(t2["yaw"], t["yaw"])


@requires_artifacts
@requires_webcam
def test_states_verified_on_test(webcam_ds, thresholds):
    p = np.load(config.ARTIFACTS / "webcam_predictions.npz")
    tab = states.verify(webcam_features(webcam_ds.X), webcam_ds.y, p["idx_te"], thresholds).set_index("état")
    strong = [r for r in tab.index if any(s in r for s in ("Téléphone", "Plusieurs", "Visage absent"))]
    assert len(strong) == 3
    assert (tab.loc[strong, "images normales (test)"] == 0).all()     # jamais sur une image normale
    assert (tab["part normales"] <= 0.03).all()                       # calibration ~1 % (max observé 2,6 %)
    assert tab.loc[strong, "images triche (test)"].sum() > 100


def test_answer_states():
    r = states.answer_states([{"seconds": 5, "correct": True}, {"seconds": 5, "correct": False},
                              {"seconds": 60, "correct": True}])
    assert r["reponses_eclair"]["nombre"] == 1


@requires_artifacts
@requires_webcam
def test_service_reports_states(webcam_ds):
    TestClient = pytest.importorskip("fastapi.testclient").TestClient
    import service
    from .conftest import to_payload

    client = TestClient(service.app)
    X = webcam_ds.X
    phone = [to_payload(r, "webcam") for r in X[X.phone_present == 1].head(10).to_dict(orient="records")]
    normal = [to_payload(r, "webcam") for r in X[(webcam_ds.y == 0)].head(30).to_dict(orient="records")]
    body = {"tot_question": 20, "session_seconds": 1200,
            "answers": [{"seconds": 4, "correct": True}] * 5 + [{"seconds": 90, "correct": True}] * 10}
    r_phone = client.post("/score-session", json={**body, "frames": normal + phone}).json()
    r_norm = client.post("/score-session", json={**body, "frames": normal}).json()
    assert r_phone["webcam"]["etats"]["telephone"]["images"] == 10
    assert r_norm["webcam"]["etats"]["telephone"]["images"] == 0
    assert r_phone["webcam"]["probabilite_deploiement"] > r_norm["webcam"]["probabilite_deploiement"]
    assert len(r_phone["webcam"]["chronologie_etats"]) == len(r_phone["webcam"]["chronologie"])
    assert any("telephone" in b for b in r_phone["webcam"]["chronologie_etats"])
    assert r_phone["navigateur"]["etats"]["reponses_eclair"]["nombre"] == 5
