# 🎨 Nexus Connect - Admin Frontend v2.1

**Interface Next.js pour le Tableau de Bord d'Administration**

---

## 🚀 Quick Start

### 1. Installation

```bash
cd admin-frontend
npm install
```

### 2. Configuration

Fichier `.env` déjà configuré avec:
- `NEXT_PUBLIC_ADMIN_API_URL`: URL du backend admin (localhost:8002)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Credentials Supabase

### 3. Lancer l'application

```bash
# Développement (port 3000)
npm run dev

# Production build
npm run build
```

Application disponible sur: **http://localhost:3000**

---

## 📁 Structure du Projet

```
src/
├── app/                    # Routes et pages
├── components/
│   ├── layout/            # Sidebar, Navbar
│   └── ui/                # Composants UI réutilisables
├── features/              # Modules par domaine
│   ├── dashboard/         # Dashboard principal
│   ├── auth/              # Login, 2FA
│   ├── users/             # Gestion utilisateurs
│   ├── subscriptions/     # Abonnements
│   ├── moderation/        # Modération entrepreneurs
│   ├── messages/          # Support messages
│   ├── campaigns/         # Campagnes e-mail
│   ├── analytics/         # Analytics & rapports
│   ├── audit/             # Logs d'audit
│   └── settings/          # Configuration
├── lib/                   # Utils & API client
│   ├── api-client.ts      # Client API avec intercepteurs
│   ├── supabase.ts        # Client Supabase
│   └── utils.ts           # Fonctions utilitaires
├── store/                 # Zustand stores
│   ├── auth-store.ts      # State authentification
│   └── ui-store.ts        # State UI (sidebar, dark mode)
├── types/                 # TypeScript types
└── styles/                # CSS global
```

---

## 🎨 Stack Technique

### Core
- **Next.js 14** - Framework full-stack
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - Composants UI

### État & Data
- **Zustand** - State management
- **TanStack Query** - Data fetching & caching
- **React Hook Form** - Forms
- **Zod** - Schema validation

### Routing & Navigation
- **Next.js App Router** - Routing côté serveur/clients
- **next/navigation** - API de navigation programmatique

### Charts & Visualisation
- **Recharts** - Graphiques
- **Lucide React** - Icons

### API & Backend
- **Axios** - HTTP client
- **@supabase/supabase-js** - Supabase client

---

## 🔐 Authentification

### Flow d'authentification

1. **Login** (`/login`)
   - Email + Password
   - API: `POST /api/admin/v1/auth/login`

2. **2FA** (si activé)
   - Code TOTP (6 chiffres)
   - API: `POST /api/admin/v1/auth/verify-2fa`

3. **Session**
   - Access Token (JWT) stocké dans `localStorage`
   - Refresh Token pour renouvellement auto
   - Intercepteurs Axios pour retry automatique

### Stores

```typescript
// Auth Store
const { user, isAuthenticated, setAuth, clearAuth } = useAuthStore();

// UI Store
const { sidebarOpen, darkMode, toggleSidebar, toggleDarkMode } = useUIStore();
```

---

## 📊 Modules Principaux

### 1. Dashboard
- KPIs en temps réel (total users, premium, MRR, alerts)
- Graphiques (croissance, geo distribution)
- Activité récente

### 2. Utilisateurs
- Liste avec pagination cursor
- Filtres avancés (role, premium, blocked, country)
- Détails utilisateur (profil, subscriptions, historique)
- Actions bulk (block, unblock, tag)
- Export CSV
- Segments sauvegardés

### 3. Abonnements
- Plans (create, edit, désactiver)
- Grant/revoke premium
- Historique par utilisateur
- Coupons (create, list)
- Expirations (J-7, J-3, J0)
- Stats (MRR, conversions)

### 4. Modération
- File de modération (pending, in_review, approved, rejected)
- Détails entrepreneur avec checks auto
- Décisions (approve, reject, request changes)
- Macros prédéfinies
- Assignment modérateurs
- SLA tracking

### 5. Messages (Support)
- Liste messages (new, assigned, replied, archived)
- Détails + répondre
- Templates de réponse
- Priorités & catégories
- SLA breaches

