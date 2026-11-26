# Module CMU Keystroke — reproduction des EER

Protocole Killourhy & Maxion (2009) : 51 sujets, 31 variables temporelles,
200 saisies d'apprentissage, 200 saisies légitimes de test et 5 × 50 = 250 saisies d'imposteurs par sujet.
EER par sujet puis moyenne. Le script d'origine de l'équipe n'a pas été trouvé sur le disque : le protocole a été
réimplémenté (`src/examguard_ml/keystroke.py`) et testé (`tests/test_keystroke.py`).

| détecteur | EER moyen (interpolé) | écart-type | EER moyen (point le plus proche) | valeur équipe | valeur publiée | écart à la valeur équipe |
|---|---|---|---|---|---|---|
| manhattan_scaled | 0.0962 | 0.0694 | 0.0961 | 0.0955 | 0.0962 | 0.0007 |
| mahalanobis | 0.1101 | 0.0645 | 0.1100 | 0.1097 | 0.1101 | 0.0004 |

Sujets les plus difficiles (EER Manhattan la plus élevée) :

| subject | manhattan_scaled_eer | mahalanobis_eer |
|---|---|---|
| s047 | 0.3250 | 0.2680 |
| s031 | 0.2750 | 0.2300 |
| s032 | 0.2720 | 0.2840 |
| s002 | 0.2400 | 0.2650 |
| s035 | 0.1950 | 0.1550 |

Usage dans ExamGuard : vérification d'identité (usurpation), **pas** détection de triche ; texte fixe
(`.tie5Roanl`) à faire taper à l'inscription puis pendant l'examen. Hors fusion.
