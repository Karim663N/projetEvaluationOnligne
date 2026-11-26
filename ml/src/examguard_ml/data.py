"""Chargement, verification et nettoyage des trois jeux de donnees.

Usage CLI :
    python -m examguard_ml.data --download   # telecharge le jeu Mendeley (CC BY 4.0)
    python -m examguard_ml.data --check      # verifie la presence et le SHA-256 des fichiers
"""
from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from . import config

# ---------------------------------------------------------------------------
# Contrats d'entree "bruts" : ce que l'application devra envoyer au module ML.
# Les variables derivees (ratios, geometrie) sont calculees DANS le pipeline,
# ce qui garantit la parite entrainement / inference.
# ---------------------------------------------------------------------------
BROWSER_RAW_COLUMNS = [
    "exam_mode",                 # "remote" | "center_based"
    "tot_question",              # nombre de questions de l'examen
    "tot_que_attempted",         # questions repondues
    "que_att_within_idl_time",   # questions repondues dans le "temps ideal"
    "idl_time_correct_que",      # questions correctes repondues dans le temps ideal
    "tot_correct_que",           # questions correctes
    "exam_finish_time_in_sec",   # duree effective de la session (s)
]
BROWSER_DROPPED = {
    "student_name": "identifiant personnel (PII) : jamais utilise comme variable",
    "questions_to_pass": "redondante : = 0,6 x tot_question pour 100 % des lignes",
    "tot_exam_time": "redondante : = 3 x tot_question (minutes) pour 100 % des lignes",
    "result": "derivee : pass <=> tot_correct_que >= questions_to_pass (100 % des lignes)",
    "finish_time_in_min": "redondante : = floor(exam_finish_time_in_sec / 60)",
}
BROWSER_TARGET = "prediction"
BROWSER_POSITIVE = "Cheating"

WEBCAM_RAW_COLUMNS = [
    "face_present", "no_of_face",
    "face_x", "face_y", "face_w", "face_h",
    "left_eye_x", "left_eye_y", "right_eye_x", "right_eye_y",
    "nose_tip_x", "nose_tip_y", "mouth_x", "mouth_y",
    "hand_count", "left_hand_x", "left_hand_y", "right_hand_x", "right_hand_y",
    "phone_present", "phone_loc_x", "phone_loc_y",
    "pupil_left_x", "pupil_left_y", "pupil_right_x", "pupil_right_y",
]
# Variables du jeu Mendeley NON reproductibles fidelement dans le navigateur
WEBCAM_EXCLUDED = {
    "face_conf": "score propre au detecteur d'origine (echelle 0-100) : non comparable a MediaPipe Tasks JS",
    "phone_conf": "score propre a YOLOv5/v7 : un autre detecteur (MediaPipe ObjectDetector) n'a pas la meme calibration",
    "hand_obj_interaction": "regle maison non documentee (interaction main-objet)",
    "head_pose": "categorie issue de seuils non documentes",
    "head_pitch": "unite non conforme a la documentation (\"degres\" mais valeurs ~0,01) : echelle non reproductible",
    "head_yaw": "idem head_pitch",
    "head_roll": "idem head_pitch",
    "gaze_on_script": "zone \"script\" non definie dans la documentation",
    "gaze_direction": "modele de regard maison (solvePnP + projectPoints), seuils non documentes",
    "gazePoint_x": "point de regard issu du modele maison non documente",
    "gazePoint_y": "idem gazePoint_x",
}
WEBCAM_TARGET = "label"
# Taille d'image de reference du jeu Mendeley (gazePoint_x <= 639, gazePoint_y <= 480)
FRAME_W, FRAME_H = 640.0, 480.0
# Proxy de session : blocs de lignes contigues (aucun identifiant participant disponible)
WEBCAM_BLOCK_SIZE = 100

KEYSTROKE_META = ["subject", "sessionIndex", "rep"]


# ---------------------------------------------------------------------------
# Integrite et telechargement
# ---------------------------------------------------------------------------
def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download_mendeley(force: bool = False) -> list[Path]:
    """Telecharge les fichiers du jeu Mendeley 39xs8th543 v1 et verifie leur SHA-256."""
    config.WEBCAM_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    for name, meta in config.MENDELEY_FILES.items():
        dest = config.WEBCAM_DIR / name
        if dest.exists() and not force and sha256(dest) == meta["sha256"]:
            out.append(dest)
            continue
        url = (
            f"https://data.mendeley.com/public-files/datasets/{config.MENDELEY_DATASET_ID}"
            f"/files/{meta['file_id']}/file_downloaded"
        )
        tmp = dest.with_suffix(dest.suffix + ".part")
        with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
            f.write(r.read())
        digest = sha256(tmp)
        if digest != meta["sha256"]:
            tmp.unlink(missing_ok=True)
            raise RuntimeError(f"SHA-256 inattendu pour {name}: {digest}")
        tmp.replace(dest)
        out.append(dest)
    return out


