# Audit — CMU Keystroke Dynamics (`DSL-StrongPasswordData.csv`)

Source : K. S. Killourhy & R. A. Maxion, « Comparing Anomaly-Detection Algorithms for Keystroke Dynamics »,
DSN 2009. Données du *Keystroke Dynamics – Benchmark Data Set* (CMU), mises à disposition pour la recherche
(citer l'article). Fichier fourni par l'équipe, SHA-256 `b11d23538b1865fa…`.

## Schéma

- 20400 lignes, 51 sujets, 8 sessions × 50 répétitions = 400 saisies par sujet.
- Mot de passe fixe `.tie5Roanl` + Entrée ; 31 variables temporelles (secondes) :
  11 durées d'appui (H), 10 intervalles appui-appui (DD), 10 intervalles relâché-appui (UD).
- Valeurs manquantes : 0 ; doublons : 0.
- UD négatifs (touche suivante enfoncée avant le relâchement) : 22118 valeurs — normal (chevauchement).
- **Redondance exacte** : DD = H + UD (écart max 0.0000 s, arrondi des données) →
  rang numérique 21 pour 31 variables : la matrice de covariance est
  quasi singulière (le détecteur de Mahalanobis utilise une pseudo-inverse).

| variable | mean | std | min | max |
|---|---|---|---|---|
| H.period | 0.0934 | 0.0296 | 0.0014 | 0.3761 |
| DD.period.t | 0.2641 | 0.2205 | 0.0187 | 12.5061 |
| UD.period.t | 0.1708 | 0.2268 | -0.2358 | 12.4517 |
| H.t | 0.0857 | 0.0274 | 0.0093 | 0.2411 |
| DD.t.i | 0.1691 | 0.1235 | 0.0011 | 4.9197 |
| UD.t.i | 0.0834 | 0.1258 | -0.1621 | 4.7999 |
| H.i | 0.0816 | 0.0269 | 0.0032 | 0.3312 |
| DD.i.e | 0.1594 | 0.2269 | 0.0014 | 25.9873 |
| UD.i.e | 0.0778 | 0.2285 | -0.1600 | 25.9158 |
| H.e | 0.0891 | 0.0306 | 0.0021 | 0.3254 |
| DD.e.five | 0.3774 | 0.2653 | 0.0013 | 4.9618 |
| UD.e.five | 0.2883 | 0.2667 | -0.1505 | 4.8827 |
| H.five | 0.0769 | 0.0217 | 0.0014 | 0.1989 |
| DD.five.Shift.r | 0.4389 | 0.2603 | 0.1694 | 8.3702 |
| UD.five.Shift.r | 0.3620 | 0.2609 | 0.0856 | 8.2908 |
| H.Shift.r | 0.0959 | 0.0339 | 0.0014 | 0.2817 |
| DD.Shift.r.o | 0.2509 | 0.1745 | 0.0494 | 4.1523 |
| UD.Shift.r.o | 0.1550 | 0.1816 | -0.0865 | 4.0120 |
| H.o | 0.0884 | 0.0264 | 0.0069 | 0.6872 |
| DD.o.a | 0.1569 | 0.1066 | 0.0012 | 2.8567 |
| UD.o.a | 0.0686 | 0.1085 | -0.2287 | 2.8152 |
| H.a | 0.1063 | 0.0388 | 0.0040 | 2.0353 |
| DD.a.n | 0.1507 | 0.1074 | 0.0011 | 3.3278 |
| UD.a.n | 0.0444 | 0.1052 | -0.2355 | 2.5242 |
| H.n | 0.0899 | 0.0307 | 0.0037 | 0.3577 |
| DD.n.l | 0.2026 | 0.1502 | 0.0013 | 4.0252 |
| UD.n.l | 0.1127 | 0.1596 | -0.1758 | 3.9782 |
| H.l | 0.0956 | 0.0283 | 0.0037 | 0.3407 |
| DD.l.Return | 0.3218 | 0.2254 | 0.0083 | 5.8836 |
| UD.l.Return | 0.2263 | 0.2308 | -0.1245 | 5.8364 |
| H.Return | 0.0883 | 0.0275 | 0.0029 | 0.2651 |

## Étiquettes, identifiants et fuite

- **Aucune étiquette de triche** : le jeu sert uniquement à la vérification d'identité par la frappe
  (détection d'usurpation : quelqu'un d'autre tape à la place de l'étudiant).
- Identifiant `subject` présent : le protocole (Killourhy & Maxion) sépare strictement apprentissage
  (200 premières saisies du sujet légitime) et test (200 suivantes + 5 premières de chacun des 50 imposteurs).
  Les sessions d'apprentissage et de test sont disjointes (sessions 1–4 vs 5–8) : pas de fuite.

## Parité

H, DD et UD se calculent dans le navigateur avec `keydown`/`keyup` et `performance.now()` (résolution
navigateur ≈ 0,1 ms à quelques ms selon les protections anti-empreinte). **Limite** : texte fixe ; il faut faire
taper la même phrase à l'inscription et pendant l'examen. Ce module n'entre pas dans la fusion (pas d'étiquette
de triche).
