# TrailForge

Application de coaching running/trail : elle synchronise les activités Strava de l'utilisateur, calcule son profil physiologique (zones FC, VMA, VO2max, allures) à partir de ses données réelles, puis génère un programme d'entraînement personnalisé via un modèle de langage (Groq/Llama). L'utilisateur suit son planning au jour le jour, reçoit une analyse post-séance et peut discuter avec un "coach" conversationnel.

## Stack technique réelle

- **Frontend :** React 18 + Vite, React Router, Recharts (graphiques), Lucide (icônes)
- **Backend / données :** Supabase (PostgreSQL + Auth + Row Level Security)
- **IA :** API Groq (modèles Llama 3.3 70B et 3.1 8B) — la variable s'appelle `VITE_GROK_API_KEY` dans le code mais le fournisseur réellement utilisé est **Groq**, pas xAI/Grok
- **Données sportives :** API Strava (OAuth2, activités, statistiques)
- **Hébergement :** Vercel

## Lancer le projet en local

```bash
npm install
cp .env.example .env   # renseigner les clés Supabase, Groq et Strava
npm run dev
```

Variables nécessaires (voir `.env.example`) :
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — projet Supabase
- `VITE_GROK_API_KEY` — clé API Groq (console.groq.com)
- `VITE_STRAVA_CLIENT_ID`, `VITE_STRAVA_CLIENT_SECRET`, `VITE_STRAVA_REDIRECT_URI` — app OAuth Strava

Le schéma de base de données est dans `supabase_schema.sql`, à exécuter dans l'éditeur SQL Supabase.

## Modèle de données

Quatre tables, toutes protégées par des policies RLS (`auth.uid() = user_id`) :

- **`strava_tokens`** — jetons OAuth Strava par utilisateur (access/refresh token)
- **`strava_cache`** — cache des activités et statistiques Strava (évite de re-solliciter l'API à chaque chargement)
- **`goals`** — objectifs de course de l'utilisateur (type, distance, dénivelé, date, niveau, fréquence)
- **`training_plans`** — programmes d'entraînement générés par l'IA, liés à un objectif (`goal_id`), stockés en JSONB versionné

## Ce que j'ai conçu moi-même

- Le **modèle de données** (tables, relations, policies RLS) et la logique métier associée
- L'**intégration Strava** : flux OAuth, appels API, calcul des statistiques d'entraînement (zones FC, VMA, VO2max, allures) à partir des activités brutes

Le reste du développement (composants React, mise en forme, prompts IA) a été réalisé avec l'assistance d'un outil d'IA générative (Claude).

