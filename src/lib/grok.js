import { secToMMSS } from './strava'

const GROQ_API_KEY = import.meta.env.VITE_GROK_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// ─────────────────────────────────────────────────────────────────
// COUCHE API GROQ
// ─────────────────────────────────────────────────────────────────

async function groqRequest(messages, maxTokens = 1500, jsonMode = false) {
  const body = {
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.25,
    max_tokens: maxTokens,
    ...(jsonMode && { response_format: { type: 'json_object' } })
  }
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Erreur Groq ${res.status}`)
  }
  const data = await res.json()
  return data.choices[0].message.content
}

// ─────────────────────────────────────────────────────────────────
// CALCUL PROFIL ATHLÈTE COMPLET DEPUIS STRAVA
// C'est ici qu'on extrait les vraies capacités de l'athlète
// avant de générer le moindre programme
// ─────────────────────────────────────────────────────────────────

export function computeAthleteProfile(stravaStats) {
  if (!stravaStats) return null

  const { maxHR, avgHR, bestPaceSecPerKm, efPaceSecPerKm, avgWeeklyKm, totalRuns, weeklyTrend } = stravaStats

  // ── FC et zones Karvonen ──
  const fcRepos = 50 // estimation conservative
  const fcReserve = maxHR ? maxHR - fcRepos : null

  const zones = fcReserve ? {
    z1: { min: Math.round(fcRepos + 0.50 * fcReserve), max: Math.round(fcRepos + 0.60 * fcReserve), label: 'Z1 — Récupération active' },
    z2: { min: Math.round(fcRepos + 0.60 * fcReserve), max: Math.round(fcRepos + 0.72 * fcReserve), label: 'Z2 — Endurance Fondamentale (EF)' },
    z3: { min: Math.round(fcRepos + 0.72 * fcReserve), max: Math.round(fcRepos + 0.82 * fcReserve), label: 'Z3 — Tempo / Seuil aérobie (SL1)' },
    z4: { min: Math.round(fcRepos + 0.82 * fcReserve), max: Math.round(fcRepos + 0.90 * fcReserve), label: 'Z4 — Seuil lactique (SL2)' },
    z5: { min: Math.round(fcRepos + 0.90 * fcReserve), max: maxHR, label: 'Z5 — VO2max / VMA' }
  } : null

  // ── VMA estimée depuis meilleure allure ──
  // Meilleure allure 5km+ ≈ allure à ~95-98% VMA
  const vmaSecPerKm = bestPaceSecPerKm ? Math.round(bestPaceSecPerKm * 0.95) : null
  const vmaKmh = vmaSecPerKm ? Math.round((3600 / vmaSecPerKm) * 10) / 10 : null

  // ── Allures de référence ──
  const paces = bestPaceSecPerKm ? {
    ef:        { sec: efPaceSecPerKm || Math.round(bestPaceSecPerKm * 1.35), label: 'EF (Z2)' },
    tempo:     { sec: Math.round(bestPaceSecPerKm * 1.15), label: 'Tempo Z3' },
    seuil:     { sec: Math.round(bestPaceSecPerKm * 1.08), label: 'Seuil Z4' },
    vma100:    { sec: vmaSecPerKm, label: 'VMA 100% Z5' },
    vma105:    { sec: Math.round(vmaSecPerKm * 0.95), label: 'VMA 105% Z5' },
    recup:     { sec: Math.round(bestPaceSecPerKm * 1.55), label: 'Récupération inter-fractio' }
  } : null

  // ── Tendance volume (progression/regression) ──
  let volumeTrend = 'stable'
  if (weeklyTrend && weeklyTrend.length >= 4) {
    const recentAvg = (weeklyTrend.slice(-2).reduce((s, w) => s + w.km, 0)) / 2
    const olderAvg = (weeklyTrend.slice(-6, -2).reduce((s, w) => s + w.km, 0)) / 4
    if (recentAvg > olderAvg * 1.12) volumeTrend = 'en_hausse'
    else if (recentAvg < olderAvg * 0.88) volumeTrend = 'en_baisse'
  }

  // ── Niveau estimé automatiquement depuis VMA et volume ──
  let autoLevel = 'intermédiaire'
  if (vmaKmh) {
    if (vmaKmh >= 17 && avgWeeklyKm >= 50) autoLevel = 'avancé'
    else if (vmaKmh <= 12 || avgWeeklyKm <= 20) autoLevel = 'débutant'
  }

  // ── VO2max estimé (Jack Daniels) ──
  let vo2max = null
  if (vmaSecPerKm) {
    const speedMperMin = 60000 / vmaSecPerKm
    vo2max = Math.round(-4.6 + 0.182258 * speedMperMin + 0.000104 * speedMperMin * speedMperMin)
    vo2max = Math.max(25, Math.min(90, vo2max))
  }

  return {
    maxHR, avgHR, fcRepos, fcReserve,
    zones,
    vmaSecPerKm, vmaKmh, vo2max,
    paces,
    avgWeeklyKm: Math.round(avgWeeklyKm || 0),
    totalRuns,
    volumeTrend,
    autoLevel
  }
}

// ─────────────────────────────────────────────────────────────────
// CONSTRUCTION DU CONTEXTE ATHLÈTE POUR L'IA
// ─────────────────────────────────────────────────────────────────

function buildAthleteContext(profile, goal) {
  if (!profile) return 'Pas de données Strava disponibles — utilise des valeurs estimées selon le niveau.'

  const { zones, paces, maxHR, vmaKmh, vo2max, avgWeeklyKm, volumeTrend, autoLevel } = profile

  const zonesStr = zones ? `
ZONES FC PERSONNALISÉES (FCmax=${maxHR} bpm, FC repos=${profile.fcRepos} bpm, méthode Karvonen):
  Z1 Récupération:          ${zones.z1.min}–${zones.z1.max} bpm — très facile, conversation normale
  Z2 Endurance Fondamentale: ${zones.z2.min}–${zones.z2.max} bpm — facile, phrases complètes (test parole)
  Z3 Tempo/Seuil aérobie:    ${zones.z3.min}–${zones.z3.max} bpm — modéré, phrases courtes
  Z4 Seuil lactique (SL2):   ${zones.z4.min}–${zones.z4.max} bpm — difficile, quelques mots seulement
  Z5 VO2max/VMA:             ${zones.z5.min}–${maxHR} bpm — très difficile, impossible de parler` : 'Zones FC: non calculables (FCmax inconnue)'

  const pacesStr = paces ? `
ALLURES DE RÉFÉRENCE CALCULÉES DEPUIS STRAVA (toutes en MM:SS/km, base 60):
  EF (Z2 footing facile):     ${secToMMSS(paces.ef.sec)}/km  ← UTILISE EXACTEMENT CETTE ALLURE pour séances faciles
  Tempo Z3 (allure marathon):  ${secToMMSS(paces.tempo.sec)}/km
  Seuil Z4 (allure semi/10km): ${secToMMSS(paces.seuil.sec)}/km
  VMA 100% Z5:                 ${secToMMSS(paces.vma100.sec)}/km
  VMA 105% (surVMA):           ${secToMMSS(paces.vma105.sec)}/km
  Récupération inter-fractio:  ${secToMMSS(paces.recup.sec)}/km` : 'Allures: non calculables (données insuffisantes)'

  const isTrail = goal?.race_type === 'trail' || goal?.race_type === 'ultra'
  const ratioElevation = (goal?.elevation_gain && goal?.distance_km) ? Math.round(goal.elevation_gain / goal.distance_km) : 0

  return `
═══════════════════════════════════════════════════════════
PROFIL ATHLÈTE CALCULÉ DEPUIS DONNÉES STRAVA RÉELLES
═══════════════════════════════════════════════════════════
Volume actuel:     ${avgWeeklyKm} km/sem (tendance: ${volumeTrend === 'en_hausse' ? '📈 progression' : volumeTrend === 'en_baisse' ? '📉 baisse' : '→ stable'})
VMA estimée:       ${vmaKmh || '?'} km/h
VO2max estimé:     ${vo2max || '?'} ml/kg/min
Niveau auto-évalué: ${autoLevel}
${zonesStr}
${pacesStr}
${isTrail && ratioElevation > 0 ? `
SPÉCIFICITÉ TRAIL:
  Ratio D+/km: ${ratioElevation} m/km → ${ratioElevation < 30 ? 'trail roulant → priorité vitesse + seuil' : ratioElevation < 60 ? 'trail moyen → équilibre force/endurance' : 'trail montagne → priorité côtes longues + marche active'}
  km-effort estimé course: ${goal.distance_km + Math.round(goal.elevation_gain / 100)} km-effort` : ''}
═══════════════════════════════════════════════════════════
RÈGLE ABSOLUE: Toutes les allures dans les séances DOIVENT utiliser ces valeurs calculées.
Format MM:SS/km UNIQUEMENT — jamais de décimales (pas de 6,5 mais 6:30).
`
}

// ─────────────────────────────────────────────────────────────────
// GÉNÉRATION DU PROGRAMME (cœur du système)
// ─────────────────────────────────────────────────────────────────

export async function generateTrainingPlan(goal, stravaStats) {
  const today = new Date()
  const raceDate = new Date(goal.race_date)
  const weeksTotal = Math.min(Math.max(2, Math.ceil((raceDate - today) / (7 * 86400000))), 20)

  // 1. Calculer le profil complet de l'athlète
  const profile = computeAthleteProfile(stravaStats)

  // 2. Volumes cibles selon profil réel
  const baseKm = Math.max(profile?.avgWeeklyKm || 30, goal.distance_km * 0.85)
  const mults = { débutant: 0.95, intermédiaire: 1.2, avancé: 1.45 }
  const mult = mults[goal.level] || 1.2
  const vStart   = Math.round(baseKm * 0.72)
  const vPeak    = Math.round(baseKm * mult * 1.30)
  const vTaper   = Math.round(baseKm * 0.52)
  const vPreRace = Math.round(baseKm * 0.32)

  const isTrail = goal.race_type === 'trail' || goal.race_type === 'ultra'
  const isUltra = goal.race_type === 'ultra' || goal.distance_km > 60
  const ratioElevation = goal.elevation_gain && goal.distance_km ? Math.round(goal.elevation_gain / goal.distance_km) : 0

  // 3. Contexte athlète complet
  const athleteCtx = buildAthleteContext(profile, goal)

  // 4. Structure de périodisation selon durée
  let periodisation = ''
  if (weeksTotal <= 6) {
    periodisation = `PÉRIODISATION (${weeksTotal} sem — programme court):
- Semaines 1-${Math.ceil(weeksTotal*0.5)}: Développement spécifique + seuil
- Semaines ${Math.ceil(weeksTotal*0.5)+1}-${weeksTotal-1}: Spécifique course
- Semaine ${weeksTotal}: Affûtage`
  } else if (weeksTotal <= 10) {
    periodisation = `PÉRIODISATION (${weeksTotal} sem):
- Semaines 1-3: Base aérobie — construire le socle, 90% Z1-Z2
- Semaines 4-6: Développement seuil — introduire Z3-Z4, côtes longues
- Semaines 7-${weeksTotal-2}: Spécifique + VMA — fractionnés, allure course
- Semaines ${weeksTotal-1}-${weeksTotal}: Affûtage — volume -40%, maintien intensité`
  } else {
    periodisation = `PÉRIODISATION (${weeksTotal} sem — programme complet):
- Semaines 1-4: Base aérobie — construire le socle, 85% Z1-Z2, +10%/sem max
- Semaines 5-7: Développement seuil SL1 — tempo Z3, côtes longues Z3-Z4
- Semaines 8-10: VO2max/VMA — fractionnés courts/longs Z5, 2×/sem max
- Semaines 11-${weeksTotal-3}: Spécifique course — simulations, sortie longue maximale
- Semaines ${weeksTotal-2}-${weeksTotal-1}: Affûtage — volume -40% à -50%, maintien intensité
- Semaine ${weeksTotal}: Pré-compétition — volume minimal, fraîcheur maximale
SEMAINES DE DÉCHARGE (obligatoires): toutes les 3-4 semaines, volume -30%`
  }

  const systemPrompt = `Tu es un coach expert en course à pied et trail running certifié niveau 3, avec 15 ans d'expérience (débutant à élite). Tu maîtrises parfaitement :
- Physiologie de l'effort et périodisation scientifique (linéaire, ondulée, polarisée)
- Méthodes : 80/20 (Matt Fitzgerald), pyramidale, polarisée, seuil, Karvonen
- Spécificité trail : dénivelé, terrain technique, marche active comme compétence, gestion montée/descente
- Zones FC (méthode Karvonen, FC réserve) et allures de référence (VMA, seuil SL1/SL2, EF)
- Calcul km-effort trail (distance + D+/100), périodisation par blocs, affûtage

PRINCIPES ABSOLUS DU COACH (ne jamais violer):
1. JAMAIS 2 séances de qualité (Z4-Z5) consécutives sans EF ou repos entre elles
2. 80% du volume total en Z1-Z2 (endurance fondamentale) — méthode 80/20
3. Maximum 2 séances de qualité intense par semaine (Z4-Z5)
4. Semaine de décharge toutes les 3-4 semaines (-25 à -35% volume)
5. En trail : FC prime sur l'allure — adapter selon ressenti, jamais la vitesse
6. La marche active est une compétence trail, pas une faiblesse — l'intégrer consciemment
7. Progression volume max +10% par semaine
8. Après chaque compétition : 1 semaine de récup par heure de course
9. Allures TOUJOURS en MM:SS/km (base 60) — JAMAIS de décimales
10. Retourner du JSON pur valide uniquement, AUCUN texte autour`

  const userPrompt = `Génère un programme d'entraînement professionnel complet niveau coach certifié pour:

━━━ OBJECTIF ━━━
Type: ${goal.race_type.toUpperCase()} | Distance: ${goal.distance_km}km | D+: ${goal.elevation_gain || 0}m${goal.elevation_gain ? ` (D-: ${goal.elevation_gain}m estimé)` : ''}
Date: ${goal.race_date} | Durée dispo: ${weeksTotal} semaines
Niveau déclaré: ${goal.level}
Objectif temps: ${goal.target_time || 'Finisher confortable'}
Séances/semaine: ${goal.sessions_per_week} | Jours (0=Lun,6=Dim): ${goal.preferred_days?.join(',')}
${isTrail ? `Terrain: ${ratioElevation < 30 ? 'Trail roulant (< 30m D+/km)' : ratioElevation < 60 ? 'Trail moyen (30-60m D+/km)' : 'Trail montagne (> 60m D+/km)'}` : ''}
${isUltra ? '⚠️ ULTRA: marche active systématique, rando-courses 4h+, max 1 séance VMA/semaine, nutrition longue distance' : ''}

${athleteCtx}

━━━ VOLUMES CIBLES ━━━
Semaine 1 (départ): ${vStart} km
Progression → Pic: ${vPeak} km/sem
Décharges régulières: -30% du volume précédent
Affûtage: ${vTaper} km
Semaine avant course: ${vPreRace} km

━━━ ${periodisation} ━━━

━━━ TYPES DE SÉANCES AUTORISÉS ━━━
${isTrail ? `
🟢 EF TRAIL: footing en Z2 (${profile?.zones?.z2 ? profile.zones.z2.min+'-'+profile.zones.z2.max+' bpm' : '65-75% FCmax'}), marche active si pente > 15%, terrain varié sentiers
🔵 SORTIE LONGUE TRAIL: Z1-Z2 majoritaire, D+ progressif jusqu'à ${Math.round((goal.elevation_gain||500)*0.75)}m, intégrer ravitaillement${isUltra ? ', bâtons, nuit si ultra' : ''}
🟡 CÔTES LONGUES Z3-Z4: 3-6 × 5-12 min en montée 8-15%, récup descente lente, FC ${profile?.zones?.z3 ? profile.zones.z3.min+'-'+profile.zones.z4.max+' bpm' : '72-90% FCmax'}
🟠 CÔTES COURTES Z5 (éco de course): 8-12 × 20-30'' montée maximale 5-10%, récup descente complète, allure > VMA
🔴 FRACTIONNÉ VMA: 30-30 ou 1-1 ou 5×3min à ${profile?.paces?.vma100 ? secToMMSS(profile.paces.vma100.sec)+'/km' : '95-105% VMA'}
🟤 FARTLEK TRAIL: 1h-1h30, variations naturelles selon terrain, pas de chrono
${isUltra ? '🟣 RANDO-COURSE: 4h-7h, marche active systématique montées > 15%, ravito pratiqué, gestion mentale' : ''}
⚪ RÉCUP ACTIVE: < ${profile?.zones?.z1 ? profile.zones.z1.max+' bpm' : '60% FCmax'}, 30-45 min vélo/natation/marche ou repos complet
` : `
🟢 EF ROUTE: footing Z2 (${profile?.paces?.ef ? secToMMSS(profile.paces.ef.sec)+'/km' : 'allure confortable'}), conversation facile
🔵 SORTIE LONGUE: Z1-Z2, progression jusqu'à ${Math.round(goal.distance_km * 0.70)}km, 20 dernières min Z3 si avancé
🟡 TEMPO Z3: 20-40 min continu à ${profile?.paces?.tempo ? secToMMSS(profile.paces.tempo.sec)+'/km' : 'allure marathon'}, ou 3×10 min récup 2 min
🟠 SEUIL Z4: 4-6 × 5-8 min à ${profile?.paces?.seuil ? secToMMSS(profile.paces.seuil.sec)+'/km' : 'allure semi-marathon'}, récup 2-3 min trot
🔴 FRACTIONNÉ VMA Z5: 30-30 ou 1-1 ou 5×3min à ${profile?.paces?.vma100 ? secToMMSS(profile.paces.vma100.sec)+'/km' : 'allure VMA'}, récup ${profile?.paces?.recup ? secToMMSS(profile.paces.recup.sec)+'/km' : 'trot lent'}
🟤 STRIDES: 8-10 × 20'' accélérations légères après EF, récup 40'' marche
⚪ RÉCUP ACTIVE: < ${profile?.zones?.z1 ? profile.zones.z1.max+' bpm' : '60% FCmax'}, 30-45 min
`}

━━━ EXIGENCES DE QUALITÉ POUR CHAQUE SÉANCE ━━━
Pour chaque session, fournis:
- main_set: DESCRIPTION TRÈS DÉTAILLÉE (minimum 5 phrases) avec répétitions exactes, durées précises, allures en MM:SS/km, zones FC en BPM calculés, récupérations précises, gestion terrain spécifique trail
- warmup/cooldown: décrits précisément avec durée et FC/allure
- heart_rate_zone: format "Z2 — ${profile?.zones?.z2 ? profile.zones.z2.min+'-'+profile.zones.z2.max : 'XX-XX'} bpm — EF"
- target_pace: allure RÉELLE calculée depuis Strava en MM:SS/km
- tips: conseil technique spécifique et actionnable
- Si trail avec D+: adapter la description aux pentes, marche active, gestion FC

━━━ JSON ATTENDU ━━━
{
  "plan_name": "string accrocheur et personnalisé",
  "total_weeks": ${weeksTotal},
  "objective_summary": "4-5 phrases: analyse du profil athlète, stratégie de périodisation, points clés, objectif réaliste basé sur VMA ${profile?.vmaKmh || '?'} km/h et volume ${profile?.avgWeeklyKm || '?'} km/sem",
  "target_time": "${goal.target_time || 'Finisher'}",
  "athlete_profile_used": {
    "vma_kmh": ${profile?.vmaKmh || 'null'},
    "vo2max": ${profile?.vo2max || 'null'},
    "ef_pace": "${profile?.paces?.ef ? secToMMSS(profile.paces.ef.sec) : '--'}/km",
    "weekly_volume": ${profile?.avgWeeklyKm || 0}
  },
  "fc_zones": {
    "z1": "${profile?.zones ? profile.zones.z1.min+'-'+profile.zones.z1.max : 'N/A'} bpm — Récupération active",
    "z2": "${profile?.zones ? profile.zones.z2.min+'-'+profile.zones.z2.max : 'N/A'} bpm — Endurance Fondamentale",
    "z3": "${profile?.zones ? profile.zones.z3.min+'-'+profile.zones.z3.max : 'N/A'} bpm — Tempo / Seuil aérobie",
    "z4": "${profile?.zones ? profile.zones.z4.min+'-'+profile.zones.z4.max : 'N/A'} bpm — Seuil lactique",
    "z5": "${profile?.zones ? profile.zones.z5.min+'-'+profile.maxHR : 'N/A'} bpm — VO2max / VMA"
  },
  "phases": [{"name":"string","weeks":[1,2],"description":"string","color":"#hex"}],
  "weeks": [{
    "week_number": 1,
    "phase": "Base aérobie",
    "total_km": ${vStart},
    "total_elevation": 0,
    "percent_z1_z2": 85,
    "percent_z3_z4": 12,
    "percent_z5": 3,
    "focus": "string court",
    "coach_tip": "conseil précis et motivant du coach pour cette semaine",
    "load": "légère",
    "is_recovery_week": false,
    "sessions": [{
      "day_of_week": 1,
      "type": "Endurance fondamentale",
      "title": "Footing EF progression + strides",
      "duration_min": 50,
      "distance_km": 8,
      "elevation_m": 0,
      "intensity": "facile",
      "heart_rate_zone": "Z2 — ${profile?.zones ? profile.zones.z2.min+'-'+profile.zones.z2.max : 'XX-XX'} bpm — EF",
      "target_pace": "${profile?.paces?.ef ? secToMMSS(profile.paces.ef.sec) : '--'}/km",
      "warmup": "description échauffement avec durée et allure/FC précises",
      "main_set": "DESCRIPTION TRÈS DÉTAILLÉE: nombre exact de répétitions, durées précises, allures en MM:SS/km basées sur profil Strava, zones FC en bpm, récupérations précises, conseils terrain si trail",
      "cooldown": "description retour au calme avec durée et FC",
      "nutrition_tip": "conseil si séance > 60min",
      "description": "objectif physiologique précis de la séance",
      "tips": "conseil technique spécifique et actionnable",
      "equipment": "matériel recommandé précis",
      "completed": false,
      "quality": null,
      "strava_activity": null,
      "analysis": null
    }]
  }],
  "key_workouts": [
    {"name":"string","description":"string détaillée","week":1,"type":"string"}
  ],
  "warning_signs": ["signal d'alarme 1 à surveiller", "signal 2"],
  "race_day_plan": "plan course très détaillé: découpage par sections avec allures MM:SS/km basées sur objectif temps, stratégie montée/descente si trail, points de ravitaillement, gestion mentale, plan B si difficultés"
}`

  const text = await groqRequest(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    9000, true
  )
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!parsed.weeks?.length) throw new Error('Programme invalide — réessaie')
  return parsed
}

// ─────────────────────────────────────────────────────────────────
// ANALYSE POST-SÉANCE EXPERTE
// ─────────────────────────────────────────────────────────────────

export async function analyzeSession(plannedSession, stravaActivity, profile) {
  const paceSec = stravaActivity.average_speed ? Math.round(1000 / stravaActivity.average_speed) : null
  const paceStr = paceSec ? secToMMSS(paceSec) + '/km' : 'N/A'

  // Calcul dérives et écarts
  const distDiff = plannedSession.distance_km > 0
    ? Math.round(((stravaActivity.distance / 1000) - plannedSession.distance_km) / plannedSession.distance_km * 100)
    : 0
  const durDiff = plannedSession.duration_min > 0
    ? Math.round((Math.round(stravaActivity.moving_time / 60) - plannedSession.duration_min) / plannedSession.duration_min * 100)
    : 0

  const system = `Tu es un coach running expert niveau 3. Tu analyses les séances avec précision et bienveillance, en comparant les données physiologiques réelles aux objectifs. Tu donnes des conseils actionnables pour la suite. JSON uniquement.`

  const user = `Analyse cette séance de running:

PRÉVU:
- Séance: ${plannedSession.title} (${plannedSession.type})
- Corps: ${plannedSession.main_set}
- Distance: ${plannedSession.distance_km}km | Durée: ${plannedSession.duration_min}min
- Zone cible: ${plannedSession.heart_rate_zone}
- Allure cible: ${plannedSession.target_pace}
- Intensité: ${plannedSession.intensity}

RÉALISÉ (Strava):
- Distance: ${(stravaActivity.distance/1000).toFixed(2)}km (${distDiff > 0 ? '+' : ''}${distDiff}% vs prévu)
- Durée: ${Math.round(stravaActivity.moving_time/60)}min (${durDiff > 0 ? '+' : ''}${durDiff}% vs prévu)
- Allure moyenne: ${paceStr}
- FC moyenne: ${stravaActivity.average_heartrate || 'N/A'}bpm${profile?.zones ? ` (zone: ${stravaActivity.average_heartrate >= profile.zones.z5.min ? 'Z5' : stravaActivity.average_heartrate >= profile.zones.z4.min ? 'Z4' : stravaActivity.average_heartrate >= profile.zones.z3.min ? 'Z3' : stravaActivity.average_heartrate >= profile.zones.z2.min ? 'Z2' : 'Z1'})` : ''}
- FC max: ${stravaActivity.max_heartrate || 'N/A'}bpm
- Dénivelé: D+${Math.round(stravaActivity.total_elevation_gain||0)}m
${profile ? `Profil athlète: EF=${profile.paces?.ef ? secToMMSS(profile.paces.ef.sec) : '?'}/km, Z2=${profile.zones?.z2 ? profile.zones.z2.min+'-'+profile.zones.z2.max : '?'} bpm, VMA=${profile.vmaKmh || '?'} km/h` : ''}

JSON:
{
  "verdict": "VALIDÉE|TROP RAPIDE|TROP LENTE|INCOMPLÈTE|DÉPASSÉE|FC TROP HAUTE|FC TROP BASSE",
  "verdict_color": "#00b894|#e53e3e|#0066ff|#d97706|#8b5cf6|#e53e3e|#0066ff",
  "quality_score": 4,
  "quality_label": "Très bien",
  "compliance_pct": 92,
  "pace_analysis": "analyse précise allure réelle vs cible MM:SS/km + interprétation physiologique",
  "heart_rate_analysis": "analyse zones FC atteintes vs prévues avec bpm précis + interprétation",
  "positives": ["point positif précis et personnalisé 1", "point 2"],
  "improvements": ["amélioration concrète et actionnable 1", "amélioration 2"],
  "coach_comment": "commentaire complet 3-4 phrases, personnalisé, bienveillant et expert",
  "recovery_advice": "conseil récupération précis pour les 24-48h selon intensité réalisée",
  "next_session_adjustment": "ajustement concret et précis pour la prochaine séance (allure, volume, intensité)"
}`

  const text = await groqRequest(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    1800, true
  )
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

// ─────────────────────────────────────────────────────────────────
// INSIGHT DU JOUR
// ─────────────────────────────────────────────────────────────────

export async function getTodayInsight(todaySession, recentActivities, weekProgress, goal, profile) {
  if (!todaySession) return null
  try {
    const recent = recentActivities?.slice(0, 4).map(a => {
      const p = a.average_speed ? secToMMSS(Math.round(1000/a.average_speed)) + '/km' : 'N/A'
      const zone = profile?.zones && a.average_heartrate
        ? (a.average_heartrate >= profile.zones.z5.min ? 'Z5' :
           a.average_heartrate >= profile.zones.z4.min ? 'Z4' :
           a.average_heartrate >= profile.zones.z3.min ? 'Z3' :
           a.average_heartrate >= profile.zones.z2.min ? 'Z2' : 'Z1')
        : ''
      return `${a.name}: ${(a.distance/1000).toFixed(1)}km @ ${p}${a.average_heartrate ? ` FC:${Math.round(a.average_heartrate)}bpm${zone ? ' ('+zone+')' : ''}` : ''}`
    }).join(' | ') || 'aucune activité récente'

    const system = `Coach running expert. Tu génères un insight quotidien court, basé sur les données réelles de l'athlète. L'insight doit être actionnable et motivant. JSON uniquement.`
    const user = `Séance du jour: "${todaySession.title}" — ${todaySession.type}, ${todaySession.distance_km}km, zone ${todaySession.heart_rate_zone}, allure cible ${todaySession.target_pace}
Activités récentes: ${recent}
Semaine: ${weekProgress.completed}/${weekProgress.total} séances faites | J-${goal ? Math.ceil((new Date(goal.race_date)-new Date())/86400000) : '?'} avant ${goal?.name || 'la course'}
${profile ? `Profil: EF=${profile.paces?.ef ? secToMMSS(profile.paces.ef.sec) : '?'}/km, ${profile.avgWeeklyKm}km/sem` : ''}
JSON: {"message": "insight précis et motivant max 140 caractères basé sur les données réelles", "type": "normal|warning|positive"}`
    const text = await groqRequest(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      400, true
    )
    return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────
// INSIGHTS DASHBOARD
// ─────────────────────────────────────────────────────────────────

export function generateInsights(stats, goals) {
  if (!stats) return []
  const profile = computeAthleteProfile(stats)
  const insights = []
  const activeGoal = goals?.find(g => new Date(g.race_date) >= new Date())
  const daysLeft = activeGoal ? Math.ceil((new Date(activeGoal.race_date) - new Date()) / 86400000) : null
  const lastWeek = stats.weeklyTrend?.[stats.weeklyTrend.length - 1]?.km || 0
  const prevWeek = stats.weeklyTrend?.[stats.weeklyTrend.length - 2]?.km || 0

  if (lastWeek > prevWeek * 1.1) insights.push({ type: 'positive', icon: '📈', text: `Volume en hausse cette semaine (+${Math.round(lastWeek - prevWeek)}km). Continue, la progression est bonne !` })
  else if (lastWeek < prevWeek * 0.7 && prevWeek > 0) insights.push({ type: 'warning', icon: '⚠️', text: `Volume en baisse (${lastWeek}km vs ${prevWeek}km). Fatigue accumulée ou semaine chargée ?` })

  if (stats.currentStreak >= 4) insights.push({ type: 'positive', icon: '🔥', text: `${stats.currentStreak} semaines consécutives régulières — la constance est le secret des meilleurs coureurs.` })
  else if (stats.currentStreak <= 1) insights.push({ type: 'warning', icon: '📅', text: 'Régularité à améliorer. Vise 3-4 semaines consécutives sans coupure pour progresser.' })

  if (stats.efPaceSecPerKm) {
    const efStr = secToMMSS(stats.efPaceSecPerKm)
    insights.push({ type: 'info', icon: '💡', text: `Ton allure EF réelle (Z2 Strava): ${efStr}/km. C'est ta zone de développement aérobie — 80% de tes km doivent être à cette allure.` })
  }

  if (stats.avgHR && stats.maxHR) {
    const hrPct = Math.round((stats.avgHR / stats.maxHR) * 100)
    if (hrPct > 78) insights.push({ type: 'warning', icon: '❤️', text: `FC moyenne ${stats.avgHR}bpm = ${hrPct}% FCmax. Tes séances sont trop intenses en moyenne. Intègre plus d'EF (Z2).` })
  }

  if (daysLeft && activeGoal) {
    if (daysLeft < 14) insights.push({ type: 'warning', icon: '🏁', text: `J-${daysLeft} avant ${activeGoal.name} — affûtage final, préserve ta fraîcheur, maintiens juste l'intensité.` })
    else if (daysLeft < 30) insights.push({ type: 'warning', icon: '🏃', text: `J-${daysLeft} avant ${activeGoal.name} — réduis progressivement le volume, maintiens l'intensité.` })
  }

  if (profile?.vmaKmh) insights.push({ type: 'info', icon: '⚡', text: `VMA estimée: ${profile.vmaKmh} km/h | VO2max: ~${profile.vo2max} ml/kg/min. Base solide pour progresser.` })

  return insights.slice(0, 3)
}

