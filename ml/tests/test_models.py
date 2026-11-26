"""Modeles sauvegardes : taille, latence, reproduction des predictions, stabilite."""
import time

import joblib
import numpy as np
import pytest

from examguard_ml import config, data
from examguard_ml.metrics import classification_metrics
from examguard_ml.utils import read_json

from .conftest import requires_artifacts

pytestmark = requires_artifacts
MAX_MB = 25
MAX_LATENCY_MS = {"browser": 50, "webcam": 100}


@pytest.fixture(scope="module")
def bundles():
    return {b: joblib.load(config.ARTIFACTS / f"{b}_model.joblib") for b in ("browser", "webcam")}


@pytest.fixture(scope="module")
def test_sets():
    out = {}
    for b, ds in (("browser", data.prepare_browser()), ("webcam", data.prepare_webcam())):
        p = np.load(config.ARTIFACTS / f"{b}_predictions.npz")
        out[b] = (ds.X.iloc[p["idx_te"]].reset_index(drop=True), p["y_te"], p["p_te"])
    return out


@pytest.mark.parametrize("branch", ["browser", "webcam"])
def test_model_size(branch):
    mb = (config.ARTIFACTS / f"{branch}_model.joblib").stat().st_size / 1e6
    assert mb < MAX_MB


@pytest.mark.parametrize("branch", ["browser", "webcam"])
def test_bundle_contract(bundles, branch):
    b = bundles[branch]
    for key in ("model", "threshold", "raw_columns", "feature_names", "train_prior", "versions"):
        assert key in b
    assert 0 < b["threshold"] < 1 and 0 < b["train_prior"] < 1
    meta = read_json(config.ARTIFACTS / f"{branch}_model.json")
    assert meta["model_name"] == b["model_name"]


@pytest.mark.parametrize("branch", ["browser", "webcam"])
def test_single_prediction_latency(bundles, test_sets, branch):
    X = test_sets[branch][0].iloc[[0]]
    model = bundles[branch]["model"]
    model.predict_proba(X)
    ts = []
    for _ in range(30):
        t = time.perf_counter()
        model.predict_proba(X)
        ts.append((time.perf_counter() - t) * 1000)
    assert np.median(ts) < MAX_LATENCY_MS[branch]


@pytest.mark.parametrize("branch", ["browser", "webcam"])
def test_predictions_reproduce_saved_metrics(bundles, test_sets, branch):
    X, y, p_saved = test_sets[branch]
    p = bundles[branch]["model"].predict_proba(X)[:, 1]
    np.testing.assert_allclose(p, p_saved, atol=1e-9)
    m = classification_metrics(y, p, bundles[branch]["threshold"])
    assert m["pr_auc"] == pytest.approx(bundles[branch]["metrics_test"]["pr_auc"], abs=1e-9)
    assert np.all((p >= 0) & (p <= 1))


@pytest.mark.parametrize("branch", ["browser", "webcam"])
def test_better_than_chance(bundles, branch):
    m = bundles[branch]["metrics_test"]
    assert m["pr_auc"] > 1.5 * m["prevalence"]


def test_browser_stability_small_time_perturbation(bundles, test_sets):
    """+-1 % sur la duree de session : la probabilite bouge peu pour la grande majorite des sessions."""
    X, _, _ = test_sets["browser"]
    model = bundles["browser"]["model"]
    p0 = model.predict_proba(X)[:, 1]
    rng = np.random.default_rng(config.SEED)
    Xp = X.copy()
    Xp["exam_finish_time_in_sec"] = X["exam_finish_time_in_sec"] * (1 + rng.uniform(-0.01, 0.01, len(X)))
    d = np.abs(model.predict_proba(Xp)[:, 1] - p0)
    assert np.median(d) < 0.01
    assert np.quantile(d, 0.95) < 0.10


def test_webcam_stability_small_pixel_noise(bundles, test_sets):
    """Bruit de +-1 pixel sur les points du visage (precision de MediaPipe) : peu d'effet."""
    X, _, _ = test_sets["webcam"]
    model = bundles["webcam"]["model"]
    p0 = model.predict_proba(X)[:, 1]
    rng = np.random.default_rng(config.SEED)
    Xp = X.copy()
    cols = ["face_x", "face_y", "left_eye_x", "left_eye_y", "right_eye_x", "right_eye_y",
            "nose_tip_x", "nose_tip_y", "mouth_x", "mouth_y"]
    face = Xp["face_present"] == 1
    Xp.loc[face, cols] = Xp.loc[face, cols] + rng.uniform(-1, 1, (int(face.sum()), len(cols)))
    d = np.abs(model.predict_proba(Xp)[:, 1] - p0)
    assert np.median(d) < 0.05
    assert np.quantile(d, 0.95) < 0.30
    flips = np.mean((model.predict_proba(Xp)[:, 1] >= bundles["webcam"]["threshold"])
                    != (p0 >= bundles["webcam"]["threshold"]))
    assert flips < 0.10
