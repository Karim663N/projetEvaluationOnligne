"""Commande unique : tout reentrainer et regenerer les rapports.

    python -m examguard_ml.pipeline              # audit -> B -> A -> CMU -> fusion -> SHAP -> rapports
    python -m examguard_ml.pipeline --no-download --skip-keystroke

Duree indicative sur un PC portable 8 coeurs / 16 Go, CPU seul : 5 a 8 minutes.
"""
from __future__ import annotations

import argparse
import sys
import time

from . import audit, config, data, explain, fusion, ideal_time, keystroke, report, states, train
from .utils import write_json


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--no-download", action="store_true", help="ne pas telecharger le jeu Mendeley")
    p.add_argument("--skip-keystroke", action="store_true", help="ignorer le module CMU (optionnel)")
    a = p.parse_args(argv)
    config.set_seed()
    config.ensure_dirs()
    t0 = time.perf_counter()
    timings = {}

    def step(name, fn):
        t = time.perf_counter()
        print(f"\n=== {name} ===", flush=True)
        r = fn()
        timings[name] = round(time.perf_counter() - t, 1)
        return r

    if not a.no_download and not config.WEBCAM_CSV.exists():
        step("telechargement Mendeley", data.download_mendeley)
    status = data.check_files()
    print(status)
    missing = [k for k, v in status.items() if v != "ok" and "DSL" not in k]
    if missing:
        print(f"Fichiers manquants ou modifies : {missing}", file=sys.stderr)
        return 2
    step("Phase 1 - audit", audit.run)
    step("Phase 2 - branche B", lambda: train.train_full("browser"))
    step("Phase 3 - branche A", lambda: train.train_full("webcam"))
    step("Etats de fraude (calibration + verification)", states.run)
    step("Regle du temps ideal (simulation)", ideal_time.run)
    if not a.skip_keystroke and config.KEYSTROKE_CSV.exists():
        step("Phase 4 - CMU keystroke", keystroke.run)
    step("Phase 5 - fusion (simulation)", fusion.main)
    step("Phase 6 - SHAP", explain.run)
    step("Rapport final", report.run)
    timings["total"] = round(time.perf_counter() - t0, 1)
    write_json(timings, config.REPORTS / "timings.json")
    print(f"\nTermine en {timings['total']:.0f} s. Rapport : reports/RAPPORT_ML.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
