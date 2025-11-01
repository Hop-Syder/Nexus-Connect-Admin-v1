# 🚀 Déploiement du frontend Next.js sur Vercel

Ce guide décrit la mise en ligne du dashboard **Nexus Connect Admin** (Next.js 14 + TypeScript) sur [Vercel](https://vercel.com/). Il complète le tutoriel backend Railway et détaille chaque étape : connexion du dépôt, configuration des variables d’environnement, build et publication.

---

## 1. Prérequis

- Compte Vercel (plan Hobby suffit pour le staging, Pro conseillé en production).
- Accès au dépôt Git `Nexus-Connect-Admin` (GitHub, GitLab ou Bitbucket).
- Node.js 22.x et npm ≥ 10 pour tester le build en local.
- Backend déjà disponible (Railway ou autre) afin d’exposer une URL API stable.

---

## 2. Préparer le projet localement (optionnel mais recommandé)

1. Installer les dépendances :
   ```bash
   cd admin-frontend
   npm install
   ```
2. Lancer l’application en local :
   ```bash
   npm run dev
   ```
3. Vérifier que les pages se chargent correctement et noter l’URL publique du backend (`https://<service-backend>.up.railway.app`) pour la renseigner plus tard.

---

## 3. Connecter le dépôt à Vercel

1. Depuis le tableau de bord Vercel, cliquer sur **Add New… → Project**.
2. Importer le dépôt Git puis sélectionner le dossier racine `Nexus-Connect-Admin`.
3. Lors de l’étape **Configure Project** :
   - **Framework Preset** : `Next.js` (détecté automatiquement).
   - **Root Directory** : `admin-frontend` (important pour isoler le frontend).
   - **Build & Output Settings** : laisser les valeurs détectées (`npm run build`). Le dossier `.next` est géré automatiquement par Vercel.

> 💡 Si le projet est déjà importé, ouvrez les **Project Settings → General** pour ajuster `Root Directory`.

---

## 4. Définir les variables d’environnement

Dans **Project Settings → Environment Variables**, créer les clés suivantes pour les environnements `Production`, `Preview` et `Development` :

```
NEXT_PUBLIC_ADMIN_API_URL=https://<service-backend>.up.railway.app/api/admin/v1
NEXT_PUBLIC_APP_ENV=production
```

Ajoutez d’autres variables publiques (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, analytics, etc.) selon vos besoins. Chaque modification nécessite un nouveau déploiement car Next.js injecte ces valeurs au build côté client.

> 🔐 Les variables sensibles doivent rester côté backend. Ne placez sur Vercel que des clés destinées au navigateur (`NEXT_PUBLIC_*`).

---

## 5. Configurer le build Vercel

Vercel détecte automatiquement les commandes suivantes :

| Paramètre | Valeur |
| --------- | ------ |
| **Install Command** | `npm install` |
| **Build Command** | `npm run build` |
| **Output Directory** | *(laisser vide — Vercel utilise `.next` automatiquement)* |

Vérifiez que la version de Node correspond à `22.x` (définie dans `package.json > engines`). Si besoin, forcez-la via l’onglet **General → Node.js Version**.

---

## 6. Lancer le premier déploiement

1. Cliquez sur **Deploy** après avoir défini les variables d’environnement.
2. Surveillez la console Vercel : étapes attendues → installation → build → upload → finalisation.
3. À la fin, Vercel fournit une URL Preview (ex. `https://admin-frontend-git-main-xxx.vercel.app`).
4. Validez le fonctionnement : connexion, navigation, appels API vers l’URL Railway.

> ✅ Une fois satisfait, cliquez sur **Promote to Production** (ou déclenchez un commit sur `main` si l’auto-deploy est activé) pour générer le domaine de production `<project>.vercel.app`.

---

## 7. Domaines personnalisés

1. Ouvrez **Project Settings → Domains**.
2. Ajoutez votre nom de domaine (ex. `admin.nexus-partners.xyz`).
3. Créez un enregistrement CNAME dans votre DNS pointant vers `cname.vercel-dns.com`.
4. Attendez que Vercel valide le domaine et émette automatiquement le certificat HTTPS.
5. Optionnel : activer **Redirect to Primary Domain** pour forcer le HTTPS et le domaine principal.

---

## 8. Dépannage rapide

| Symptôme | Cause probable | Correctif |
| -------- | --------------- | --------- |
| Page blanche | Variables `NEXT_PUBLIC_*` absentes lors du build | Ajouter les variables dans Vercel puis relancer un déploiement. |
| Erreurs CORS | Domaine Vercel non autorisé côté backend | Ajouter l’URL Vercel dans `CORS_ORIGINS` sur Railway et redéployer le backend. |
| API 404/500 | Mauvaise URL `NEXT_PUBLIC_ADMIN_API_URL` | Vérifier le schéma HTTPS et le chemin `/api/admin/v1`. |
| Build qui échoue | Version Node incompatible ou dépendances non résolues | Vérifier `package-lock.json`, relancer `npm install`, ou forcer la version Node dans Vercel. |

---

## 9. Checklist finale

- [ ] Variables `NEXT_PUBLIC_*` renseignées dans les trois environnements Vercel.
- [ ] Build `npm run build` réussi sur Vercel et en local.
- [ ] Domaine Vercel (et éventuel domaine custom) accessible en HTTPS.
- [ ] Tests manuels des parcours critiques (login, navigation, graphiques).
- [ ] CORS mis à jour côté backend pour inclure le domaine Vercel/custom.

---

**Auteur :** Équipe technique Hop-Syder (@hopsyder)
**Dernière mise à jour :** Février 2025
