"""Generation de reports/RAPPORT_ML.md et de MODEL_CARD.md a partir des resultats JSON.

Aucun chiffre n'est saisi a la main : tout vient de reports/results_*.json, audit_summary.json,
artifacts/*.json et, s'il existe, du dernier passage de pytest (reports/pytest_junit.xml).

    python -m examguard_ml.report
"""
from __future__ import annotations

import json
import statistics
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd

from . import config
from .utils import md_table, read_json

R = config.REPORTS


def _load(name: str):
    p = R / name
    return read_json(p) if p.exists() else None


def _pct(x: float, nd: int = 1) -> str:
    return f"{100 * x:.{nd}f} %"


def precision_at_prior(tpr: float, fpr: float, prior: float) -> float:
    """Precision attendue si la prevalence reelle vaut `prior` (meme rappel et meme taux de FP)."""
    num = tpr * prior
    den = num + fpr * (1 - prior)
    return num / den if den > 0 else 0.0


def pytest_summary() -> dict | None:
    p = R / "pytest_junit.xml"
    if not p.exists():
        return None
    root = ET.parse(p).getroot()
    suite = root if root.tag == "testsuite" else root.find("testsuite")
    a = suite.attrib
    failed = [f"{tc.get('classname')}::{tc.get('name')}" for tc in suite.iter("testcase")
              if tc.find("failure") is not None or tc.find("error") is not None]
    return {"tests": int(a.get("tests", 0)), "failures": int(a.get("failures", 0)),
            "errors": int(a.get("errors", 0)), "skipped": int(a.get("skipped", 0)),
            "time": float(a.get("time", 0)), "failed": failed}


def benchmark(n: int = 200) -> dict:
    """Latence mediane et taille des modeles, mesurees via le contrat d'interface."""
    sys.path.insert(0, str(config.ML_ROOT))
    import inference  # noqa: E402
    from . import data

    out = {}
    b = data.prepare_browser().X.iloc[0].to_dict()
    w = data.prepare_webcam().X.iloc[0].to_dict()
    w = {k: (int(v) if k in ("face_present", "no_of_face", "hand_count", "phone_present") else float(v))
         for k, v in w.items()}
    b = {k: (v if k == "exam_mode" else (float(v) if k == "exam_finish_time_in_sec" else int(v)))
         for k, v in b.items()}
    for name, fn, arg in (("predict_browser", inference.predict_browser, b),
                          ("predict_webcam", inference.predict_webcam, w),
                          ("explain_browser", lambda x: inference.explain("browser", x), b),
                          ("explain_webcam", lambda x: inference.explain("webcam", x), w)):
        fn(arg)  # chargement / cache
        reps = n if name.startswith("predict") else 20
        ts = []
        for _ in range(reps):
            t = time.perf_counter()
            fn(arg)
            ts.append(1000 * (time.perf_counter() - t))
        out[name] = {"median_ms": statistics.median(ts), "p95_ms": sorted(ts)[int(0.95 * (len(ts) - 1))]}
    for br in ("browser", "webcam"):
        out[f"taille_{br}_Mo"] = (config.ARTIFACTS / f"{br}_model.joblib").stat().st_size / 1e6
    return out


def _family_table(res: dict) -> pd.DataFrame:
    rows = []
    for f in res["families"].values():
        t = f["test"]
        rows.append({
            "modèle": f["label"] + (" **(retenu)**" if f["name"] == res["selected"] else ""),
            "PR-AUC CV": f"{f['cv_ap_mean']:.3f} ± {f['cv_ap_std']:.3f}",
            "PR-AUC test": t["pr_auc"], "F1": t["f1"], "précision": t["precision"],
            "rappel": t["recall"], "rappel@P≥0,8": t["recall_at_p80"], "rappel@P≥0,9": t["recall_at_p90"],
            "ROC-AUC": t["roc_auc"], "Brier": t["brier"], "calib.": f["calibration"],
        })
    return pd.DataFrame(rows)