def check_files() -> dict[str, str]:
    """Retourne l'etat de chaque fichier attendu ('ok', 'absent', 'sha256 different')."""
    status = {}
    expected = {
        config.BROWSER_CSV: config.LOCAL_SHA256["online_exam_data.csv"],
        config.KEYSTROKE_CSV: config.LOCAL_SHA256["DSL-StrongPasswordData.csv"],
        config.WEBCAM_CSV: config.MENDELEY_FILES["students_suspicious_behaviors_v1.csv"]["sha256"],
    }
    for path, digest in expected.items():
        rel = str(path.relative_to(config.ML_ROOT))
        if not path.exists():
            status[rel] = "absent"
        elif sha256(path) != digest:
            status[rel] = "sha256 different (fichier modifie ?)"
        else:
            status[rel] = "ok"
    return status


# ---------------------------------------------------------------------------
# Chargement
# ---------------------------------------------------------------------------
def _require(path: Path, hint: str) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Fichier manquant : {path}\n{hint}")


def load_browser_raw() -> pd.DataFrame:
    _require(config.BROWSER_CSV, "Copiez online_exam_data.csv dans ml/data/raw/.")
    return pd.read_csv(config.BROWSER_CSV)


def load_webcam_raw() -> pd.DataFrame:
    _require(config.WEBCAM_CSV, "Lancez : python -m examguard_ml.data --download")
    return pd.read_csv(config.WEBCAM_CSV)


def load_keystroke_raw() -> pd.DataFrame:
    _require(config.KEYSTROKE_CSV, "Copiez DSL-StrongPasswordData.csv dans ml/data/raw/.")
    return pd.read_csv(config.KEYSTROKE_CSV)


@dataclass
class Dataset:
    X: pd.DataFrame          # colonnes brutes du contrat d'entree
    y: np.ndarray            # 0/1
    groups: np.ndarray       # identifiant de groupe pour le decoupage (participant / bloc)
    group_kind: str          # description du groupe
    full: pd.DataFrame       # table complete nettoyee (pour reference/benchmark)


def prepare_browser(df: pd.DataFrame | None = None) -> Dataset:
    df = load_browser_raw() if df is None else df.copy()
    df = df.dropna(subset=BROWSER_RAW_COLUMNS + [BROWSER_TARGET])
    y = (df[BROWSER_TARGET] == BROWSER_POSITIVE).astype(int).to_numpy()
    # Une ligne = une session = un participant (1 600 noms uniques) : groupe = nom.
    groups = df["student_name"].astype(str).to_numpy()
    X = df[BROWSER_RAW_COLUMNS].reset_index(drop=True)
    return Dataset(X=X, y=y, groups=groups, group_kind="participant (student_name)",
                   full=df.reset_index(drop=True))


def prepare_webcam(df: pd.DataFrame | None = None, block_size: int = WEBCAM_BLOCK_SIZE) -> Dataset:
    df = load_webcam_raw() if df is None else df.copy()
    df = df.reset_index(drop=True)
    # Les NaN de head_pose / gaze_direction correspondent a la modalite documentee "None".
    for c in ("head_pose", "gaze_direction"):
        if c in df:
            df[c] = df[c].fillna("none").astype(str)
    # Proxy de session : l'ordre des lignes suit le temps (images successives).
    groups = (np.arange(len(df)) // block_size).astype(int)
    # Doublons exacts : on garde la premiere occurrence (voir audit_webcam.md pour leur position).
    dup = df.duplicated(keep="first").to_numpy()
    df, groups = df.loc[~dup].reset_index(drop=True), groups[~dup]
    y = df[WEBCAM_TARGET].astype(int).to_numpy()
    X = df[WEBCAM_RAW_COLUMNS].astype(float)
    return Dataset(X=X, y=y, groups=groups, group_kind=f"bloc de {block_size} lignes contigues",
                   full=df)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--download", action="store_true", help="telecharge le jeu Mendeley")
    p.add_argument("--check", action="store_true", help="verifie les fichiers attendus")
    a = p.parse_args(argv)
    if a.download:
        for f in download_mendeley():
            print("ok", f)
    if a.check or not a.download:
        for k, v in check_files().items():
            print(f"{v:>10}  {k}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
