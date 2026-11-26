"""Contrat d'interface inference.py : predict_browser, predict_webcam, fuse, explain."""
import json

import numpy as np
import pytest
from pydantic import ValidationError

import inference
from examguard_ml.fusion import adjust_prior, fuse, simulate

from .conftest import requires_artifacts


def test_adjust_prior_properties():
    p = np.linspace(0.01, 0.99, 50)
    np.testing.assert_allclose(adjust_prior(p, 0.3, 0.3), p, atol=1e-9)
    q = adjust_prior(p, 0.5, 0.05)
    assert np.all(np.diff(q) > 0) and np.all(q < p)


def test_fuse_math():
    assert fuse(0.8, 0.2, 1.0) == pytest.approx(0.8)
    assert fuse(0.8, 0.2, 0.0) == pytest.approx(0.2)
    assert fuse(0.8, 0.2, 0.25) == pytest.approx(0.35)
    with pytest.raises(ValueError):
        fuse(0.5, 0.5, 1.5)


def test_simulation_prevalence_and_labels():
    rng = np.random.default_rng(0)
    pools = {"A1": np.full(10, 0.9), "A0": np.full(10, 0.1), "B1": np.full(10, 0.8), "B0": np.full(10, 0.2)}
    for sc in ("concordant", "partiel"):
        sa, sb, y = simulate(pools, 1000, 0.05, sc, rng)
        assert y.sum() == 50 and len(y) == 1000
        assert np.all(sa[y == 0] == 0.1) and np.all(sb[y == 0] == 0.2)
    sa, sb, y = simulate(pools, 1000, 0.05, "concordant", rng)
    assert np.all(sa[y == 1] == 0.9) and np.all(sb[y == 1] == 0.8)


@requires_artifacts
def test_predict_browser(browser_payload):
    out = inference.predict_browser(browser_payload)
    assert out["branche"] == "navigateur"
    assert 0 <= out["probabilite"] <= 1 and 0 <= out["probabilite_deploiement"] <= 1
    assert isinstance(out["alerte"], bool) and out["hors_domaine"] == []
    json.dumps(out)


@requires_artifacts
def test_predict_webcam_and_session(webcam_payload):
    out = inference.predict_webcam(webcam_payload)
    assert out["branche"] == "webcam" and 0 <= out["probabilite"] <= 1
    # prevalence d'apprentissage ~47 % -> la probabilite de deploiement (5 %) est plus basse
    assert out["probabilite_deploiement"] <= out["probabilite"] + 1e-12
    s = inference.predict_webcam_session([webcam_payload, webcam_payload])
    assert s["n_images"] == 2 and s["probabilite_deploiement"] == pytest.approx(out["probabilite_deploiement"])


@requires_artifacts
def test_invalid_inputs_raise(browser_payload, webcam_payload):
    bad = dict(browser_payload)
    bad.pop("tot_question")
    with pytest.raises(ValidationError):
        inference.predict_browser(bad)
    with pytest.raises(ValidationError):
        inference.predict_browser({**browser_payload, "exam_finish_time_in_sec": float("nan")})
    with pytest.raises(ValidationError):
        inference.predict_webcam({**webcam_payload, "hand_count": 9})
    with pytest.raises(ValueError):
        inference.predict_webcam_session([])
    with pytest.raises(ValueError):
        inference.explain("audio", browser_payload)


@requires_artifacts
def test_fuse_contract():
    f = inference.fuse(0.9, 0.1)
    assert 0 <= f["score"] <= 1 and f["w_webcam"] + f["w_navigateur"] == pytest.approx(1)
    assert "SIMULATION" in f["source_des_poids"]
    assert inference.fuse(0.9, 0.1, w=1.0)["score"] == pytest.approx(0.9)
    for bad in ((1.2, 0.1), (0.5, -0.1), (float("nan"), 0.5)):
        with pytest.raises(ValueError):
            inference.fuse(*bad)


@requires_artifacts
@pytest.mark.parametrize("branch", ["browser", "webcam"])
def test_explain_contract(branch, browser_payload, webcam_payload):
    payload = browser_payload if branch == "browser" else webcam_payload
    e = inference.explain(branch, payload, k=4)
    assert len(e["contributions"]) == 4
    contribs = [abs(c["contribution"]) for c in e["contributions"]]
    assert contribs == sorted(contribs, reverse=True)
    for c in e["contributions"]:
        assert set(c) == {"variable", "libelle", "valeur", "contribution", "direction", "texte"}
        assert c["direction"] in ("augmente le risque", "diminue le risque", "neutre")
        assert (c["contribution"] > 0) == (c["direction"] == "augmente le risque")
    assert "preuve" in e["avertissement"]
    p = inference.predict_browser(payload) if branch == "browser" else inference.predict_webcam(payload)
    assert e["probabilite"] == pytest.approx(p["probabilite"], abs=1e-5)
    json.dumps(e, ensure_ascii=False)


@requires_artifacts
def test_explain_shap_additivity(browser_payload):
    """Pour XGBoost (log-odds) : base + somme de toutes les contributions = sortie brute du modele."""
    import joblib
    import pandas as pd
    from examguard_ml import config
    from examguard_ml.explain import shap_values

    b = joblib.load(config.ARTIFACTS / "browser_model.joblib")
    X = pd.DataFrame([browser_payload])[b["raw_columns"]]
    sv, base, _, unit = shap_values(b, X)
    raw = b["model"].raw_score(X)[0]
    if "log-odds" in unit:
        assert base + sv.sum() == pytest.approx(np.log(raw / (1 - raw)), abs=1e-3)
    else:
        assert base + sv.sum() == pytest.approx(raw, abs=1e-3)
