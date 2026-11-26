"""Absence de fuite : groupes disjoints, decoupages reproductibles, pretraitement ajuste sur l'apprentissage."""
import numpy as np
import pytest
from sklearn.linear_model import LogisticRegression

from examguard_ml import config, train
from examguard_ml.features import BrowserFeatures
from examguard_ml.modeling import ModelSpec, leakage_checks, make_pipeline

from .conftest import requires_artifacts, requires_browser, requires_webcam


@requires_browser
def test_browser_split_disjoint_and_stratified(browser_ds):
    tr, te = train.browser_test_split(browser_ds)
    assert not set(tr) & set(te)
    assert not set(browser_ds.groups[tr]) & set(browser_ds.groups[te])
    assert abs(browser_ds.y[tr].mean() - browser_ds.y[te].mean()) < 0.01
    splits = train.browser_cv_splits(browser_ds.X.iloc[tr], browser_ds.y[tr], browser_ds.groups[tr])
    for _, a, b in splits:
        assert not set(a) & set(b)


@requires_webcam
def test_webcam_split_by_blocks(webcam_ds):
    tr, te = train.group_test_split(webcam_ds)
    assert not set(webcam_ds.groups[tr]) & set(webcam_ds.groups[te])   # aucun bloc a cheval
    g_tr = webcam_ds.groups[tr]
    for _, a, b in train.group_cv_splits(webcam_ds.X.iloc[tr], webcam_ds.y[tr], g_tr):
        assert not set(g_tr[a]) & set(g_tr[b])
    chk = leakage_checks(webcam_ds.X.iloc[tr], webcam_ds.X.iloc[te], webcam_ds.groups[tr], webcam_ds.groups[te])
    assert chk["groupes_communs_train_test"] == 0
    assert chk["lignes_test_identiques_a_une_ligne_train"] <= 10  # lignes identiques sur les colonnes reproductibles (5 observees), documentees


@requires_browser
@requires_webcam
def test_splits_are_reproducible(browser_ds, webcam_ds):
    a1, b1 = train.browser_test_split(browser_ds)
    a2, b2 = train.browser_test_split(browser_ds)
    np.testing.assert_array_equal(b1, b2)
    c1, d1 = train.group_test_split(webcam_ds)
    c2, d2 = train.group_test_split(webcam_ds)
    np.testing.assert_array_equal(d1, d2)


@requires_browser
def test_scaler_fitted_on_train_only(browser_ds):
    tr, te = train.browser_test_split(browser_ds)
    spec = ModelSpec("logreg", "LR", lambda **p: LogisticRegression(max_iter=2000, **p), [{}], True, 0)
    pipe = make_pipeline(BrowserFeatures(), spec, {}).fit(browser_ds.X.iloc[tr], browser_ds.y[tr])
    F_tr = BrowserFeatures().fit(None).transform(browser_ds.X.iloc[tr])
    np.testing.assert_allclose(pipe.named_steps["scaler"].mean_, F_tr.mean().to_numpy(), rtol=1e-10)


@requires_artifacts
@requires_browser
def test_saved_splits_match_and_are_disjoint(browser_ds, webcam_ds):
    for name, ds, split in (("browser", browser_ds, train.browser_test_split),
                            ("webcam", webcam_ds, train.group_test_split)):
        p = np.load(config.ARTIFACTS / f"{name}_predictions.npz")
        tr, te = split(ds)
        np.testing.assert_array_equal(np.sort(p["idx_te"]), np.sort(te))
        assert not set(p["idx_tr"]) & set(p["idx_te"])
        assert not set(ds.groups[p["idx_tr"]]) & set(ds.groups[p["idx_te"]])


@requires_artifacts
def test_threshold_not_chosen_on_test():
    """Le seuil sauvegarde doit etre celui qui maximise le F1 sur les predictions hors-echantillon."""
    import joblib
    from examguard_ml.metrics import best_f1_threshold

    for name in ("browser", "webcam"):
        b = joblib.load(config.ARTIFACTS / f"{name}_model.joblib")
        p = np.load(config.ARTIFACTS / f"{name}_predictions.npz")
        assert b["threshold"] == pytest.approx(best_f1_threshold(p["y_tr"], p["p_oof"]))
