# Déploiement sur Railway

Ce guide résume la configuration de Nexus Connect Admin (API FastAPI + interface Next.js) sur [Railway](https://railway.app/). Il s'appuie exclusivement sur les fonctionnalités présentes dans le dépôt : Procfile backend, scripts NPM frontend et variables déclarées dans `app/config.py` et `src/lib/api-client.ts`.

## 1. Préparation du projet Railway

1. Créez un nouveau projet Railway.
2. Ajoutez deux services :
   - **Service API** connecté au dossier `admin-backend/` (Python).
   - **Service Frontend** connecté au dossier `admin-frontend/` (Node.js/Next.js).
3. Activez le déploiement automatique sur les branches souhaitées (`main` ou `production`).

## 2. Service API FastAPI

### Build & Start
- **Builder** : Python 3.12
- **Build command** : `pip install -r admin-backend/requirements.txt`
- **Start command** : `cd admin-backend && gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`
- **Health check** : `/health`

### Variables d'environnement requises
Les clés correspondent aux attributs de `Settings` (`admin-backend/app/config.py`). Complétez-les avec vos valeurs Supabase/Redis/SendGrid/Moneroo.

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | URL de votre instance Supabase |
| `SUPABASE_ANON_KEY` | Clé publique Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase (accès complet) |
| `SUPABASE_JWT_SECRET` | Secret JWT Supabase |
| `SECRET_KEY` | Clé secrète FastAPI |
| `CORS_ORIGINS` | Origines autorisées (ex. `https://admin.example.com`) |
| `ENVIRONMENT` | `production` sur Railway |
| `ADMIN_DOMAIN` | Domaine de l'interface admin |
| `REDIS_URL` | URL Redis managé (Railway propose un plugin) |
| `RATE_LIMIT_PER_MINUTE` | Limite par administrateur (ex. `120`) |
| `RATE_LIMIT_BURST` | Burst autorisé |
| `SENDGRID_API_KEY` | Clé SendGrid pour l'envoi d'e-mails |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | Expéditeur par défaut |
| `IMPERSONATION_TOKEN_EXPIRE_MINUTES` | Durée impersonation |
| `MONEROO_*` | Clés Moneroo si paiement actif |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | URL Redis pour tâches différées |
| `LOG_LEVEL` | Niveau de logs |
| `ENABLE_OPENTELEMETRY` | `false` (ou `true` si instrumentation) |

> Pensez à fournir les mêmes variables au processus de build si certaines sont lues à l'import (ex. SendGrid).

### Services complémentaires
- **Redis** : créez un plugin Redis Railway et référencez l'URL dans `REDIS_URL` + `CELERY_*`.
- **Supabase** : configurez les tables `admin.*` attendues par les routes (utilisateurs, audit, notifications…).
- **Stockage** : les exports CSV/Excel sont générés en mémoire, aucun service additionnel n'est requis.

## 3. Service Frontend Next.js

### Build & Start
- **Builder** : Node.js 22
- **Build command** : `cd admin-frontend && npm install && npm run build`
- **Start command** : `cd admin-frontend && npm run start`
- **Port** : 3000 (Railway le fournit via `$PORT` automatiquement)

### Variables d'environnement
| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_ADMIN_API_URL` | URL publique du service API déployé (ex. `https://<api-service>.up.railway.app/api/admin/v1`) |

### Notes spécifiques
- L'application utilise `localStorage` pour stocker les tokens (`admin_access_token`, `admin_refresh_token`). Assurez-vous que le domaine est servi en HTTPS pour éviter les problèmes de sécurité.
- Les notifications toast (`sonner`) et la 2FA nécessitent que l'API expose correctement `/auth/verify-2fa`.

## 4. Post-déploiement

1. **Tester l'accès** : rendez-vous sur le domaine Railway du frontend, connectez-vous avec un administrateur actif.
2. **Vérifier les middlewares** : consultez les logs pour confirmer la création d'événements d'audit (`AuditMiddleware`) et l'absence d'erreurs Redis.
3. **Configurer les alertes** : utilisez les endpoints `/settings/notifications` et `/settings/health/check` pour surveiller l'état du système.
4. **Sécurité** : mettez à jour `CORS_ORIGINS` et `ADMIN_DOMAIN` pour refléter vos domaines custom (Railway + production finale).

## 5. Déploiements ultérieurs

- Les pushes sur la branche suivie déclenchent automatiquement un redeploy.
- Pour des migrations/corrections sensibles, déployez d'abord sur un environnement Railway secondaire, validez, puis promouvez.
- Ajoutez des tests automatisés (Pytest/Playwright) dans vos workflows CI/CD avant de déclencher le redeploy en production.

Bonne mise en production !
