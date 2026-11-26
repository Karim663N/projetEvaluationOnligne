"""États de fraude lisibles (« téléphone détecté », « visage absent »…), complémentaires du score ML.

Chaque état est une règle simple sur les variables webcam reproductibles (features.webcam_features).
Les seuils sont calibrés UNIQUEMENT sur les images normales de l'apprentissage (quantiles), pour
environ 1 % de déclenchements sur des images normales ; leur pouvoir réel est mesuré sur le test
(reports/fraud_states.md). Ce sont des faits observés à montrer à l'enseignant, pas des preuves.

    python -m examguard_ml.states      # calibre, vérifie sur le test, écrit artifacts/fraud_states.json
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from . import config, data
from .features import webcam_features
from .utils import md_table, read_json, write_json

STATES = {
    "telephone": {"libelle": "Téléphone détecté", "icone": "📱"},
    "plusieurs_visages": {"libelle": "Plusieurs visages", "icone": "👥"},
    "visage_absent": {"libelle": "Visage absent", "icone": "🚫"},
    "tete_tournee": {"libelle": "Tête tournée", "icone": "↔️"},
    "tete_baissee": {"libelle": "Tête baissée", "icone": "⬇️"},
    "regard_detourne": {"libelle": "Regard détourné", "icone": "👀"},
}
# « main près du visage » a été testé puis retiré : 0 déclenchement sur le test (triche comme normal).
Q_LOW, Q_HIGH = 0.005, 0.995   # bilatéral : ~1 % des images normales
Q_ONE = 0.99                    # unilatéral
FAST_ANSWER_S = 10              # « réponse éclair » : juste en moins de 10 s


def calibrate(F: pd.DataFrame, y: np.ndarray, full: pd.DataFrame, idx_tr: np.ndarray) -> dict:
    """Seuils à partir des images normales (y = 0) de l'apprentissage, avec visage détecté."""
    in_tr = np.isin(np.arange(len(y)), idx_tr)
    face = F["face_present"].to_numpy() == 1
    norm = in_tr & (y == 0) & face
    eyes = norm & (F["pupils_detected"].to_numpy() == 1)
    # sens de « tête baissée » déterminé sur les images étiquetées head_pose = down (apprentissage)
    down = in_tr & face & (full["head_pose"].fillna("none").astype(str).to_numpy() == "down")
    pitch_up = bool(F.loc[down, "pitch_proxy"].median() > F.loc[norm, "pitch_proxy"].median())
    pitch_q = Q_ONE if pitch_up else 1 - Q_ONE
    return {
        "yaw": [float(F.loc[norm, "yaw_proxy"].quantile(Q_LOW)), float(F.loc[norm, "yaw_proxy"].quantile(Q_HIGH))],
        "pitch": float(F.loc[norm, "pitch_proxy"].quantile(pitch_q)),
        "pitch_vers_le_haut": pitch_up,
        "pupil_dx": [float(F.loc[eyes, "pupil_dx"].quantile(Q_LOW)), float(F.loc[eyes, "pupil_dx"].quantile(Q_HIGH))],
        "pupil_dy": [float(F.loc[eyes, "pupil_dy"].quantile(Q_LOW)), float(F.loc[eyes, "pupil_dy"].quantile(Q_HIGH))],
        "n_images_normales": int(norm.sum()),
        "reponse_eclair_s": FAST_ANSWER_S,
    }


def frame_states(F: pd.DataFrame, t: dict) -> pd.DataFrame:
    """Un booléen par état et par image (F = sortie de webcam_features)."""
    face = F["face_present"] == 1
    eyes = face & (F["pupils_detected"] == 1)
    pitch = F["pitch_proxy"] > t["pitch"] if t["pitch_vers_le_haut"] else F["pitch_proxy"] < t["pitch"]
    out = pd.DataFrame(index=F.index)
    out["telephone"] = F["phone_present"] == 1
    out["plusieurs_visages"] = F["no_of_face"] >= 2
    out["visage_absent"] = F["face_present"] == 0
    out["tete_tournee"] = face & ((F["yaw_proxy"] < t["yaw"][0]) | (F["yaw_proxy"] > t["yaw"][1]))
    out["tete_baissee"] = face & pitch
    out["regard_detourne"] = eyes & ((F["pupil_dx"] < t["pupil_dx"][0]) | (F["pupil_dx"] > t["pupil_dx"][1])
                                     | (F["pupil_dy"] < t["pupil_dy"][0]) | (F["pupil_dy"] > t["pupil_dy"][1]))
    return out[list(STATES)]


def summarize(S: pd.DataFrame, t: dict | None = None, period_s: float = 2.0) -> dict:
    """Résumé par état : nombre d'images, part du temps, durée estimée, premier relevé, fiabilité."""
    n = max(len(S), 1)
    reliability = (t or {}).get("fiabilite", {})
    out = {}
    for k in STATES:
        col = S[k].to_numpy(dtype=bool)
        hits = np.flatnonzero(col)
        out[k] = {**STATES[k], "images": int(col.sum()), "part": float(col.sum() / n),
                  "duree_estimee_s": float(col.sum() * period_s),
                  "premier_releve": int(hits[0]) if len(hits) else None,
                  "fiabilite": reliability.get(k, "inconnue")}
    return out


