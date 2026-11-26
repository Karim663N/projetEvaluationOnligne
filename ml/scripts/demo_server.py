"""Page de test locale du module ML (PAS l'application) : appelle inference.py.

    python scripts/demo_server.py            # puis ouvrir http://127.0.0.1:8765

Bibliotheque standard uniquement ; ecoute seulement sur 127.0.0.1.
"""
from __future__ import annotations

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ML = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ML / "src"), str(ML)]

import numpy as np  # noqa: E402
from pydantic import ValidationError  # noqa: E402

import inference  # noqa: E402
from examguard_ml import config, data  # noqa: E402

INT_FIELDS = {"tot_question", "tot_que_attempted", "que_att_within_idl_time", "idl_time_correct_que",
              "tot_correct_que", "face_present", "no_of_face", "hand_count", "phone_present"}
_POOLS: dict = {}


def _payload(row: dict) -> dict:
    return {k: (v if isinstance(v, str) else int(v) if k in INT_FIELDS else round(float(v), 4))
            for k, v in row.items()}


def _pool(branch: str):
    if branch not in _POOLS:
        ds = data.prepare_browser() if branch == "browser" else data.prepare_webcam()
        p = np.load(config.ARTIFACTS / f"{branch}_predictions.npz")
        _POOLS[branch] = (ds.X, p["idx_te"], p["y_te"])
    return _POOLS[branch]


def sample(branch: str, label: int) -> dict:
    """Une observation tiree au hasard dans le JEU DE TEST (jamais vue a l'entrainement)."""
    X, idx_te, y_te = _pool(branch)
    candidates = idx_te[y_te == label]
    i = int(np.random.default_rng().choice(candidates))
    return {"features": _payload(X.iloc[i].to_dict()), "etiquette_reelle": int(label),
            "ligne": i, "source": "jeu de test"}


def analyse(branch: str, features: dict) -> dict:
    pred = inference.predict_browser(features) if branch == "browser" else inference.predict_webcam(features)
    return {"prediction": pred, "explication": inference.explain(branch, features, k=6)}


def _fusion_cfg() -> dict:
    return json.loads((config.ARTIFACTS / "fusion_config.json").read_text(encoding="utf-8"))


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body, ctype="application/json; charset=utf-8"):
        raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, fmt, *args):  # journal concis
        sys.stderr.write("[demo] " + fmt % args + "\n")

    def _json(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def _guard(self, fn):
        try:
            self._send(200, fn())
        except ValidationError as e:
            self._send(422, {"erreurs": [{"champ": ".".join(map(str, err["loc"])) or "(ensemble)",
                                          "message": err["msg"]} for err in e.errors()]})
        except (ValueError, KeyError, TypeError) as e:
            self._send(400, {"erreurs": [{"champ": "(requête)", "message": str(e)}]})

    def do_GET(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if url.path == "/":
            self._send(200, (Path(__file__).parent / "demo_page.html").read_bytes(), "text/html; charset=utf-8")
        elif url.path == "/api/config":
            self._guard(lambda: {"fusion": _fusion_cfg(),
                                 "temps_ideal_s": inference.IDEAL_SECONDS_PER_QUESTION})
        elif url.path == "/api/sample":
            self._guard(lambda: sample(q["branch"][0], int(q["label"][0])))
        else:
            self._send(404, {"erreurs": [{"champ": "url", "message": "introuvable"}]})

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/build":
            self._guard(lambda: (lambda b: inference.build_browser_features(
                b["exam_mode"], int(b["tot_question"]), b["answers"], float(b["session_seconds"])))(self._json()))
        elif path == "/api/predict":
            self._guard(lambda: (lambda b: analyse(b["branch"], b["features"]))(self._json()))
        elif path == "/api/fuse":
            self._guard(lambda: (lambda b: inference.fuse(float(b["sa"]), float(b["sb"]),
                                                          None if b.get("w") is None else float(b["w"])))(self._json()))
        else:
            self._send(404, {"erreurs": [{"champ": "url", "message": "introuvable"}]})


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8765)
    a = p.parse_args()
    # prechargement : premier appel rapide
    inference.predict_browser(sample("browser", 0)["features"])
    inference.predict_webcam(sample("webcam", 0)["features"])
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"Page de test ExamGuard ML : http://127.0.0.1:{a.port}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
