# Nexus Connect Admin – Guide de déploiement

Ce document décrit la procédure recommandée pour installer, configurer et déployer la plateforme **Nexus Connect Admin**, composée d’une API FastAPI (`admin-backend`) et d’un tableau de bord React (`admin-frontend`). Toutes les étapes ci‑dessous sont adaptées pour une mise en production sur un environnement cloud moderne (Vercel/Netlify pour le frontend, VPS ou service managé pour l’API).

---

## 1. Vue d’ensemble

### Architecture logique

```
Utilisateurs Admin ──> Frontend React (Vercel/Netlify) ──> API FastAPI (Gunicorn/Uvicorn)
                                                        └─> Supabase (PostgreSQL + Auth + Storage)
                                                        └─> Redis (Rate limiting / cache)
                                                        └─> Services externes (SendGrid, Moneroo, pg_cron…)
```

- **Frontend** : React 18 + TypeScript, Tailwind, TanStack Query, Recharts.
- **Backend** : FastAPI 0.104, Supabase client, Redis, tâches programmées.
- **Base de données** : Supabase PostgreSQL avec RLS, tables `admin.*`.
- **Sécurité** : Auth Supabase (JWT), RBAC middleware, audit trail immuable, MFA.

---

## 2. Pré-requis

- **Python** 3.11+
- **Node.js** 18.x + npm (ou pnpm/yarn si adapté)
- **PostgreSQL** (géré par Supabase)
- **Redis** (local ou managé)
- **Docker** (optionnel mais fortement recommandé pour l’API)
- Comptes externes : Supabase, SendGrid, Moneroo (paiements)

---

## 3. Structure du projet

```
.
├── admin-backend/           # API FastAPI
│   ├── app/
│   ├── requirements.txt
│   └── (fichiers uvicorn/gunicorn)
├── admin-frontend/          # App React
│   ├── src/
│   ├── package.json
│   └── (config Tailwind/Craco)
└── README.md (ce document)
```

---

## 4. Configuration des variables d’environnement

### Backend (`admin-backend/.env` à créer)

| Clé | Description |
| --- | ----------- |
| `SUPABASE_URL` | URL projet Supabase |
| `SUPABASE_ANON_KEY` | clé publique (utilisée pour certains appels) |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service (ACL) |
| `SUPABASE_JWT_SECRET` | secret JWT Supabase |
| `SECRET_KEY` | secret interne FastAPI |
| `CORS_ORIGINS` | origines autorisées (`https://admin.mondomaine.com,https://admin.vercel.app`) |
| `REDIS_URL` | `redis://` complet pour cache/rate limiting |
| `SENDGRID_API_KEY` | clé API SendGrid |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | expéditeur par défaut |
| `MONEROO_API_KEY` / `MONEROO_SECRET_KEY` | config paiements |
| `MONEROO_BASE_URL` | URL API Moneroo |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | si tâches asynchrones |
| `LOG_LEVEL` | (ex: `INFO`) |

### Frontend (`admin-frontend/.env`)

```
NEXT_PUBLIC_ADMIN_API_URL=https://api.mondomaine.com/api/admin/v1
NEXT_PUBLIC_APP_ENV=production
```

(Ajouter au besoin d’autres clés publiques : Supabase, services analytics, etc.)

---

## 5. Préparation Supabase & Redis

1. Importer ou exécuter les migrations créant les tables `admin.*` (audit_logs, system_settings, notifications, system_jobs, user_segments, etc.).  
   - Utiliser Supabase SQL Editor ou des migrations locales (Alembic non fournis mais recommandés).
2. Activer les policies RLS et rôles côté Supabase (cf. documentation interne).
3. Configurer **pg_cron** pour les tâches d’expiration d’abonnements si besoin.
4. Redis : provisionner une instance managée (ex. Upstash, AWS Elasticache) ou locale (`docker run -p 6379:6379 redis:7`).

---

## 6. Installation locale (développement)

### 6.1 Backend

```bash
cd admin-backend
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env  # si disponible, sinon créer .env avec les clés ci-dessus
uvicorn app.main:app --reload --host 0.0.0.0 --port 8002
```

