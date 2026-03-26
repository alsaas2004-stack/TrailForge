# 🏔️ TrailForge — Guide de déploiement complet

## Vue d'ensemble
TrailForge est une app React + Vite qui s'appuie sur :
- **Supabase** pour la base de données et l'authentification
- **Grok (xAI)** pour la génération de programmes IA
- **Strava API** pour la synchronisation des activités
- **Netlify** pour l'hébergement

---

## 1. Supabase

### 1a. Créer le schéma
1. Va sur [supabase.com](https://supabase.com) > ton projet
2. Ouvre **SQL Editor**
3. Copie-colle tout le contenu de `supabase_schema.sql`
4. Clique **Run**

### 1b. Activer l'authentification par email
- Settings > Authentication > Email
- Active **"Enable Email Signup"**
- (Optionnel) Active **"Confirm email"** ou désactive-le pour les tests

### 1c. Récupérer tes clés
- Settings > API
- Copie `Project URL` → `VITE_SUPABASE_URL`
- Copie `anon public key` → `VITE_SUPABASE_ANON_KEY`

---

## 2. Strava API

### 2a. Créer une application Strava
1. Va sur [strava.com/settings/api](https://www.strava.com/settings/api)
2. Crée une nouvelle application :
   - **Application Name**: TrailForge
   - **Category**: Training
   - **Club**: (laisse vide)
   - **Website**: https://ton-app.netlify.app
   - **Authorization Callback Domain**: ton-app.netlify.app
3. Note le **Client ID** et le **Client Secret**

### 2b. Variables à définir
```
VITE_STRAVA_CLIENT_ID=123456
VITE_STRAVA_CLIENT_SECRET=abc...
VITE_STRAVA_REDIRECT_URI=https://ton-app.netlify.app/strava/callback
```

> ⚠️ Pour le développement local, utilise `http://localhost:5173/strava/callback`
> et autorise ce domaine dans Strava aussi.

---

## 3. Grok (xAI)

1. Va sur [console.x.ai](https://console.x.ai)
2. Crée une clé API
3. Note-la → `VITE_GROK_API_KEY=xai-...`

---

## 4. Déploiement Netlify

### 4a. Déployer depuis GitHub (recommandé)
1. Push ton code sur un dépôt GitHub privé
2. Va sur [app.netlify.com](https://app.netlify.com)
3. **New site > Import from Git > GitHub**
4. Sélectionne ton repo
5. Paramètres de build :
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
6. Clique **Deploy**

### 4b. Ajouter les variables d'environnement sur Netlify
1. Site settings > Environment variables
2. Ajoute **chacune** de ces variables :

```
VITE_SUPABASE_URL          = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY     = eyJ...
VITE_GROK_API_KEY          = xai-...
VITE_STRAVA_CLIENT_ID      = 123456
VITE_STRAVA_CLIENT_SECRET  = abc...
VITE_STRAVA_REDIRECT_URI   = https://TON-SITE.netlify.app/strava/callback
```

3. **Trigger a deploy** (Deploys > Trigger deploy)

### 4c. Configurer le domaine Strava
Après le déploiement, récupère ton URL Netlify (ex: `trailforge-xyz.netlify.app`) et :
1. Retourne sur Strava API settings
2. Mets à jour **Authorization Callback Domain** : `trailforge-xyz.netlify.app`

---

## 5. Test local

```bash
# Dans le dossier trailforge/
cp .env.example .env
# Remplis .env avec tes vraies clés

npm install
npm run dev
# → http://localhost:5173
```

---

## 6. Structure du projet

```
trailforge/
├── src/
│   ├── components/
│   │   └── Layout.jsx          # Sidebar + navigation
│   ├── pages/
│   │   ├── Login.jsx           # Authentification
│   │   ├── Dashboard.jsx       # Stats Strava + objectifs actifs
│   │   ├── Goals.jsx           # CRUD objectifs + génération IA
│   │   ├── Training.jsx        # Programme semaine par semaine
│   │   ├── Assistant.jsx       # Chat coach IA
│   │   └── StravaCallback.jsx  # Callback OAuth Strava
│   ├── hooks/
│   │   ├── useAuth.jsx         # Authentification Supabase
│   │   ├── useStrava.js        # Données Strava + refresh token
│   │   └── useGoals.js         # CRUD objectifs + plans
│   ├── lib/
│   │   ├── supabase.js         # Client Supabase
│   │   ├── grok.js             # API Grok + génération programme
│   │   └── strava.js           # API Strava + calcul stats
│   ├── styles/
│   │   └── global.css          # Design system complet
│   ├── App.jsx                 # Routing principal
│   └── main.jsx                # Point d'entrée
├── netlify.toml                # Config Netlify
├── supabase_schema.sql         # Schéma base de données
├── .env.example                # Template variables d'env
└── package.json
```

---

## 7. Flux utilisateur

1. **Inscription** → email/mot de passe via Supabase Auth
2. **Dashboard** → invite à connecter Strava (bouton OAuth)
3. **Objectifs** → formulaire détaillé → Grok génère le programme en ~15s
4. **Programme** → vue semaine par semaine, drag & drop des séances, marquage ✓
5. **Coach IA** → chat en temps réel avec contexte Strava + objectif

---

## 8. Dépannage fréquent

| Problème | Solution |
|---|---|
| "Invalid API key" Grok | Vérifie `VITE_GROK_API_KEY` dans Netlify env vars |
| Strava redirect invalide | Le domaine dans Strava doit être EXACTEMENT ton URL Netlify (sans http://) |
| Programme ne se génère pas | Vérifie que Grok répond en JSON valide — augmente max_tokens si besoin |
| Données Strava vides | Le token expire après 6h — le refresh automatique devrait le gérer |
| Page blanche en prod | Vérifie que `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont bien définis |

---

## 9. Personnalisation rapide

- **Couleurs** : modifie les variables CSS dans `src/styles/global.css` (`:root`)
- **Nom de l'app** : cherche "TRAILFORGE" et "TrailForge" dans les fichiers JSX
- **Modèle Grok** : change `grok-beta` dans `src/lib/grok.js` si xAI sort de nouveaux modèles
- **Séances par page** : modifie `WEEKS_PER_PAGE` dans `Training.jsx`
