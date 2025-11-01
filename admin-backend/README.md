# 🎯 Nexus Connect - Admin Backend API v2.1

**Backend FastAPI pour le Tableau de Bord d'Administration Hop-Syder/News**

---

## 🚀 Quick Start

### 1. Installation

```bash
cd /app/admin-backend
pip install -r requirements.txt
```

### 2. Configuration

Copier `.env.example` vers `.env` et remplir les variables:

```bash
cp .env.example .env
# Éditer .env avec vos credentials
```

**Variables critiques:**
- `SUPABASE_*`: Credentials depuis Supabase Dashboard
- `SECRET_KEY`: Générer avec `openssl rand -hex 32`
- `SENDGRID_API_KEY`: Clé SendGrid pour les e-mails
- `MONEROO_*`: Clés Moneroo.io pour les paiements

### 3. Base de données

Exécuter le schéma SQL dans Supabase:

```bash
# Aller dans Supabase Dashboard > SQL Editor
# Copier-coller /app/admin_database_schema.sql
# Exécuter
```

### 4. Lancer le serveur

```bash
# Développement (avec hot reload)
python -m app.main

# Production (via supervisor)
sudo supervisorctl restart admin-backend
```

Serveur disponible sur: **http://localhost:8002**

Documentation interactive: **http://localhost:8002/api/admin/v1/docs**

---

## 📚 API Endpoints

### Authentication (`/api/admin/v1/auth`)
- `POST /login` - Login admin
- `POST /verify-2fa` - Vérifier code 2FA
- `POST /refresh` - Rafraîchir token
- `POST /logout` - Déconnexion
- `POST /setup-2fa` - Configurer 2FA
- `GET /me` - Profil admin courant

### Users (`/api/admin/v1/users`)
- `GET /` - Liste utilisateurs (filtres, pagination cursor)
- `GET /{user_id}` - Détails utilisateur
- `PUT /{user_id}` - Mettre à jour
- `DELETE /{user_id}` - Supprimer (soft/hard)
- `POST /bulk-action` - Actions groupées
- `GET /export/csv` - Export CSV
- `POST /segments` - Créer segment
- `GET /segments` - Liste segments

### Subscriptions (`/api/admin/v1/subscriptions`)
- `GET /plans` - Liste plans
- `POST /plans` - Créer plan
- `POST /grant-premium` - Attribuer premium
- `POST /revoke-premium` - Révoquer premium
- `GET /history/{user_id}` - Historique abonnements
- `GET /expiring-soon` - Abonnements expirant
- `POST /coupons` - Créer coupon
- `GET /coupons` - Liste coupons
- `GET /stats` - Stats abonnements

### Entrepreneurs (`/api/admin/v1/entrepreneurs`)
- `GET /moderation-queue` - File de modération
- `GET /entrepreneurs/{id}` - Détails pour modération
- `POST /entrepreneurs/{id}/moderate` - Décision modération
- `POST /entrepreneurs/{id}/assign` - Assigner modérateur
- `GET /moderation-stats` - Stats modération
- `GET /macros` - Macros de décision

### Messages (`/api/admin/v1/messages`)
- `GET /` - Liste messages
- `GET /{message_id}` - Détails message
- `PUT /{message_id}` - Mettre à jour
- `POST /{message_id}/reply` - Répondre
- `POST /{message_id}/archive` - Archiver
- `GET /stats/summary` - Stats messages

### Campaigns (`/api/admin/v1/campaigns`)
- `GET /` - Liste campagnes
- `POST /` - Créer campagne
- `GET /{campaign_id}` - Détails campagne
- `POST /{campaign_id}/send` - Envoyer (ou test)
- `GET /templates` - Liste templates
- `POST /templates` - Créer template

### Analytics (`/api/admin/v1/analytics`)
- `GET /dashboard` - KPIs dashboard
- `GET /users/growth` - Croissance utilisateurs
- `GET /users/geo` - Répartition géo
- `GET /subscriptions/revenue` - Stats revenus
- `GET /content/stats` - Stats contenu
- `GET /export/csv` - Export analytics

### Audit (`/api/admin/v1/audit`)
- `GET /logs` - Liste logs d'audit
- `GET /logs/{log_id}` - Détails log
- `GET /export` - Export signé (CSV)
- `GET /stats` - Stats audit
- `GET /event-types` - Types d'événements