API Swagger : http://localhost:8002/api/admin/v1/docs

### 6.2 Frontend

```bash
cd admin-frontend
npm install
cp .env.example .env  # si présent
npm run dev
```

Application : http://localhost:3000 (assure-toi que `NEXT_PUBLIC_ADMIN_API_URL` pointe vers l’API locale).

---

## 7. Tests & QA

- **Backend** : ajouter/adapter tests Pytest (dossier `tests/`). Exemple :

  ```bash
  cd admin-backend
  pytest
  ```

- **Frontend** : lint Next.js (`npm run lint`).  
- Vérification manuelle des flux critiques : connexion 2FA, audit logs, gestion utilisateurs, workflows de modération, analytics.

---

## 8. Déploiement production

### 8.1 Backend FastAPI

Option 1 – **Docker (recommandé)** :

1. Créer un `Dockerfile` (exemple rapide) :

   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   COPY admin-backend/requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY admin-backend /app
   ENV PYTHONUNBUFFERED=1
   CMD ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000", "--workers", "4"]
   ```

2. Builder et pousser l’image :

   ```bash
   docker build -t registry.example.com/nexus-admin-backend:latest .
   docker push registry.example.com/nexus-admin-backend:latest
   ```

3. Déployer sur votre orchestrateur (AWS ECS/Fargate, DigitalOcean Apps, Render…).  
   - Exposer le port 8000 derrière un reverse proxy (Traefik, Nginx, AWS ALB).  
   - Charger les variables d’environnement (section §4).  
   - Activer HTTPS + monitoring (ex: Datadog).

Option 2 – **Service managé (Render, Railway, etc.)** :  
pointer vers repo Git, configurer `gunicorn app.main:app -k uvicorn.workers.UvicornWorker`.  

### 8.2 Frontend (Vercel / Netlify)

1. Ajouter les variables `NEXT_PUBLIC_ADMIN_API_URL` + éventuelles clés publiques.  
2. Commande de build : `npm run build`  
3. Dossier de publication : `admin-frontend/build`  
4. Configurer domaine `admin.hop-syder.com`, redirections HTTPS, headers de sécurité (CSP, HSTS).

### 8.3 Intégration continue (recommandée)

- **GitHub Actions** ou GitLab CI :
  - Lint + tests backend/frontend sur chaque PR.
  - Build conteneur backend -> push registry.
  - Déploiement automatisé (environnement staging puis prod).

---

## 9. Tâches post-déploiement

- Vérifier les tables `admin.system_settings` et initialiser les clés critiques (maintenance, e-mail, quotas).  
- Ajouter les administrateurs dans `admin.admin_profiles` (rôle, MFA requis).  
- Créer notifications/alertes (ex: exporter logs => email).  
- Configurer jobs planifiés (expiration abonnements, relances J-7/J-3/J0).  
- Mettre en place la surveillance :  
  - Uptime (health check `/api/admin/v1/settings/health/check`)  
  - Logs centralisés (ELK, CloudWatch…)  
  - Alertes sur `audit_logs` (événements `CRIT`).

---

## 10. Résolution de problèmes

| Symptôme | Piste |
| -------- | ----- |
| 401 sur API | Vérifier Supabase JWT secret & CORS |
| RBAC 403 | Associer l’utilisateur à `admin.admin_profiles` + scopes |
| Export audit invalide | S’assurer que `log_hash` est recalculé (versions récentes) |
| Maintenance inactive | Vérifier réglages `system.maintenance.enabled` / Redis |
| Graphiques vides | API analytics -> vérifier Supabase (tables `admin.dashboard_kpis`, `entrepreneurs`, `admin.moderation_queue`) |

---

## 11. Ressources supplémentaires

- Documentation FastAPI : https://fastapi.tiangolo.com/
- Supabase : https://supabase.com/docs
- Vercel : https://vercel.com/docs
- Netlify : https://docs.netlify.com/
- Gunicorn/Uvicorn : https://www.uvicorn.org/deployment/

---

**Contact & Ownership**  
Équipe technique Hop-Syder – Janvier 2024.  
Mainteneur principal : `tech@hop-syder.com`.
