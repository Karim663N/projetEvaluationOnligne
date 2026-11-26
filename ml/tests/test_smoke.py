"""Test minimal : le paquet s'importe et les dossiers attendus existent."""
import examguard_ml
from examguard_ml import config


def test_package_imports():
    assert examguard_ml.__version__


def test_project_layout():
    for d in ("data", "src", "tests", "artifacts", "reports", "notebooks"):
        assert (config.ML_ROOT / d).is_dir(), d
