-- =============================================
-- TRAILFORGE — Schéma Supabase complet
-- À exécuter dans Supabase > SQL Editor
-- =============================================

-- 1. Tokens Strava (un par utilisateur)
create table if not exists strava_tokens (
  user_id      uuid references auth.users on delete cascade primary key,
  athlete_id   bigint,
  access_token text not null,
  refresh_token text not null,
  expires_at   bigint not null,
  updated_at   timestamptz default now()
);

-- 2. Cache des activités Strava
create table if not exists strava_cache (
  user_id    uuid references auth.users on delete cascade primary key,
  athlete    jsonb,
  activities jsonb,
  stats      jsonb,
  cached_at  timestamptz default now()
);

-- 3. Objectifs de course
create table if not exists goals (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references auth.users on delete cascade not null,
  name              text not null,
  race_type         text default 'trail',    -- trail | road | ultra | cross
  distance_km       numeric,
  elevation_gain    numeric default 0,
  race_date         date,
  level             text default 'intermediaire',
  sessions_per_week int default 3,
  preferred_days    int[] default '{1,3,6}', -- 0=Lun ... 6=Dim
  current_weekly_km numeric default 0,
  vo2max            numeric,
  notes             text,
  created_at        timestamptz default now()
);

-- 4. Plans d'entraînement générés par l'IA
create table if not exists training_plans (
  id         uuid default gen_random_uuid() primary key,
  goal_id    uuid references goals on delete cascade not null,
  user_id    uuid references auth.users on delete cascade not null,
  plan_data  jsonb not null,  -- structure complète générée par Grok
  version    int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index pour les performances
create index if not exists goals_user_id_idx on goals(user_id);
create index if not exists training_plans_goal_id_idx on training_plans(goal_id);
create index if not exists training_plans_user_id_idx on training_plans(user_id);

-- =============================================
-- Row Level Security — chaque user voit UNIQUEMENT ses données
-- =============================================

alter table strava_tokens enable row level security;
alter table strava_cache enable row level security;
alter table goals enable row level security;
alter table training_plans enable row level security;

-- strava_tokens
drop policy if exists "Users manage own strava tokens" on strava_tokens;
create policy "Users manage own strava tokens" on strava_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- strava_cache
drop policy if exists "Users manage own strava cache" on strava_cache;
create policy "Users manage own strava cache" on strava_cache
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- goals
drop policy if exists "Users manage own goals" on goals;
create policy "Users manage own goals" on goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- training_plans
drop policy if exists "Users manage own training plans" on training_plans;
create policy "Users manage own training plans" on training_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================
-- Trigger pour mettre à jour updated_at
-- =============================================
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on training_plans;
create trigger set_updated_at
  before update on training_plans
  for each row execute function handle_updated_at();
