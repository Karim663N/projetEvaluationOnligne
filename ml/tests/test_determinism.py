"""Determinisme : meme graine = memes resultats."""
import numpy as np

from examguard_ml import train
from examguard_ml.modeling import BalancedMLP, BalancedXGB

from .conftest import requires_browser, requires_webcam


@requires_browser
def test_full_branch_training_is_deterministic(tmp_path):
    r1 = train.run_branch(train.browser_config(fast=True), out_dir=tmp_path / "a", figures=False, bootstrap=0)
    r2 = train.run_branch(train.browser_config(fast=True), out_dir=tmp_path / "b", figures=False, bootstrap=0)
    assert r1["selected"] == r2["selected"]
    for name in r1["_families"]:
        np.testing.assert_array_equal(r1["_families"][name]["_p_te"], r2["_families"][name]["_p_te"])
        assert r1["families"][name]["threshold"] == r2["families"][name]["threshold"]
        assert r1["families"][name]["test"] == r2["families"][name]["test"]


@requires_webcam
def test_webcam_models_deterministic(webcam_ds):
    X, y = webcam_ds.X.iloc[:1500], webcam_ds.y[:1500]
    for make in (lambda: BalancedXGB(n_estimators=50), lambda: BalancedMLP(hidden_layer_sizes=(16,), max_iter=50)):
        p1 = make().fit(X, y).predict_proba(X)[:, 1]
        p2 = make().fit(X, y).predict_proba(X)[:, 1]
        np.testing.assert_array_equal(p1, p2)


@requires_webcam
def test_different_seed_changes_model(webcam_ds):
    X, y = webcam_ds.X.iloc[:1500], webcam_ds.y[:1500]
    p1 = BalancedXGB(n_estimators=50, random_state=1).fit(X, y).predict_proba(X)[:, 1]
    p2 = BalancedXGB(n_estimators=50, random_state=2).fit(X, y).predict_proba(X)[:, 1]
    assert not np.array_equal(p1, p2)