### Settings (`/api/admin/v1/settings`)
- `GET /` - Tous les paramètres
- `GET /{setting_key}` - Paramètre spécifique
- `PUT /{setting_key}` - Mettre à jour
- `PUT /bulk-update` - Mise à jour groupée
- `GET /health/check` - Vérification santé
- `POST /backup/trigger` - Déclencher backup
- `GET /notifications` - Notifications admin
- `PUT /notifications/{id}/read` - Marquer comme lu

---

## 🔐 Sécurité

### Middleware Stack

1. **CORS** - Domaines autorisés uniquement
2. **Trusted Host** - Vérification domaine (prod)
3. **Rate Limiting** - 100 req/min par admin (Redis)
4. **JWT Authentication** - Vérification signature Supabase
5. **RBAC** - Contrôle d'accès par rôle/scope
6. **Audit Logging** - Enregistrement immuable

### Rôles

- **admin**: Accès complet
- **moderator**: Modération + lecture users
- **support**: Messages + lecture users
- **viewer**: Analytics + audit (lecture seule)

### MFA (2FA)

- TOTP obligatoire pour tous les admins
- Compatible Google Authenticator / Authy
- Setup: `POST /auth/setup-2fa`
- Verify: `POST /auth/verify-2fa`

---

## 📊 Monitoring & Logs

### Health Check

```bash
curl http://localhost:8002/health
```

### Logs

```bash
# Backend logs
tail -f /var/log/supervisor/admin-backend.*.log

# Audit logs (via API)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8002/api/admin/v1/audit/logs
```

### Métriques

- Audit logs dans DB (table `admin.audit_logs`)
- Redis pour rate limiting
- OpenTelemetry (optionnel, à activer)

---

## 🧪 Tests

```bash
# Tests unitaires
pytest tests/

# Tests d'intégration
pytest tests/integration/

# Coverage
pytest --cov=app tests/
```

---

## 📦 Déploiement

### Supervisor Config

```ini
[program:admin-backend]
command=/usr/bin/python3 -m app.main
directory=/app/admin-backend
environment=PORT=8002
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/admin-backend.err.log
stdout_logfile=/var/log/supervisor/admin-backend.out.log
```

### Déploiement Railway

1. **Créer un service**  
   - Projet Railway → *New → Deploy from GitHub Repo*.  
   - Root du service : `admin-backend`.  
   - Détecter automatiquement Python + `requirements.txt`.

2. **Variables d’environnement (Settings → Variables)**  
   - Créer un group `admin-backend` pour les clés partagées.  
   - Renseigner toutes les variables de `.env` (voir section Configuration).  
   - Ajouter `PORT=8000` (Railway injecte `$PORT` au runtime, mais définir `PORT` explicite évite les surprises).

3. **Commandes**  
   - Build : automatique (Railway installe `requirements.txt`).  
   - Start command :  
     ```
     uvicorn app.main:app --host 0.0.0.0 --port $PORT
     ```

4. **Services annexes**  
   - Redis : ajouter un add-on Redis Railway (copier l’URL dans `REDIS_URL`).  
   - Créer un *Variable Group* partagé si plusieurs environnements (staging/production).

5. **CORS & domaines**  
   - Ajouter l’URL Railway (`https://<service>.up.railway.app`) + les domaines Next.js dans `CORS_ORIGINS`.  
   - Redéployer après mise à jour.

6. **Tests post-déploiement**  
   - Vérifier `/api/admin/v1/health/check`.  
   - Tester `/api/admin/v1/docs` pour confirmer que Swagger répond.  
   - Exécuter `curl` avec un token admin pour valider une route protégée.

### Production Checklist

- [ ] `.env` avec vraies credentials
- [ ] `SECRET_KEY` généré aléatoirement
- [ ] `ENVIRONMENT=production`
- [ ] Redis actif pour rate limiting
- [ ] SendGrid configuré pour e-mails
- [ ] Moneroo configuré pour paiements
- [ ] Schéma SQL exécuté dans Supabase
- [ ] CORS restreint aux domaines autorisés
- [ ] Backup automatique configuré
- [ ] Monitoring activé

---

## 🔗 Liens Utiles

- **Supabase Dashboard**: https://app.supabase.com
- **SendGrid Dashboard**: https://app.sendgrid.com
- **Moneroo Dashboard**: https://dashboard.moneroo.io
- **OpenAPI Docs**: http://localhost:8002/api/admin/v1/docs

---

## 📞 Support

Pour toute question ou problème:
- **Email**: support@nexus-partners.xyz
- **Documentation**: Voir `/app/admin_database_schema.sql` pour le schéma DB

---

**Version:** 2.1.0  
**Date:** Janvier 2025  
**Auteur:** Équipe Technique Nexus Connect
