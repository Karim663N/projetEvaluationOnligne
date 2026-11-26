# États de fraude — calibration et vérification

Règles simples sur les variables webcam reproductibles, calibrées sur les 2299 images **normales
de l'apprentissage** (quantiles 0.005 / 0.995 pour les états bilatéraux, 0.99 pour les unilatéraux) ; vérifiées
une seule fois sur le **jeu de test** (1087 images, 505 triche). Ce sont des faits observés à montrer à
l'enseignant, complémentaires du score ML ; aucun n'est une preuve.

| état | images normales (test) | part normales | images triche (test) | part triche | P(triche \| état) | fiabilité |
|---|---|---|---|---|---|---|
| 📱 Téléphone détecté | 0 | 0.000 | 132 | 0.261 | 1.000 | forte |
| 👥 Plusieurs visages | 0 | 0.000 | 27 | 0.053 | 1.000 | forte |
| 🚫 Visage absent | 0 | 0.000 | 33 | 0.065 | 1.000 | forte |
| ↔️ Tête tournée | 3 | 0.005 | 39 | 0.077 | 0.929 | forte |
| ⬇️ Tête baissée | 0 | 0.000 | 14 | 0.028 | 1.000 | forte |
| 👀 Regard détourné | 15 | 0.026 | 15 | 0.030 | 0.500 | faible |

Au moins un état sur une image : 42.2% des images de triche, 3.1% des images normales.

Lecture : téléphone, plusieurs visages et visage absent n'apparaissent que sur des images de triche dans ce jeu
(étiquetage en partie dérivé des détecteurs, cf. audit). Les états de pose et de regard sont calculés à partir de
points du visage bruités : leur pouvoir discriminant est **faible** sur ce jeu ; ils restent utiles comme contexte
(durée, moment) mais ne doivent pas être lus seuls.

Seuils (`artifacts/fraud_states.json`) : tête tournée si rotation hors [-1.309 ; 0.325] ;
tête baissée si inclinaison > 1.230 ; regard détourné si décalage des
pupilles hors [-0.351 ; 0.374] (horizontal) ou [-2.341 ; 0.203]
(vertical). Côté session : « réponse éclair » = réponse juste en moins de 10 s.

État testé puis retiré : « main près du visage » (0 déclenchement sur le test, triche comme normal).
Fiabilité affichée : forte si P(triche | état) ≥ 0,9 sur le test, moyenne si ≥ 0,7, faible sinon (jeu équilibré :
0,5 = aucune information).
