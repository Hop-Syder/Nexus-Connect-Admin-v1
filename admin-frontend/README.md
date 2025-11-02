# Nexus Connect Admin – Frontend

Interface d'administration construite avec Next.js 15 (App Router) pour piloter l'API FastAPI du projet.

## Stack

- **Next.js 15** avec App Router (`src/app`) et rendu hybride.
- **TypeScript** et ESLint Next.
- **UI** : Tailwind CSS + Radix UI, composants utilitaires dans `src/components`.
- **State & data fetching** : Zustand (`src/store`), React Query (`@tanstack/react-query`), Axios (`src/lib/api-client.ts`).
- **Charts** : Recharts pour les dashboards analytics.
- **Formulaires** : react-hook-form + Zod.
- **Notifications** : sonner.

## Fonctionnalités principales

- **Authentification & 2FA** :
  - Page de connexion (`src/features/auth/LoginPage.tsx`) avec validation Zod.
  - Gestion des tokens, 2FA TOTP et rafraîchissement via interceptors Axios.
  - Persistance locale (Zustand + `localStorage`), initialisation automatique (`src/components/auth/auth-initializer`).
- **Gestion des utilisateurs** :
  - Liste infinie avec filtres premium/blocage, recherche textuelle, résumé statistique.
  - Sélection multiple, actions groupées (blocage/déblocage, tags, segments), export CSV.
  - Vue détaillée avec historique d'abonnement, tags, champs personnalisés, activité et sessions d'impersonation.
  - Création/gestion des segments utilisateurs.
- **Abonnements** : gestion des plans, attribution manuelle du premium, suivi des expirations, création de coupons, statistiques d'abonnement.
- **Campagnes marketing** : CRUD campagnes, planification/envoi, suivi des stats et templates réutilisables.
- **Support & messages** : boîte de réception, réponses, modèles de message, archivage.
- **Modération** : file d'attente, macros, assignation d'éléments, décisions sur les profils entrepreneurs.
- **Analytics** : tableaux de bord KPI, croissance utilisateur, distribution géographique, revenus, performance contenu et exports.
- **Audit** : consultation, filtrage, export des logs et visualisation des statistiques d'événements.
- **Paramètres** : bascule maintenance, déclenchement de backups, gestion des notifications système, vérification santé.

Chaque section est isolée dans `src/features/<domaine>` et consomme les endpoints documentés dans `src/lib/api-client.ts`.

## Installation & exécution locale

```bash
# Dans admin-frontend/
npm install

# Variables d'environnement
cp env.md .env.local  # ou créez directement .env.local

# Lancer le serveur Next.js
env NEXT_PUBLIC_ADMIN_API_URL="http://localhost:8002/api/admin/v1" npm run dev
```

L'application sera disponible sur `http://localhost:3000`.

## Scripts NPM

- `npm run dev` – développement
- `npm run build` – build production
- `npm run start` – serveur Next.js production
- `npm run lint` – linting Next/TypeScript

## Variables d'environnement

- `NEXT_PUBLIC_ADMIN_API_URL` (obligatoire) : URL de base de l'API. Doit inclure `/api/admin/v1`.

## Authentification côté client

- Les tokens d'accès/rafraîchissement sont stockés dans `localStorage` (`admin_access_token`, `admin_refresh_token`).
- L'intercepteur Axios tente automatiquement un refresh sur 401 puis redirige vers `/login` en cas d'échec.
- `AuthInitializer` récupère `/auth/me` au montage pour hydrater le store et forcer la vérification 2FA.

## Structure du code

```
src/
├── app/            # Routes App Router (auth, dashboard, layout, providers)
├── components/     # UI réutilisable (tableaux, formulaires, navigation)
├── features/       # Pages fonctionnelles regroupées par domaine métier
├── lib/            # API client, utilitaires (formatage, graphiques)
├── store/          # Stores Zustand (auth, préférences…)
├── styles/         # Styles globaux Tailwind
└── types/          # Types TypeScript partagés (utilisateurs, abonnements, analytics…)
```

## Qualité & bonnes pratiques

- Respecter la séparation `features/` pour éviter l'entrelacement des domaines.
- Utiliser React Query pour tout accès réseau afin de bénéficier du cache et de l'invalidation automatique.
- Les actions critiques (impersonation, suppression, bascule maintenance) affichent des toasts : gardez cette cohérence UX.
- Ajoutez des tests (Playwright ou Jest) si vous introduisez de nouvelles interactions critiques.

Bon développement côté interface !
