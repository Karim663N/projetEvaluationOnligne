"""Module CMU : EER correct sur des cas connus, protocole respecte, valeurs publiees reproduites."""
import numpy as np
import pytest

from examguard_ml import keystroke as K

from .conftest import requires_keystroke


def test_eer_perfect_separation():
    assert K.eer(np.arange(100) / 100, 10 + np.arange(50)) == pytest.approx(0.0)


def test_eer_identical_distributions_is_half():
    rng = np.random.default_rng(0)
    x = rng.normal(size=20000)
    assert K.eer(x[:10000], x[10000:]) == pytest.approx(0.5, abs=0.02)


def test_eer_known_overlap():
    # legitimes uniformes sur [0, 1], imposteurs sur [0,5 ; 1,5] -> EER = 0,25
    g = np.linspace(0, 1, 10001)
    i = np.linspace(0.5, 1.5, 10001)
    assert K.eer(g, i) == pytest.approx(0.25, abs=1e-3)


def test_detectors_rank_outliers():
    rng = np.random.default_rng(0)
    tr = rng.normal(size=(200, 5))
    for cls in K.DETECTORS.values():
        d = cls().fit(tr)
        assert d.score(np.full((1, 5), 5.0))[0] > d.score(np.zeros((1, 5)))[0]


@requires_keystroke
def test_protocol_split_sizes():
    df = K.data.load_keystroke_raw()
    cols = K.timing_columns(df)
    tr, g, i = K.protocol_split(df, "s002", cols)
    assert tr.shape == (200, 31) and g.shape == (200, 31) and i.shape == (250, 31)
    own = df[df.subject == "s002"]
    assert set(own.iloc[:200].sessionIndex) == {1, 2, 3, 4}       # apprentissage = sessions 1-4
    assert set(own.iloc[200:400].sessionIndex) == {5, 6, 7, 8}    # test = sessions 5-8


@requires_keystroke
def test_published_eer_reproduced():
    s = K.evaluate()["summary"]
    assert s["manhattan_scaled"]["eer_mean"] == pytest.approx(0.0962, abs=5e-4)
    assert s["mahalanobis"]["eer_mean"] == pytest.approx(0.1101, abs=5e-4)
    assert s["manhattan_scaled"]["eer_std"] == pytest.approx(0.0694, abs=5e-4)
    # valeurs de l'equipe : ecart documente <= 0,001 (script d'origine indisponible)
    assert s["manhattan_scaled"]["eer_mean"] == pytest.approx(0.0955, abs=1e-3)
    assert s["mahalanobis"]["eer_mean"] == pytest.approx(0.1097, abs=1e-3)
