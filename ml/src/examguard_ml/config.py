"""Chemins, graine aleatoire et constantes partagees."""
from __future__ import annotations

import os
import random
from pathlib import Path

import numpy as np

SEED = 42

ML_ROOT = Path(__file__).resolve().parents[2]
DATA_RAW = ML_ROOT / "data" / "raw"
DATA_PROCESSED = ML_ROOT / "data" / "processed"
ARTIFACTS = ML_ROOT / "artifacts"
REPORTS = ML_ROOT / "reports"
FIGURES = REPORTS / "figures"

BROWSER_CSV = DATA_RAW / "online_exam_data.csv"
WEBCAM_DIR = DATA_RAW / "mendeley"
WEBCAM_CSV = WEBCAM_DIR / "students_suspicious_behaviors_v1.csv"
KEYSTROKE_CSV = DATA_RAW / "DSL-StrongPasswordData.csv"

# Source officielle du jeu webcam (API publique Mendeley Data, licence CC BY 4.0)
MENDELEY_DATASET_ID = "39xs8th543"
MENDELEY_FILES = {
    "students_suspicious_behaviors_v1.csv": {
        "file_id": "e27dd7c5-d672-4849-a41e-83cc3be681c2",
        "sha256": "840e3bce713926ecbf61445b28b71f90ec02d1892d42e7d51a0d1ceb9a433325",
    },
    "Table_1.docx": {
        "file_id": "4f80660d-1192-466f-96bf-e68c5ee8964c",
        "sha256": "10511e53817c94a277d3f7d9ed80634d147fc5be5c6be2768ff75f7be07ba2dc",
    },
    "Table_2.docx": {
        "file_id": "d698d75b-a954-44ee-949a-9599d441acfa",
        "sha256": "860171fafa718de2aeedac46af1f36b4861ee685a403f900b8ca9d3e9664b65a",
    },
}

# Empreintes des fichiers locaux tels que recus (controle d'integrite, pas de telechargement)
LOCAL_SHA256 = {
    "online_exam_data.csv": "7043dc7d8aa98c7bf5cba591c96f9fe94380d7cca2a76f655bb3fe1196baf5b1",
    "DSL-StrongPasswordData.csv": "b11d23538b1865fa6ecf4e8b78567caa312e9c1027604bb022fcc6ad7eaa7a33",
}


def set_seed(seed: int = SEED) -> None:
    """Fixe toutes les graines utilisees (python, numpy, hash)."""
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)


def ensure_dirs() -> None:
    for d in (DATA_RAW, DATA_PROCESSED, ARTIFACTS, REPORTS, FIGURES):
        d.mkdir(parents=True, exist_ok=True)
