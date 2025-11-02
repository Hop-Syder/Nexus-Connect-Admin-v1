# Nexus Connect Admin – Backend API

API FastAPI pour le tableau de bord Nexus Connect. Elle fournit des endpoints sécurisés dédiés aux équipes support, modération, marketing et opérations.

## Architecture

- **Framework** : FastAPI 0.110 avec uvicorn/gunicorn.
- **Configuration** : `app/config.py` expose une classe `Settings` (Pydantic) chargée via `.env`.
- **Middlewares** (`app/main.py`) :
  1. `CORSMiddleware` – configuration dynamique via `CORS_ORIGINS`.
  2. `TrustedHostMiddleware` – activé en production.
  3. `RateLimitMiddleware` – quotas par minute avec Redis (`app/middleware/rate_limit.py`).
  4. `JWTAuthMiddleware` – vérification des JWT Supabase (`app/middleware/jwt_auth.py`).
  5. `RBACMiddleware` – enrichissement du profil admin et contrôle des permissions (`app/middleware/rbac.py`).
  6. `AuditMiddleware` – journalisation immuable des actions (`app/middleware/audit.py`).
- **Services** : clients Supabase (`services/supabase_client.py`), SendGrid (`services/email_service.py`), paiements Moneroo (`services/payment_service.py`), exports (`services/export_service.py`).
- **Organisation des routes** : modules FastAPI sous `app/api/admin/v1/` (auth, users, subscriptions, entrepreneurs, messages, campaigns, analytics, audit, settings).

## Fonctionnalités clés par module

| Module | Principales routes |
| --- | --- |
| `auth` | `/auth/login`, `/auth/verify-2fa`, `/auth/refresh`, `/auth/logout`, `/auth/setup-2fa`, `/auth/me` |
| `users` | Listing paginé & filtré, fiches détaillées (`/{user_id}`), mise à jour, suppression douce/définitive, actions groupées (`/bulk-action`), export CSV (`/export/csv`), segments CRUD, impersonation sécurisée |
| `subscriptions` | Gestion des plans (`/plans`), attribution/révocation premium, historique (`/history/{user_id}`), monitoring des expirations, coupons (`/coupons`), statistiques (`/stats`) |
| `entrepreneurs` | File de modération (`/moderation-queue`), statistiques, macros, assignations, changement de statut, consultation/modération de profils |
| `messages` | Boîte de support avec filtres, stats (`/stats/summary`), édition/archivage, réponses, templates |
| `campaigns` | CRUD campagnes, planification, annulation, envoi immédiat, statistiques détaillées, templates marketing |
| `analytics` | KPIs tableau de bord, croissance utilisateurs, distribution géographique, revenus, performance contenu, export de rapports |
| `audit` | Recherche/export de logs, consultation détaillée, statistiques, liste des types d'événements |
| `settings` | Lecture/écriture des paramètres, mises à jour en masse, bascule maintenance, vérification de santé, déclenchement de backups, gestion des notifications |

Toutes les routes (hors santé/auth) exigent un JWT Supabase valide et un profil admin actif (`public.admin_profiles`).

## Prérequis

- Python 3.11+
- Supabase (Auth + tables Postgres `admin.*`)
- Redis (rate limiting, tâches Celery)
- SendGrid (emails transactionnels, optionnel)
- Moneroo (paiements, optionnel)

## Installation & exécution locale

```bash
# Dans admin-backend/
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copier .env
cp env.md .env  # adapter selon vos secrets

# Lancer l'API
env \ \
  SUPABASE_URL=... \ \
  SUPABASE_SERVICE_ROLE_KEY=... \ \
  uvicorn app.main:app --reload --port 8002
```

L'API expose :
- `GET /` informations générales
- `GET /api/admin/v1` index des endpoints
- `GET /health` pour les probes

Pour un environnement proche production :
```bash
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8002
```

## Variables d'environnement

Reportez-vous à `Settings` (toutes obligatoires sauf mention contraire) :

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `APP_NAME`, `APP_VERSION`, `ENVIRONMENT`, `ADMIN_DOMAIN`
- `CORS_ORIGINS`
- `SECRET_KEY`
- `REDIS_URL`
- `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_BURST`
- `SENDGRID_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`
- `IMPERSONATION_TOKEN_EXPIRE_MINUTES`
- `MONEROO_API_KEY`, `MONEROO_SECRET_KEY`, `MONEROO_WEBHOOK_SECRET`, `MONEROO_BASE_URL`
- `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- `LOG_LEVEL`, `ENABLE_OPENTELEMETRY`

## Points d'attention

- **Authentification** : le middleware décode les JWT Supabase, vérifie la 2FA et enrichit `request.state.admin_profile`. Utilisez `Depends(get_current_user)` ou `Depends(get_current_admin_user)` dans vos routes.
- **Rate limiting** : désactivé si Redis indisponible (logs d'avertissement). Prévoir une instance fiable en production.
- **Audit** : chaque action écrit dans `public.audit_logs` avec hash SHA-256 et peut générer des notifications critiques (`admin.notifications`).
- **Exports** : les CSV/Excel sont générés en mémoire et retournés en `StreamingResponse`. Surveillez la taille pour éviter les dépassements mémoire.
- **Sécurité** : les permissions supplémentaires peuvent être appliquées via le décorateur `require_permission`.

## Tests & Qualité

Des suites automatisées ne sont pas fournies. Avant de déployer, il est recommandé de :
- Ajouter des tests Pytest ciblant les endpoints critiques.
- Valider les scripts Celery si vous activez les tâches différées.
- Vérifier les journaux (`logging` niveau INFO) pour suivre la séquence middleware au démarrage/arrêt (`app.main`).

Bon développement côté API !
