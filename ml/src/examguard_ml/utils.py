"""Petits utilitaires : tableaux Markdown, JSON, versions."""
from __future__ import annotations

import json
import platform
from pathlib import Path

import numpy as np
import pandas as pd


def fmt(v, nd: int = 3) -> str:
    if v is None:
        return "—"
    if isinstance(v, (bool, np.bool_)):
        return "oui" if v else "non"
    if isinstance(v, (int, np.integer)):
        return str(int(v))
    if isinstance(v, (float, np.floating)):
        if np.isnan(v):
            return "—"
        return f"{v:.{nd}f}"
    return str(v).replace("|", "\\|").replace("\n", " ")


def md_table(df: pd.DataFrame, nd: int = 3, index: bool = False) -> str:
    d = df.reset_index() if index else df
    cols = [str(c).replace("|", "\\|") for c in d.columns]
    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for _, row in d.iterrows():
        lines.append("| " + " | ".join(fmt(v, nd) for v in row.tolist()) + " |")
    return "\n".join(lines)


class _Enc(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, (np.bool_,)):
            return bool(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, Path):
            return str(o)
        return super().default(o)


def write_json(obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, cls=_Enc), encoding="utf-8")


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def versions() -> dict:
    import joblib
    import matplotlib
    import scipy
    import shap
    import sklearn
    import xgboost

    return {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "pandas": pd.__version__,
        "scipy": scipy.__version__,
        "scikit-learn": sklearn.__version__,
        "xgboost": xgboost.__version__,
        "shap": shap.__version__,
        "joblib": joblib.__version__,
        "matplotlib": matplotlib.__version__,
    }