// ─────────────────────────────────────────────────────────────────
// ADAPTATION PLAN INTELLIGENTE
// ─────────────────────────────────────────────────────────────────

export async function adaptWeek(currentWeek, completedSessions, missedSessions, fatigue, goal, stravaStats) {
  const profile = computeAthleteProfile(stravaStats)
  const athleteCtx = buildAthleteContext(profile, goal)

  const system = `Tu es coach running expert. Tu adaptes le programme de façon intelligente et physiologiquement cohérente selon la réalité de l'athlète. Tes adaptations respectent le principe 80/20 et jamais 2 séances qualité consécutives. JSON uniquement.`

  const user = `Semaine ${currentWeek?.week_number} (phase: ${currentWeek?.phase}):
- Séances réalisées: ${completedSessions.length} — ${completedSessions.map(s=>s.title).join(', ')||'aucune'}
- Séances manquées: ${missedSessions.map(s=>s.title).join(', ')||'aucune'}
- Fatigue ressentie: ${fatigue}/5 (1=épuisé, 2=très fatigué, 3=normal, 4=frais, 5=très frais)
- Analyses Strava: ${completedSessions.filter(s=>s.analysis).map(s=>`${s.title} → ${s.analysis?.verdict}`).join(' | ')||'aucune analyse disponible'}
${athleteCtx}

JSON:
{
  "adaptation_needed": true,
  "reason": "explication physiologique précise du pourquoi de l'adaptation",
  "adjustments": [{
    "session_title": "titre séance",
    "original_distance_km": 12,
    "new_distance_km": 9,
    "original_intensity": "soutenu",
    "new_intensity": "modéré",
    "original_zone": "Z4",
    "new_zone": "Z3",
    "change_reason": "explication précise du changement"
  }],
  "coach_message": "message motivant personnalisé avec conseil concret pour la suite",
  "weekly_volume_pct": -15,
  "priority_next_week": "ce sur quoi se concentrer la semaine prochaine"
}`

  const text = await groqRequest(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    2000, true
  )
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

// ─────────────────────────────────────────────────────────────────
// CHAT COACH IA
// ─────────────────────────────────────────────────────────────────

export async function chatWithCoach(messages, ctx, stravaStats) {
  const profile = computeAthleteProfile(stravaStats)
  const efStr = profile?.paces?.ef ? secToMMSS(profile.paces.ef.sec) + '/km' : (ctx.efPaceSec ? secToMMSS(ctx.efPaceSec) + '/km' : 'non définie')
  const seuilStr = profile?.paces?.seuil ? secToMMSS(profile.paces.seuil.sec) + '/km' : 'non définie'
  const vmaStr = profile?.vmaKmh ? profile.vmaKmh + ' km/h' : 'non définie'

  const system = `Tu es TrailForge Coach, coach expert en running et trail running certifié niveau 3 (15 ans d'expérience, de débutant à élite).

PROFIL ATHLÈTE:
- Objectif: ${ctx.goalName || '?'} | Niveau: ${ctx.level || '?'} | J-${ctx.daysUntilRace || '?'}${ctx.targetTime ? ' | Objectif temps: ' + ctx.targetTime : ''}
- Volume: ${ctx.weeklyKm || profile?.avgWeeklyKm || '?'} km/sem | Ce mois: ${ctx.monthKm || '?'} km, ${ctx.monthElevation || '?'} m D+
- VMA estimée: ${vmaStr} | VO2max: ~${profile?.vo2max || '?'} ml/kg/min
- Allure EF réelle: ${efStr} | Allure seuil: ${seuilStr}
- FC max: ${ctx.maxHR || profile?.maxHR || '?'} bpm
${profile?.zones ? `- Zones FC: Z2=${profile.zones.z2.min}-${profile.zones.z2.max}bpm, Z4=${profile.zones.z4.min}-${profile.zones.z4.max}bpm` : ''}

Tu maîtrises: périodisation, zones FC Karvonen, VMA, seuil lactique SL1/SL2, spécificité trail, marche active, nutrition course, récupération, prévention blessures.
Réponds en français. Direct, expert, motivant. Allures en MM:SS/km uniquement. Zones FC en bpm si connues. Max 4 paragraphes concis.`

  const text = await groqRequest(
    [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))],
    1400, false
  )
  return text
}