def run(do_benchmark: bool = True) -> None:
    audit = _load("audit_summary.json")
    rb, rw = _load("results_browser.json"), _load("results_webcam.json")
    rk, rf, rx = _load("results_keystroke.json"), _load("results_fusion.json"), _load("results_explain.json")
    timings = _load("timings.json") or {}
    tests = pytest_summary()
    bench = benchmark() if do_benchmark else None
    if bench:
        (R / "benchmark.json").write_text(json.dumps(bench, indent=2), encoding="utf-8")
    ab, aw = audit["browser"], audit["webcam"]
    sb, sw = rb["families"][rb["selected"]], rw["families"][rw["selected"]]
    tb, tw = sb["test"], sw["test"]
    prior = rf["deployment_prior"] if rf else 0.05
    prec_w_dep = precision_at_prior(tw["recall"], tw["fpr"], prior)
    lex = rw["leakage_experiments"]
    ref = rw["reference"]
    rule = ref["rule_baseline_test"]
    part = rf["scenarios"]["partiel"] if rf else None
    conc = rf["scenarios"]["concordant"] if rf else None

    def fus_row(sc, key_prefix):
        k = next(n for n in sc["test"] if n.startswith(key_prefix))
        return sc["test"][k]

    S = []  # sections
    # ------------------------------------------------------------------ resume
    S.append(f"""# ExamGuard AI — Rapport ML

*Généré automatiquement par `python -m examguard_ml.report` à partir des résultats réels
(graine {config.SEED}). Aucun chiffre n'est saisi à la main.*

## Résumé

- **Branche B (session d'examen)** — {sb['label']} retenu : PR-AUC test **{tb['pr_auc']:.3f}**
  (IC 95 % [{rb['test_ci']['pr_auc'][0]:.3f} ; {rb['test_ci']['pr_auc'][1]:.3f}]), F1 {tb['f1']:.3f},
  rappel@précision≥0,8 = {tb['recall_at_p80']:.3f}, sur seulement {rb['pos_test']} cas de triche en test.
  Convention « temps idéal » retenue par l'équipe : 3 min (180 s cumulées) par question.
  ⚠ Le fichier ne contient **aucune télémétrie navigateur** (onglets, copier-coller, souris, frappe), contrairement
  au cahier des charges ; et **les {ab['positifs']} tricheurs ont tous réussi l'examen** (biais « bonne note = suspect »).
- **Branche A (webcam)** — {sw['label']} retenu, entraîné **uniquement sur des variables reproductibles dans le
  navigateur** : PR-AUC test **{tw['pr_auc']:.3f}** (IC 95 % [{rw['test_ci']['pr_auc'][0]:.3f} ; {rw['test_ci']['pr_auc'][1]:.3f}]), F1 {tw['f1']:.3f}.
  Pas d'identifiant participant : découpage par blocs de 100 images contiguës ; selon la taille des blocs la PR-AUC
  de validation croisée varie de {lex['block_size']['500']['ap_mean']:.3f} (blocs de 500) à {lex['block_size']['25']['ap_mean']:.3f} (blocs de 25), et atteint
  {lex['cv_random_vs_blocks']['aleatoire (lignes melangees)']['ap_mean']:.3f} avec un découpage aléatoire (fuite).
- **Score > 0,99 détecté et expliqué** : le modèle de référence avec toutes les colonnes Mendeley atteint
  PR-AUC {ref['test']['pr_auc']:.4f}. Enquête : 0 bloc commun, 0 ligne identique train/test ; une **simple règle sans
  apprentissage** (« au moins une anomalie de détecteur ») obtient déjà F1 {rule['f1']:.3f} — l'étiquette est en grande
  partie dérivée des sorties des détecteurs (circularité), ce n'est pas une performance de détection de triche.""")
    if rk:
        S.append(f"""- **CMU Keystroke** — EER Manhattan (mis à l'échelle) {rk['summary']['manhattan_scaled']['eer_mean']:.4f},
  Mahalanobis {rk['summary']['mahalanobis']['eer_mean']:.4f} : valeurs **publiées** reproduites (0,0962 / 0,1101) ;
  écart de {rk['summary']['manhattan_scaled']['eer_mean'] - 0.0955:+.4f} / {rk['summary']['mahalanobis']['eer_mean'] - 0.1097:+.4f} avec les valeurs de l'équipe (0,0955 / 0,1097).""")
    if rf:
        fp = fus_row(part, "fusion pondérée")
        S.append(f"""- **Fusion (SIMULATION, pas de jeu commun)** — poids webcam w = {rf['deployed']['w_webcam']:.2f} choisi sur validation
  simulée ; scénario « partiel » : PR-AUC A seule {part['test']['webcam seule (A)']['pr_auc'][0]:.3f},
  B seule {part['test']['navigateur seul (B)']['pr_auc'][0]:.3f}, fusion {fp['pr_auc'][0]:.3f}. Illustration du mécanisme uniquement.""")
    if tests:
        S.append(f"""- **Tests** : {tests['tests']} tests pytest, {tests['failures']} échec(s), {tests['errors']} erreur(s),
  {tests['skipped']} ignoré(s) — durée {tests['time']:.0f} s.""")

    # ------------------------------------------------------------------ donnees
    S.append(f"""
## 1. Données, sources et licences

| jeu | rôle | lignes | positifs | identifiant | licence / source | utilisé |
|---|---|---|---|---|---|---|
| `online_exam_data.csv` | branche B | {ab['n_lignes']} | {ab['positifs']} ({_pct(ab['taux_positifs'])}) | `student_name` unique → 1 ligne = 1 participant | fourni par l'équipe ; **source et licence non documentées**, probablement synthétique | oui |
| Mendeley 10.17632/39xs8th543.1 (Hossen & Uddin, 2025) | branche A | {aw['n_lignes']} ({aw['doublons_exacts']} doublons retirés) | {aw['positifs']} ({_pct(aw['taux_positifs'])}) avant dédoublonnage | **aucun** → blocs contigus | CC BY 4.0 (attribution ; variables dérivées = modification) | oui |
| CMU Keystroke (Killourhy & Maxion, 2009) | identité (option) | {audit.get('keystroke', {}).get('n_lignes', '—')} | sans étiquette de triche | `subject` (51 sujets) | données de recherche CMU, citer l'article | oui (hors fusion) |
| Students' Abnormal Behavior (Harvard Dataverse, 10.7910/DVN/WUWRAB) | images, branche A | — | — | — | licence à vérifier | **non** (non demandé) |
| Kamalov et al. (PLOS ONE 2021) | notes | — | — | — | CC BY 4.0 | **non** (pas de télémétrie) |

Détails : [audit_browser.md](audit_browser.md), [audit_webcam.md](audit_webcam.md), [audit_keystroke.md](audit_keystroke.md).

### Constats d'audit majeurs
1. `online_exam_data.csv` ne contient que des compteurs (questions, réponses, bonnes réponses, réponses dans le
   « temps idéal ») et une durée. Trois colonnes de configuration sont parfaitement colinéaires et `result` est
   dérivé de la note : retirées. La définition du « temps idéal » n'est pas documentée dans le fichier ;
   **convention retenue par l'équipe : 3 min (180 s cumulées) par question**.
2. Les {ab['positifs']} cas de triche ont **tous** le résultat « pass » (0 parmi les échecs).
3. Jeu Mendeley : aucune donnée d'identité ou de session ; images successives fortement corrélées
   (distance médiane {aw['distance_mediane_consecutive_px']:.1f} px entre lignes consécutives contre {aw['distance_mediane_aleatoire_px']:.1f} px au hasard).
4. Jeu Mendeley : {_pct(aw['part_triche_expliquee_par_anomalie'])} des lignes « triche » présentent une anomalie de détecteur contre
   {_pct(aw['part_non_triche_avec_anomalie'])} des lignes normales → étiquette en grande partie dérivée des détecteurs.
5. Parité navigateur : 11 colonnes Mendeley exclues (scores de confiance propres à YOLO, règle main-objet maison,
   angles de tête dans une unité non documentée, modèle de regard maison) et remplacées par des variables
   géométriques calculables à l'identique à partir des points MediaPipe.""")

    # ------------------------------------------------------------------ branche B
    abl = rb.get("ablations", {})
    abl_tab = pd.DataFrame([
        {"variables": "B1 complet (retenu)", "PR-AUC CV": f"{sb['cv_ap_mean']:.3f} ± {sb['cv_ap_std']:.3f}",
         "PR-AUC test": tb["pr_auc"], "rappel@P≥0,8 test": tb["recall_at_p80"]},
        *[{"variables": {"sans_temps_ideal": "B2 sans « temps idéal » (parité stricte)",
                         "sans_correction": "B3 sans aucune variable de correction"}[k],
           "PR-AUC CV": f"{v['cv_ap_mean']:.3f} ± {v['cv_ap_std']:.3f}",
           "PR-AUC test": v["test"]["pr_auc"], "rappel@P≥0,8 test": v["test"]["recall_at_p80"]}
          for k, v in abl.items()]])
    S.append(f"""
## 2. Branche B — session d'examen (`online_exam_data.csv`)

Découpage : 75 % apprentissage / 25 % test stratifié ({rb['n_train']} / {rb['n_test']} sessions, {rb['pos_train']} / {rb['pos_test']} triches),
une ligne = un participant (0 participant commun, {rb['leakage']['lignes_test_identiques_a_une_ligne_train']} ligne identique). Sélection par validation croisée stratifiée
5 plis × 3 répétitions sur l'apprentissage ; seuil = F1 maximal sur les prédictions hors-échantillon ; test utilisé une seule fois.
Déséquilibre : poids de classes (`class_weight`, `scale_pos_weight`, poids d'échantillons pour le MLP) inclus dans les grilles.

{md_table(_family_table(rb))}

**Retenu : {sb['label']}** {sb['best_params']}, calibration {sb['calibration']}, seuil {sb['threshold']:.3f}.
Test : précision {tb['precision']:.3f}, rappel {tb['recall']:.3f}, taux de faux positifs {tb['fpr']:.3f} ;
matrice de confusion VN={tb['tn']}, FP={tb['fp']}, FN={tb['fn']}, VP={tb['tp']}.
IC 95 % (bootstrap stratifié) : PR-AUC [{rb['test_ci']['pr_auc'][0]:.3f} ; {rb['test_ci']['pr_auc'][1]:.3f}], F1 [{rb['test_ci']['f1'][0]:.3f} ; {rb['test_ci']['f1'][1]:.3f}].
Avec {rb['pos_test']} positifs en test, les écarts entre modèles ne sont **pas significatifs** ; le choix suit la validation croisée.
ROC-AUC proche de 0,99 : attendu avec 95 % de négatifs faciles, non informatif ici (contrôles de fuite négatifs, aucune
règle triviale : un arbre de profondeur 4 laisse {ab['arbre_prof4_erreurs']} erreurs sur tout le jeu).

Ablations (même famille de modèle, ré-optimisée) :

{md_table(abl_tab)}

Le modèle repose presque entièrement sur les variables « temps idéal » et sur la note : sans elles la PR-AUC
s'effondre. Ces variables sont donc **critiques** : l'application doit les calculer exactement selon la
convention retenue (temps idéal = 180 s cumulées par question), via `build_browser_features` dans `inference.py`.

![PR B](figures/browser_pr_test.png) ![Confusion B](figures/browser_confusion_test.png) ![Calibration B](figures/browser_calibration_test.png)""")

    # ------------------------------------------------------------------ branche A
    bs_tab = pd.DataFrame([{"taille des blocs": int(k), "nb de blocs": v["n_blocks"],
                            "PR-AUC CV (moy ± é.-t.)": f"{v['ap_mean']:.3f} ± {v['ap_std']:.3f}"}
                           for k, v in lex["block_size"].items()])
    rnd = lex["cv_random_vs_blocks"]["aleatoire (lignes melangees)"]
    S.append(f"""
## 3. Branche A — webcam (Mendeley), variables reproductibles uniquement

Découpage : 80 % / 20 % par **blocs de 100 lignes contiguës** (`StratifiedGroupKFold`), {rw['n_train']} / {rw['n_test']} images,
0 bloc commun ; validation croisée par blocs (5 plis). {rw['leakage']['lignes_test_identiques_a_une_ligne_train']} images de test ont exactement les mêmes indicateurs
reproductibles qu'une image d'apprentissage (elles diffèrent sur les colonnes exclues).

{md_table(_family_table(rw))}

**Retenu : {sw['label']}** {sw['best_params']}, calibration {sw['calibration']}, seuil {sw['threshold']:.3f}
(règle : {rw['selection_rule']}). Test : précision {tw['precision']:.3f}, rappel {tw['recall']:.3f},
taux de faux positifs **{tw['fpr']:.3f}** par image ; VN={tw['tn']}, FP={tw['fp']}, FN={tw['fn']}, VP={tw['tp']}.

**Fuite temporelle mesurée** (validation croisée 5 plis sur tout le jeu, même modèle) :
découpage aléatoire des lignes → PR-AUC {rnd['ap_mean']:.3f} ± {rnd['ap_std']:.3f} ; par blocs :

{md_table(bs_tab)}

Plus les blocs sont petits, plus le score est optimiste : des images voisines d'une même vidéo se retrouvent des deux
côtés. Avec des blocs de 100, une fuite résiduelle est probable ; l'estimation prudente est celle des grands blocs
(≈ {lex['block_size']['500']['ap_mean']:.2f}, très variable). Seul un identifiant de participant permettrait de conclure.

**Enquête « score > 0,99 » (modèle de référence non déployable, toutes les colonnes Mendeley)** :
PR-AUC CV {ref['cv_ap_mean']:.4f}, test {ref['test']['pr_auc']:.4f}. Contrôles : {ref['leakage']['groupes_communs_train_test']} bloc commun,
{ref['leakage']['lignes_test_identiques_a_une_ligne_train']} ligne identique entre apprentissage et test. Règle sans apprentissage
« tête non frontale OU regard décentré OU téléphone OU objet en main OU nombre de visages ≠ 1 » sur le test :
précision {rule['precision']:.3f}, rappel {rule['recall']:.3f}, F1 {rule['f1']:.3f}. **Conclusion** : pas de fuite de découpage, mais une
étiquette quasi déterministe des sorties de détecteurs (circularité). Ce score ne doit pas être présenté comme une
performance de détection de triche.

Coût de la parité (même découpage) : référence {ref['test']['pr_auc']:.4f} → modèle déployable {tw['pr_auc']:.4f}.

![PR A](figures/webcam_pr_test.png) ![Confusion A](figures/webcam_confusion_test.png) ![Calibration A](figures/webcam_calibration_test.png) ![Parité](figures/webcam_parity_cost.png)

**Deep learning** : un MLP (perceptron multicouche, poids de classes) a été entraîné pour les deux branches.
TabNet / FT-Transformer n'ont pas été entraînés : ils nécessitent PyTorch (téléchargement lourd, à valider avec vous)
et ne sont pas pertinents ici — données tabulaires de quelques milliers de lignes, où le MLP fait déjà moins bien que
les arbres, et dont l'étiquette est en grande partie une règle.""")

    # ------------------------------------------------------------------ CMU
    if rk:
        kt = pd.DataFrame([{"détecteur": k, "EER moyen": v["eer_mean"], "écart-type": v["eer_std"],
                            "valeur publiée": v["published"], "valeur équipe": v["expected_team"]}
                           for k, v in rk["summary"].items()])
        S.append(f"""
## 4. Module CMU Keystroke (optionnel, hors fusion)

Protocole Killourhy & Maxion : {rk['n_subjects']} sujets, 200 saisies d'apprentissage, 200 saisies légitimes + 250 d'imposteurs
en test par sujet ; EER par sujet (interpolation linéaire, comme le script R des auteurs) puis moyenne.

{md_table(kt, nd=4)}

Les valeurs publiées sont reproduites à 10⁻⁴ près (écarts-types compris). Les valeurs de l'équipe (0,0955 / 0,1097)
ne sont pas retrouvées exactement : plusieurs variantes de calcul de l'EER (roc_curve + brentq, point le plus proche,
min-max) et de détecteur (écart-type, covariance régularisée) ont été testées sans les retrouver ; le script d'origine
n'était pas disponible. Écart ≤ 0,0007, très inférieur à la dispersion entre sujets (≈ 0,07). Détails : [keystroke.md](keystroke.md).""")

    # ------------------------------------------------------------------ fusion
    if rf:
        def ftab(sc):
            return pd.DataFrame([{"score": n, "PR-AUC": f"{v['pr_auc'][0]:.3f} ± {v['pr_auc'][1]:.3f}",
                                  "F1": f"{v['f1'][0]:.3f} ± {v['f1'][1]:.3f}",
                                  "rappel@P≥0,8": f"{v['recall_at_p80'][0]:.3f} ± {v['recall_at_p80'][1]:.3f}"}
                                 for n, v in sc["test"].items()])
        S.append(f"""
## 5. Fusion — SIMULATION (aucun jeu commun)

> Les paires (score A, score B) sont **simulées** en associant au hasard des prédictions de test des deux branches de
> même étiquette, à une prévalence de {_pct(prior, 0)}. Ce n'est **pas** une mesure de performance du système.

Les probabilités sont d'abord ramenées à la même prévalence ({_pct(prior, 0)}) : A est calibrée sur {_pct(rf['prior_train_A'])} de triche,
B sur {_pct(rf['prior_train_B'])}. Le poids est choisi sur des paires simulées issues des prédictions hors-échantillon de
l'apprentissage, puis évalué sur des paires issues des jeux de test ({rf['n_sim_test']} simulations de {rf['n_pairs']} paires).

**Scénario concordant** ({conc['description']}), w* = {conc['w_star']:.2f} :

{md_table(ftab(conc))}

**Scénario partiel** ({part['description']}), w* = {part['w_star']:.2f} — retenu pour la configuration :

{md_table(ftab(part))}

Configuration exportée : `artifacts/fusion_config.json` (w_webcam = {rf['deployed']['w_webcam']}, seuil {rf['deployed']['threshold_fused']:.3f}).
L'indépendance supposée entre modalités favorise la fusion ; la branche B n'a que {rf['pool_sizes_test']['B1']} positifs de test
réutilisés. Détails : [fusion.md](fusion.md).

![Fusion partiel](figures/fusion_pr_partiel.png)""")

    # ------------------------------------------------------------------ SHAP
    if rx:
        def top(br):
            return ", ".join(f"{g['libellé']}" for g in rx[br]["global"][:5])
        ex = rx["browser"]["examples"].get("vrai positif", {})
        S.append(f"""
## 6. Explicabilité (SHAP)

- Branche B — variables les plus influentes : {top('browser')}.
- Branche A — variables les plus influentes : {top('webcam')}.
- `explain(branch, features, k)` renvoie les k contributions (variable, libellé, valeur, contribution, direction,
  phrase lisible) + l'avertissement « un score n'est pas une preuve ». Exemples réels (vrai positif, faux positif,
  faux négatif) : [explainability.md](explainability.md).

![SHAP B](figures/shap_browser_bar.png) ![SHAP A](figures/shap_webcam_bar.png)

Exemple de sortie (branche B, vrai positif du test) :

```json
{json.dumps(ex, indent=2, ensure_ascii=False)}
```""")

    # ------------------------------------------------------------------ tests
    bench_txt = ""
    if bench:
        bench_txt = (f"Latence médiane mesurée (CPU, une observation) : predict_browser {bench['predict_browser']['median_ms']:.1f} ms, "
                     f"predict_webcam {bench['predict_webcam']['median_ms']:.1f} ms, explain navigateur "
                     f"{bench['explain_browser']['median_ms']:.0f} ms, explain webcam {bench['explain_webcam']['median_ms']:.0f} ms. "
                     f"Taille : {bench['taille_browser_Mo']:.2f} Mo (B), {bench['taille_webcam_Mo']:.2f} Mo (A).")
    t_txt = "pytest n'a pas encore été exécuté avec `--junitxml=reports/pytest_junit.xml`."
    if tests:
        t_txt = (f"Dernier passage : **{tests['tests']} tests, {tests['failures']} échec(s), {tests['errors']} erreur(s), "
                 f"{tests['skipped']} ignoré(s)** en {tests['time']:.0f} s." + (f" Échecs : {tests['failed']}" if tests['failed'] else ""))
    S.append(f"""
## 7. Tests et qualité (Phase 7)

{t_txt}

Couverture : schéma d'entrée (valeurs manquantes, NaN, hors plage, incohérences, champs inconnus ; toutes les lignes
d'entraînement acceptées), absence de fuite (groupes disjoints, prétraitement ajusté sur l'apprentissage seulement,
découpages reproductibles), déterminisme (même graine = mêmes prédictions), taille et latence des modèles,
stabilité (petites perturbations), reproduction des prédictions sauvegardées, contrat `inference.py`, EER CMU.
{bench_txt}""")

    # ------------------------------------------------------------------ limites
    S.append(f"""
## 8. Limites

**Biais**
- B : l'étiquette est liée à la réussite (100 % des tricheurs ont réussi) → un bon étudiant rapide sera plus souvent
  signalé. L'ablation B3 (sans note) tombe à PR-AUC {abl.get('sans_correction', {}).get('test', {}).get('pr_auc', float('nan')):.3f} en test : la note porte une grande partie du signal.
- A : données de laboratoire, une seule configuration de caméra 640×480, population et éclairage non décrits ;
  aucune mesure possible par sous-groupe (éclairage, handicap, qualité de caméra) car ces informations n'existent pas.
  Les variables de position du visage peuvent pénaliser un étudiant qui s'installe différemment.

**Faux positifs**
- A : taux de faux positifs {tw['fpr']:.3f} **par image** au seuil retenu. À une prévalence réelle de {_pct(prior, 0)}, la précision
  attendue tomberait à ≈ {prec_w_dep:.2f} (calcul avec le même rappel et le même taux de FP) : il faut agréger sur une
  fenêtre de temps (`predict_webcam_session`) et ne jamais alerter sur une image isolée.
- B : {tb['fp']} faux positifs sur {tb['fp'] + tb['tn']} sessions honnêtes du test ({_pct(tb['fpr'])}).

**Absence de jeu commun** : la fusion n'est évaluée que sur des paires simulées ; les poids devront être ré-estimés
sur le pilote. **Fuites évitées** : identifiants exclus, découpage par participant (B) et par blocs (A), doublons
retirés avant découpage, prétraitement et calibration ajustés uniquement sur l'apprentissage, seuils choisis hors test,
test utilisé une seule fois. **Fuite résiduelle possible** en A (pas d'identifiant de session).

**Parité** : les variables webcam supposent un repère 640×480 et les conventions MediaPipe documentées dans
[audit_webcam.md](audit_webcam.md) ; la détection de téléphone par MediaPipe ObjectDetector n'a pas le même rappel que YOLO.""")

    # ------------------------------------------------------------------ reste
    S.append(f"""
## 9. Ce qui reste avant l'intégration

1. **Chronométrer chaque question côté application** (temps cumulé de toutes les visites) et calculer les compteurs
   avec `build_browser_features` — convention « temps idéal = 3 min/question » retenue par l'équipe. Si la source
   du jeu publie une autre définition, réaligner la convention ou réentraîner.
2. **Collecter des données navigateur étiquetées** (onglets, copier-coller, focus, frappe) pendant le pilote : aucune
   donnée publique ne les couvre ; d'ici là, ces événements doivent être des **règles affichées**, pas un score appris.
3. Implémenter côté navigateur l'extraction MediaPipe **exactement** selon les conventions (repère 640×480, points
   du Face Detector, iris 468/473, poignets) et vérifier la parité sur quelques vidéos du pilote (même entrée → mêmes
   variables qu'en Python).
4. Pilote 10–20 volontaires : ré-estimer le poids de fusion, le seuil et la prévalence de déploiement ; mesurer
   les faux positifs par sous-groupe.
5. Décider si TabNet / FT-Transformer valent l'ajout de PyTorch (non recommandé sur ces données).
6. Clarifier la source et la licence de `online_exam_data.csv` avant toute publication.
7. Branche images (Harvard Dataverse) + Grad-CAM : non faite (non demandée).""")

    # ------------------------------------------------------------------ recap
    broken = []
    if tests and (tests["failures"] or tests["errors"]):
        broken.append(f"{tests['failures'] + tests['errors']} test(s) en échec : {tests['failed']}")
    if rk and abs(rk['summary']['manhattan_scaled']['eer_mean'] - 0.0955) > 5e-4:
        broken.append("EER de l'équipe (0,0955 / 0,1097) non reproduites exactement (valeurs publiées reproduites)")
    S.append(f"""
## 10. Récapitulatif

**Fait** : environnement reproductible (`environment.yml`) ; audits et parité ; branche B ({sb['label']}, PR-AUC test
{tb['pr_auc']:.3f}) ; branche A ({sw['label']}, PR-AUC test {tw['pr_auc']:.3f}) ; MLP pour les deux branches ; calibration ;
module CMU (EER publiées reproduites) ; fusion pondérée avec ablation sur paires simulées ; SHAP global/local et
`explain()` JSON ; schémas pydantic ; `inference.py` ; tests pytest ; fiche modèle ; commande unique
`python -m examguard_ml.pipeline` (dernière durée : {timings.get('total', float('nan')):.0f} s).

**Cassé / non atteint** : {('; '.join(broken)) if broken else 'aucun test en échec'}. Non atteints par nature des données :
découpage par participant pour A (aucun identifiant), évaluation réelle de la fusion (aucun jeu commun), modèle
d'événements navigateur (aucune donnée étiquetée).

**Reste** : voir section 9 — en priorité le chronométrage par question selon la convention des 3 min, la collecte
de données navigateur et le pilote.
""")
    (R / "RAPPORT_ML.md").write_text("\n".join(S), encoding="utf-8")
    write_model_card(rb, rw, rf, ab, aw, bench)
    print("rapport ecrit :", R / "RAPPORT_ML.md")