def reliability_level(p: float) -> str:
    """Niveau lisible à partir de P(triche | état) mesurée sur le test (jeu équilibré)."""
    if not np.isfinite(p):
        return "inconnue"
    return "forte" if p >= 0.9 else "moyenne" if p >= 0.7 else "faible"


def answer_states(answers: list[dict]) -> dict:
    """États côté session : réponses justes données très vite (« réponses éclair »)."""
    fast = [a for a in answers if a.get("correct") and float(a.get("seconds", 0)) < FAST_ANSWER_S]
    n = max(len(answers), 1)
    return {"reponses_eclair": {"libelle": f"Réponses justes en moins de {FAST_ANSWER_S} s", "icone": "⚡",
                                "nombre": len(fast), "part": len(fast) / n}}


def load_thresholds() -> dict:
    return read_json(config.ARTIFACTS / "fraud_states.json")


def verify(F: pd.DataFrame, y: np.ndarray, idx_te: np.ndarray, t: dict) -> pd.DataFrame:
    """Fréquence de chaque état sur les images de TEST normales vs triche."""
    S = frame_states(F.iloc[idx_te], t)
    yt = y[idx_te]
    rows = []
    for k in STATES:
        col = S[k].to_numpy(dtype=bool)
        n_norm, n_cheat = int(col[yt == 0].sum()), int(col[yt == 1].sum())
        rows.append({"état": f"{STATES[k]['icone']} {STATES[k]['libelle']}",
                     "images normales (test)": n_norm, "part normales": n_norm / max((yt == 0).sum(), 1),
                     "images triche (test)": n_cheat, "part triche": n_cheat / max((yt == 1).sum(), 1),
                     "P(triche | état)": n_cheat / (n_norm + n_cheat) if n_norm + n_cheat else float("nan")})
    return pd.DataFrame(rows)


def run() -> dict:
    ds = data.prepare_webcam()
    pred = np.load(config.ARTIFACTS / "webcam_predictions.npz")
    F = webcam_features(ds.X)
    t = calibrate(F, ds.y, ds.full, pred["idx_tr"])
    tab = verify(F, ds.y, pred["idx_te"], t)
    # niveau de fiabilité affiché à l'enseignant (attribut de rapport, n'influence aucun seuil ni modèle)
    t["fiabilite"] = {k: reliability_level(p) for k, p in zip(STATES, tab["P(triche | état)"])}
    tab["fiabilité"] = list(t["fiabilite"].values())
    write_json(t, config.ARTIFACTS / "fraud_states.json")
    S_te = frame_states(F.iloc[pred["idx_te"]], t)
    any_state = S_te.any(axis=1).to_numpy()
    yt = ds.y[pred["idx_te"]]
    md = f"""# États de fraude — calibration et vérification

Règles simples sur les variables webcam reproductibles, calibrées sur les {t['n_images_normales']} images **normales
de l'apprentissage** (quantiles {Q_LOW} / {Q_HIGH} pour les états bilatéraux, {Q_ONE} pour les unilatéraux) ; vérifiées
une seule fois sur le **jeu de test** ({len(yt)} images, {int(yt.sum())} triche). Ce sont des faits observés à montrer à
l'enseignant, complémentaires du score ML ; aucun n'est une preuve.

{md_table(tab, nd=3)}

Au moins un état sur une image : {any_state[yt == 1].mean():.1%} des images de triche, {any_state[yt == 0].mean():.1%} des images normales.

Lecture : téléphone, plusieurs visages et visage absent n'apparaissent que sur des images de triche dans ce jeu
(étiquetage en partie dérivé des détecteurs, cf. audit). Les états de pose et de regard sont calculés à partir de
points du visage bruités : leur pouvoir discriminant est **faible** sur ce jeu ; ils restent utiles comme contexte
(durée, moment) mais ne doivent pas être lus seuls.

Seuils (`artifacts/fraud_states.json`) : tête tournée si rotation hors [{t['yaw'][0]:.3f} ; {t['yaw'][1]:.3f}] ;
tête baissée si inclinaison {'>' if t['pitch_vers_le_haut'] else '<'} {t['pitch']:.3f} ; regard détourné si décalage des
pupilles hors [{t['pupil_dx'][0]:.3f} ; {t['pupil_dx'][1]:.3f}] (horizontal) ou [{t['pupil_dy'][0]:.3f} ; {t['pupil_dy'][1]:.3f}]
(vertical). Côté session : « réponse éclair » = réponse juste en moins de {FAST_ANSWER_S} s.

État testé puis retiré : « main près du visage » (0 déclenchement sur le test, triche comme normal).
Fiabilité affichée : forte si P(triche | état) ≥ 0,9 sur le test, moyenne si ≥ 0,7, faible sinon (jeu équilibré :
0,5 = aucune information).
"""
    (config.REPORTS / "fraud_states.md").write_text(md, encoding="utf-8")
    write_json({"seuils": t, "verification": tab.to_dict(orient="records"),
                "au_moins_un_etat": {"triche": float(any_state[yt == 1].mean()),
                                     "normal": float(any_state[yt == 0].mean())}},
               config.REPORTS / "results_fraud_states.json")
    return {"seuils": t, "table": tab}


if __name__ == "__main__":
    r = run()
    print(r["table"].to_string(index=False))
    sys.exit(0)