### 6. Campagnes E-mail
- Créer campagne (sujet, contenu, ciblage)
- Envoi test
- Scheduler
- Templates réutilisables
- Stats (sent, opened, clicked, unsubscribed)

### 7. Analytics
- Dashboard KPIs
- User growth (7d/30d/90d)
- Geo distribution
- Revenue stats (MRR, period revenue)
- Content stats
- Exports (CSV, Excel)

### 8. Audit
- Logs d'audit (filtres par event_type, severity, dates)
- Export signé (CSV avec hash SHA256)
- Stats (critical events, top events)
- Event types (16 types)

### 9. Settings
- System settings (par catégorie)
- Health check (DB, Redis, Email, Payment)
- Notifications center
- Backup trigger

---

## 🎨 Design System

### Couleurs

```css
--primary: #3B82F6       /* Blue */
--secondary: #10B981     /* Green */
--destructive: #EF4444   /* Red */
--warning: #F59E0B       /* Orange */
--muted: #6B7280         /* Gray */
```

### Components UI

```tsx
import { Button, Card, Input, Badge } from '@/components/ui';
```

### Layout

```tsx
// app/(dashboard)/layout.tsx
<AuthGuard>
  <Sidebar />
  <Navbar />
  <main className="p-6">{children}</main>
</AuthGuard>
```

---

## 🔧 API Client

### Usage

```typescript
import apiClient from '@/lib/api-client';

// Users
const users = await apiClient.getUsers({ limit: 50 });
const user = await apiClient.getUser(userId);

// Subscriptions
const plans = await apiClient.getPlans();
await apiClient.grantPremium({ user_id, plan_code });

// Moderation
const queue = await apiClient.getModerationQueue({ status: 'pending' });
await apiClient.moderateEntrepreneur(id, { decision: 'approved' });

// Analytics
const kpis = await apiClient.getDashboardKPIs();
const growth = await apiClient.getUserGrowth('30d');
```

### Features

- **Auto retry** sur 401 avec refresh token
- **Error handling** automatique avec toasts
- **Type safety** TypeScript complet
- **Request interceptors** pour auth
- **Response interceptors** pour erreurs

---

## 🧪 Tests

Les tests automatisés ne sont pas encore configurés.  
Utilisez `npm run lint` pour vérifier la qualité du code avant une PR.

---

## 🚀 Déploiement

### Build

```bash
npm run build
```

### Production

```bash
# Lancer le serveur Next.js en mode production
npm run start
```

> Pour un hébergement managé, Vercel est recommandé (support natif de Next.js).

### Déploiement Vercel

1. Importer le dépôt dans Vercel et définir `Root Directory` sur `admin-frontend`.
2. Laisser les commandes détectées : `npm install` (Install) et `npm run build` (Build). Le dossier de sortie `.next` est géré automatiquement.
3. Déclarer les variables d’environnement dans **Settings → Environment Variables** :
   ```
   NEXT_PUBLIC_ADMIN_API_URL=https://<votre-backend>/api/admin/v1
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
   Propager les mêmes valeurs pour `Production`, `Preview` et `Development`.
4. Lancer un déploiement. Après validation, ajouter votre domaine personnalisé si besoin.
5. Mettre à jour `CORS_ORIGINS` côté backend pour autoriser le domaine Vercel (et le domaine custom).

---

## 📝 TODO

- [ ] Compléter les pages Users, Subscriptions, etc.
- [ ] Ajouter Recharts pour les graphiques
- [ ] Implémenter Tables avancées (TanStack Table)
- [ ] Ajouter tests E2E (Playwright)
- [ ] i18n (FR/EN)
- [ ] Mode offline avec service worker

---

## 🔗 Liens

- **Backend API**: http://localhost:8002/api/admin/v1
- **Docs API**: http://localhost:8002/api/admin/v1/docs
- **Supabase**: https://app.supabase.com

---

**Version:** 2.1.0  
**Date:** Janvier 2025  
**Auteur:** Équipe Technique Nexus Connect