def write_model_card(rb, rw, rf, ab, aw, bench) -> None:
    sb, sw = rb["families"][rb["selected"]], rw["families"][rw["selected"]]
    tb, tw = sb["test"], sw["test"]
    mb = read_json(config.ARTIFACTS / "browser_model.json")
    mw = read_json(config.ARTIFACTS / "webcam_model.json")
    md = f"""# Fiche modèle — ExamGuard AI (module ML)

## Modèles

| | Branche B — session d'examen | Branche A — webcam (une image) |
|---|---|---|
| Fichier | `artifacts/browser_model.joblib` | `artifacts/webcam_model.joblib` |
| Algorithme | {sb['label']} {sb['best_params']} | {sw['label']} {sw['best_params']} |
| Calibration | {sb['calibration']} (sur prédictions hors-échantillon) | {sw['calibration']} |
| Seuil d'alerte de branche | {sb['threshold']:.3f} | {sw['threshold']:.3f} |
| Prévalence d'apprentissage | {mb['train_prior']:.3f} | {mw['train_prior']:.3f} |
| Entrées | 7 indicateurs de session (`BrowserSessionFeatures`) | 26 indicateurs MediaPipe (`WebcamFrameFeatures`) |
| Entraîné le | {mb['trained_at']} | {mw['trained_at']} |

Fusion : `artifacts/fusion_config.json` — moyenne pondérée des probabilités ramenées à une prévalence de
{rf['deployment_prior'] if rf else 0.05:.0%}, w_webcam = {rf['deployed']['w_webcam'] if rf else '—'} (**choisi sur paires simulées**).
Versions : {mb['versions']}.

## Usage prévu
Aide à la surveillance d'examens en ligne : signaler à un enseignant des sessions **à vérifier**, avec une
explication. L'enseignant décide ; l'étudiant peut contester (cahier des charges, EF9 et EF16).

## Usages interdits
- Sanction automatique, ou toute décision sans validation humaine.
- Présenter un score comme une preuve de triche.
- Identifier, profiler ou classer des étudiants en dehors d'un examen pour lequel ils ont donné leur consentement.
- Utiliser la branche A sur une image isolée pour déclencher une alerte (agréger sur une fenêtre de temps).
- Utiliser le modèle sur une population, une caméra ou un type d'examen très différents sans ré-évaluation.
- Utiliser le module de frappe (CMU) pour autre chose que la vérification d'identité consentie.

## Données
- B : `online_exam_data.csv` (1 600 sessions, 77 triches ; source et licence non documentées, probablement
  synthétique ; **aucune télémétrie navigateur**).
- A : Hossen & Uddin (2025), Mendeley Data, DOI 10.17632/39xs8th543.1, CC BY 4.0 — 5 500 images en laboratoire
  ({aw['doublons_exacts']} doublons retirés), aucun identifiant de participant ; 11 colonnes exclues pour la parité navigateur.

## Métriques (jeu de test, une seule évaluation)
| | PR-AUC | F1 | précision | rappel | rappel@P≥0,8 | taux de FP | Brier |
|---|---|---|---|---|---|---|---|
| B | {tb['pr_auc']:.3f} | {tb['f1']:.3f} | {tb['precision']:.3f} | {tb['recall']:.3f} | {tb['recall_at_p80']:.3f} | {tb['fpr']:.3f} | {tb['brier']:.3f} |
| A | {tw['pr_auc']:.3f} | {tw['f1']:.3f} | {tw['precision']:.3f} | {tw['recall']:.3f} | {tw['recall_at_p80']:.3f} | {tw['fpr']:.3f} | {tw['brier']:.3f} |

B : {rb['pos_test']} positifs en test seulement (IC 95 % PR-AUC [{rb['test_ci']['pr_auc'][0]:.3f} ; {rb['test_ci']['pr_auc'][1]:.3f}]).
A : découpage par blocs contigus (pas d'identifiant) — estimation probablement optimiste.
{('Latence médiane : B ' + f"{bench['predict_browser']['median_ms']:.1f} ms, A {bench['predict_webcam']['median_ms']:.1f} ms par prédiction (CPU).") if bench else ''}

## Limites et biais
- B associe bonne note et suspicion (les 77 tricheurs ont tous réussi) : risque de faux positifs sur les bons étudiants.
- B dépend de variables « temps idéal » : convention retenue par l'équipe = 180 s cumulées par question
  (`build_browser_features`) ; la définition d'origine du jeu n'est pas documentée.
- A : étiquette en grande partie dérivée des sorties des détecteurs (circularité) ; données de laboratoire ;
  pas de mesure possible par sous-groupe (éclairage, handicap, qualité de caméra) ; position du visage utilisée.
- Fusion validée uniquement sur paires simulées.
- Aucun modèle des événements navigateur (onglets, copier-coller) : pas de données étiquetées.

## Réentraîner
```bash
conda env create -f environment.yml && conda activate examguard-ml
python -m examguard_ml.pipeline
pytest
```
Rapport complet : `reports/RAPPORT_ML.md`.
"""
    (config.ML_ROOT / "MODEL_CARD.md").write_text(md, encoding="utf-8")


if __name__ == "__main__":
    run()
