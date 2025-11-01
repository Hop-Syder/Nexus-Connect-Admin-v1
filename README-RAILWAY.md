# 🚀 Déploiement sur Railway – Nexus Connect Admin

Ce guide explique comment déployer la plateforme **Nexus Connect Admin** (API FastAPI + dashboard React) sur [Railway](https://railway.app/).
Il couvre la préparation du projet, la configuration des services Railway et la mise en production continue.

---

## 1. Prérequis

- Compte Railway avec un plan adapté (au minimum **Starter** pour gérer deux services).
- Accès au dépôt Git de l’application.
- CLI Railway installée (optionnel mais recommandé) :
  ```bash
  npm install -g @railway/cli
  railway login
  ```
- Variables d’environnement nécessaires (Supabase, Redis, SendGrid, Moneroo…).
- Supabase et Redis déjà provisionnés (Railway peut héberger Redis, Supabase reste externe).

---

## 2. Structure recommandée sur Railway

| Service Railway | Dossier source | Type de service | Commande de démarrage |
| ---------------- | -------------- | ---------------- | --------------------- |
| `admin-backend`  | `admin-backend/` | **Python** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| `admin-frontend` | `admin-frontend/` | **Static Site** (build Node) | `npm run build` (build) / dossier `build` |
| (Optionnel) `redis` | – | Add-on Redis | – |

> Railway crée un service par répertoire. Chaque service dispose de ses variables d’environnement et d’un déploiement indépendant.

---

## 3. Initialiser le projet Railway

1. **Cloner le dépôt** (si ce n’est déjà fait) :
   ```bash
   git clone <URL_DU_DEPOT>
   cd Nexus-Connect-Admin
   ```
2. **Initialiser Railway** depuis la racine du projet :
   ```bash
   railway init
   ```
   - Choisir ou créer un projet Railway.
   - Relier le répertoire `admin-backend` au service backend.
   - Relier le répertoire `admin-frontend` au service frontend.

3. (Optionnel) **Configurer le fichier `railway.toml`** pour déclarer explicitement les services :
   ```toml
   [project]
   name = "nexus-connect-admin"

   [[services]]
   name = "admin-backend"
   path = "admin-backend"
   start = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"

   [[services]]
   name = "admin-frontend"
   path = "admin-frontend"
   build = "npm install && npm run build"
   staticPublishPath = "build"
   ```
   > Ce fichier est facultatif mais permet d’automatiser la configuration depuis la CLI.

---

## 4. Configurer les variables d’environnement

### 4.1 Backend (`admin-backend`)

Dans l’interface Railway : **Service** → **Variables** → ajouter les clés suivantes.

| Variable | Description |
| -------- | ----------- |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Clé publique Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase |
| `SUPABASE_JWT_SECRET` | Secret JWT Supabase |
| `SECRET_KEY` | Secret interne FastAPI |
| `CORS_ORIGINS` | Domaines autorisés (`https://admin.mondomaine.com,https://admin.vercel.app`) |
| `REDIS_URL` | URL Redis (Railway ou externe) |
| `SENDGRID_API_KEY` | Clé SendGrid |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | Expéditeur par défaut |
| `MONEROO_API_KEY` / `MONEROO_SECRET_KEY` | Clés Moneroo |
| `MONEROO_BASE_URL` | Endpoint API Moneroo |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | Si tâches asynchrones |
| `LOG_LEVEL` | Niveau de logs (`INFO`, `DEBUG`, …) |

> Conseil : utiliser une **Variable Group** sur Railway pour partager ces valeurs entre les environnements (staging/production).

### 4.2 Frontend (`admin-frontend`)

Ajouter au minimum :

```
NEXT_PUBLIC_ADMIN_API_URL=https://<service-backend>.up.railway.app/api/admin/v1
NEXT_PUBLIC_APP_ENV=production
```

Ajouter d’autres clés publiques (Supabase, analytics) selon les besoins.

---

## 5. Déploiement du backend FastAPI

1. **Détection automatique** : Railway détecte `requirements.txt` dans `admin-backend/` et installe les dépendances Python 3.11.
2. **Commande de démarrage** : vérifier dans l’onglet **Settings** → **Start Command** que la commande est :
   ```
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
   (ou `gunicorn app.main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT` pour un déploiement plus robuste).
3. **Variables d’environnement** : s’assurer qu’elles sont renseignées avant de déployer.
4. **Déclencher un déploiement** :
   - Via l’interface : bouton **Deploy**.
   - Via la CLI :
     ```bash
     railway up
     ```
5. **Vérifier la santé** :
   - Logs Railway (`railway logs` ou onglet **Logs**).
   - Endpoint `https://<backend>.up.railway.app/api/admin/v1/settings/health/check`.

---

## 6. Déploiement du frontend React

1. **Commande de build** : définir `npm install` comme commande de build et `npm run build` comme commande de production (Railway Static Site).
2. **Dossier de publication** : `admin-frontend/build`.
3. **Variables d’environnement** : définir `NEXT_PUBLIC_*` avant le build.
4. **Déploiement** : `railway up` depuis `admin-frontend/` ou déclenchement via l’interface.
5. **Configuration DNS** : pointer votre domaine personnalisé vers le domaine Railway fourni (CNAME). Configurer HTTPS depuis l’onglet **Domains**.

---

## 7. Base de données & services additionnels

- **Supabase** : exécuter les migrations SQL (tables `admin.*`) avant la mise en production. Gérer les RLS policies et les rôles.
- **Redis** : ajouter l’add-on Redis Railway et récupérer l’URL pour `REDIS_URL`.
- **Tâches planifiées** : utiliser `Railway Cron` ou Supabase `pg_cron` pour les jobs récurrents.

---

## 8. Intégration continue (facultatif mais recommandé)

- Activer les **Deployments automatiques** via GitHub : connecter le dépôt au projet Railway et choisir la branche (`main` ou `production`).
- Ajouter un workflow GitHub Actions qui exécute les tests (`pytest`, `npm run test`) avant chaque push vers la branche de déploiement.

Exemple de script CI minimal :
```yaml
name: CI
on: [push]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r admin-backend/requirements.txt
      - run: pytest
        working-directory: admin-backend

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
        working-directory: admin-frontend
      - run: npm run test -- --watch=false
        working-directory: admin-frontend
```

---

## 9. Checklist post-déploiement

- [ ] Variables d’environnement complètes et à jour.
- [ ] Endpoint de santé (`/settings/health/check`) renvoie `200`.
- [ ] Accès administrateur créé (table `admin.admin_profiles`).
- [ ] Jobs planifiés vérifiés (pg_cron ou Railway Cron).
- [ ] Monitoring configuré : logs Railway, alertes email/Slack.
- [ ] Domaine personnalisé et HTTPS actifs pour le frontend.
- [ ] Tests manuels effectués sur les flux critiques (auth, modération, analytics).

---

## 10. Support & ressources

- Documentation Railway : https://docs.railway.app/
- FastAPI Deployment : https://fastapi.tiangolo.com/deployment/
- React Build & Deploy : https://create-react-app.dev/docs/deployment/
- Contact équipe Nexus : `tech@hop-syder.com`

---

**Auteur :** Équipe technique Hop-Syder (@hopsyder)  
**Dernière mise à jour :** Février 2025
