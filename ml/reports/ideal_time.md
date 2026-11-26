# Règle « temps idéal » — vérification par SIMULATION

> Simulation : 25 promotions de 28 étudiants honnêtes + 2 tricheurs par rythme d'examen,
> 20 questions. Honnêtes : temps log-normaux autour du rythme, ~65 % de bonnes réponses. Tricheurs : 5–20 s par
> question, 95 % de bonnes réponses. Hypothèses à remplacer par les données du pilote.

Constat sur les données réelles (`online_exam_data.csv`) : un étudiant honnête a en médiane **50 %** de réponses
« dans le temps idéal » ; seuls 4,2 % en ont 100 %. La règle fixe de 180 s met presque toutes les réponses d'un étudiant
normal « dans le temps idéal » : il sort du domaine appris.

| rythme (s/question, honnêtes) | temps idéal | fausses alertes (honnêtes) | tricheurs détectés |
|---|---|---|---|
| 40 | 180 s fixe | 0.67 | 1.00 |
| 40 | médiane de l'examen | 0.12 | 1.00 |
| 75 | 180 s fixe | 0.63 | 1.00 |
| 75 | médiane de l'examen | 0.09 | 1.00 |
| 120 | 180 s fixe | 0.46 | 1.00 |
| 120 | médiane de l'examen | 0.13 | 1.00 |
| 200 | 180 s fixe | 0.16 | 1.00 |
| 200 | médiane de l'examen | 0.17 | 1.00 |

Règle adaptative : temps idéal = médiane des temps de réponse de toutes les copies de l'examen (≈ 50 % des réponses
d'un étudiant typique en dessous, comme dans le jeu d'entraînement). Elle suppose qu'une majorité d'étudiants est
honnête et nécessite quelques copies avant d'être stable (repli prévu dans l'application).
