This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Interface

- Système de design : `src/app/globals.css` (jetons de couleur `brand` / `ink`, composants `eg-card`, `eg-btn-*`,
  `eg-input`, `eg-badge-*`…) et briques partagées dans `src/components/ui/` (icônes, logo, cartes de statistiques…).
- Cadre commun des trois espaces : `src/components/shell/AppShell.tsx` — barre latérale groupée avec compteurs
  (alertes à examiner, copies à corriger), recherche rapide **Ctrl+K**, langue FR / EN / AR (droite-à-gauche),
  tiroir de navigation sur mobile. Écrans de connexion : `src/components/shell/AuthLayout.tsx`.

## Surveillance ExamGuard AI (module ML)

L'application appelle le service ML ExamGuard AI (dépôt du module ML, dossier `ml/`, fichier `service.py`, FastAPI)
à chaque remise de copie. Flux :

1. **Avant l'examen** : fenêtre de consentement (surveillance obligatoire, webcam facultative et jamais pré-cochée).
2. **Pendant l'examen** (`src/components/exam/ExamRunner.tsx`) : une question à la fois au lieu d'une longue page,
   grille de navigation (répondue / sans réponse / à revoir), raccourcis clavier (← → naviguer, 1–9 ou A–Z répondre,
   F marquer à revoir), enregistrement automatique (reprise après rechargement), minuteur calculé depuis l'heure de
   fin du serveur (remise automatique à 0), écran de révision avant remise.
   La surveillance (`src/lib/use-proctoring.ts`) mesure le temps sur la question réellement affichée, compte les
   événements navigateur (changements d'onglet, pertes de focus, copier/coller/couper, clics droits) et, si la webcam
   est acceptée, extrait 26 indicateurs MediaPipe **dans le navigateur** toutes les 2 s. Aucune image ni vidéo n'est envoyée.
3. **À la remise** (`src/app/api/exams/[id]/submit/route.ts` → `src/lib/proctoring.ts`) : appel de
   `POST {ML_API_URL}/score-session` ; le rapport (scores, alerte, états de fraude, explications SHAP, événements) est
   stocké dans la table `ProctoringReport`. Si le service ML est arrêté, la copie est quand même remise (rapport `ML_UNAVAILABLE`).
4. **Enseignant** : page `/teacher/surveillance` — file de tri (alertes à examiner d'abord, puis risque décroissant),
   une copie dépliée à la fois avec jauge de risque, états observés (fiabilité mesurée), chronologie, explications SHAP ;
   décision confirmer / rejeter / revue (journalisée dans `AuditLog`), puis ouverture automatique de la copie suivante.

Lancer en local (deux terminaux) :

```bash
# 1. service ML (environnement conda examguard-ml), depuis le dossier ml/ du module
python -m uvicorn service:app --host 127.0.0.1 --port 8000

# 2. application, depuis online-evaluation/
npm install
npx prisma db push      # les migrations du dépôt sont incohérentes (ClassEnrollment manquant) : db push recrée le schéma
npm run db:seed         # comptes de démonstration (voir prisma/seed.ts)
npm run dev             # http://localhost:3000
```

Variables facultatives : `ML_API_URL` (défaut `http://127.0.0.1:8000`), `ML_TIMEOUT_MS` (défaut 20000),
`EXAMGUARD_IDEAL_TIME_MODE` : `adaptive` (défaut : médiane des temps de réponse des copies déjà remises pour
l'examen ; repli à 77 % du temps alloué par question tant qu'il y a moins de 30 temps) ou `fixed` (180 s par question,
ancienne convention de l'équipe). Simulation du module ML : 63 % de fausses alertes en `fixed` contre 9 % en
`adaptive` pour un rythme honnête de 75 s par question, triche détectée à 100 % dans les deux cas.
La webcam nécessite Chrome ou Edge sur `localhost` (contexte sécurisé). Un score n'est pas une preuve : l'enseignant décide.

## Question image uploads

Teachers and administrators can upload JPEG, PNG, WebP, and GIF images up to 5 MB while building questions. Files are stored in `public/uploads` and served through the authenticated `/api/uploads/images/[filename]` route so they can be viewed by enrolled students. Production deployments must preserve the `public/uploads` directory between restarts; ephemeral serverless filesystems will need a persistent volume or object storage adapter.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
