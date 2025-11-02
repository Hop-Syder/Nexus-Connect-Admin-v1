# Nexus Connect Admin

## Aperçu

Nexus Connect Admin est un tableau de bord d'administration complet pour l'écosystème Nexus Partners. Le dépôt réunit :

- **`admin-backend/`** : une API FastAPI sécurisée qui s'appuie sur Supabase pour l'identité, la gestion des utilisateurs, la modération, les campagnes marketing, les abonnements premium et la journalisation d'audit.
- **`admin-frontend/`** : une interface Next.js 15 (App Router) destinée aux équipes support, marketing et modération. Elle consomme les endpoints de l'API, gère la session via des JWT Supabase, prend en charge la 2FA et expose des outils interactifs pour piloter la plateforme.

Ces deux projets coopèrent pour offrir une gouvernance centralisée des communautés Nexus (utilisateurs, entrepreneurs, contenus, paiements, support).

## Fonctionnalités majeures

### Côté API (FastAPI)
- Authentification administrateur via Supabase Auth, rafraîchissement de tokens, support de la double authentification TOTP et révocation de session.
- Middleware en chaîne (CORS, hôtes de confiance, limitation de débit Redis, authentification JWT, contrôle RBAC, audit immuable) garantissant sécurité et traçabilité.
- Gestion des utilisateurs : pagination cursor-based, filtres riches, mise à jour de profils, export CSV, actions groupées (blocage, tags, segments), impersonation temporaire et suivi des activités.
- Abonnements premium : création/édition de plans, gestion de coupons, attribution/révocation manuelle de privilèges, statistiques de revenus et surveillance des expirations.
- Modération des entrepreneurs : file d'attente, macros de réponse, assignations, changement de statut et consultation des profils détaillés.
- Support & messaging : centralisation des tickets, réponses assistées, modèles de message et archivage.
- Campagnes marketing : création de campagnes multi-étapes, planification/annulation/envoi, templates d'email et suivi détaillé des performances.
- Analytics consolidés (utilisateurs, géographie, revenus, contenu) et exports dédiés.
- Audit trail complet, consultation/filtrage/export des logs et notifications critiques aux administrateurs.
- Gestion centralisée des paramètres (feature flags, maintenance, backups, notifications d'alerte, santé des services).

### Côté interface (Next.js)
- Authentification avec formulaire `react-hook-form`, gestion du flux 2FA, persistance Zustand, initialisation automatique de session et rafraîchissement de token via Axios interceptors.
- Tableau de bord utilisateur avec `@tanstack/react-query` : recherche instantanée, filtres premium/blocage, sélection multiple, actions bulk, segments enregistrés, exports CSV, fiches détaillées et impersonation sécurisée.
- Sections dédiées aux abonnements, campagnes, support, modération, analytics, audit et paramètres, toutes connectées aux endpoints correspondants.
- Widgets analytiques (recharts, cartes KPI) couvrant croissance utilisateur, revenus récurrents, performance de contenu et santé des services.
- Interface réactive avec design system Radix UI + Tailwind, notifications `sonner`, composants modulaires dans `src/components` et `src/features`.

## Structure du dépôt

```
.
├── admin-backend/      # API FastAPI + middleware + services Supabase
├── admin-frontend/     # Application Next.js 15 App Router
├── README-RAILWAY.md   # Guide de déploiement Railway
└── env.md / DEPLOY_*   # Documents d'environnement spécifiques
```

Chaque sous-projet dispose de son propre `README.md` détaillant la configuration locale, les variables d'environnement et les workflows associés.

## Prise en main rapide

1. **Cloner le dépôt** puis installer les dépendances de chaque sous-projet (voir leurs README respectifs).
2. **Configurer Supabase et Redis** en remplissant les variables listées dans `admin-backend/app/config.py` et `admin-frontend/.env.example` (voir les sections configuration des README dédiés).
3. **Lancer l'API** : `uvicorn app.main:app --reload --port 8002` depuis `admin-backend`.
4. **Démarrer le front** : `npm install && npm run dev` depuis `admin-frontend`, puis ouvrir `http://localhost:3000`.
5. **Authentification** : utilisez un compte admin Supabase actif (table `public.admin_profiles`). Activez la 2FA depuis l'interface si nécessaire.

## Déploiement

- **Backend** : compatible Gunicorn/Uvicorn (voir `admin-backend/Procfile`) et optimisé pour Railway/Render/Heroku. Configurez Redis, SendGrid et les secrets Supabase avant mise en production.
- **Frontend** : Next.js statique/hybride. Peut être déployé sur Vercel ou Railway en ciblant l'API via `NEXT_PUBLIC_ADMIN_API_URL`.

Des instructions spécifiques pour Railway sont fournies dans `README-RAILWAY.md`.

## Contributions & Qualité

- Respecter la séparation front/back, la modularité et les conventions existantes (`features/`, `components/`, `services/`).
- Ajouter des tests ou scripts de vérification si de nouvelles fonctionnalités critiques sont introduites (ex. scénarios Pytest, tests Playwright, lint).
- Documenter toute modification notable dans les README correspondants pour garder la synchronisation entre code et guides d'exploitation.

Bon développement !
