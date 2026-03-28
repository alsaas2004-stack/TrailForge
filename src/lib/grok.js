import { secToMMSS } from './strava'

const GROQ_API_KEY = import.meta.env.VITE_GROK_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Modèle puissant pour la génération de programme
const MODEL_FULL = 'llama-3.3-70b-versatile'
// Modèle rapide (moins de tokens) pour l'analyse de séance et insights
const MODEL_FAST = 'llama-3.1-8b-instant'

async function groqRequest(messages, maxTokens = 1500, jsonMode = false, fast = false) {
  const body = {
    model: fast ? MODEL_FAST : MODEL_FULL,
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

// ── Calcul profil athlète depuis Strava ──
export function computeAthleteProfile(stravaStats) {
  if (!stravaStats) return null
  const { maxHR, avgHR, bestPaceSecPerKm, efPaceSecPerKm, avgWeeklyKm } = stravaStats
  const fcRepos = 50
  const fcReserve = maxHR ? maxHR - fcRepos : null
  const zones = fcReserve ? {
    z1: { min: Math.round(fcRepos + 0.50 * fcReserve), max: Math.round(fcRepos + 0.60 * fcReserve) },
    z2: { min: Math.round(fcRepos + 0.60 * fcReserve), max: Math.round(fcRepos + 0.72 * fcReserve) },
    z3: { min: Math.round(fcRepos + 0.72 * fcReserve), max: Math.round(fcRepos + 0.82 * fcReserve) },
    z4: { min: Math.round(fcRepos + 0.82 * fcReserve), max: Math.round(fcRepos + 0.90 * fcReserve) },
    z5: { min: Math.round(fcRepos + 0.90 * fcReserve), max: maxHR }
  } : null
  const vmaSecPerKm = bestPaceSecPerKm ? Math.round(bestPaceSecPerKm * 0.95) : null
  const vmaKmh = vmaSecPerKm ? Math.round((3600 / vmaSecPerKm) * 10) / 10 : null
  let vo2max = null
  if (vmaSecPerKm) {
    const spd = 60000 / vmaSecPerKm
    vo2max = Math.max(25, Math.min(90, Math.round(-4.6 + 0.182258 * spd + 0.000104 * spd * spd)))
  }
  const paces = bestPaceSecPerKm ? {
    ef:    efPaceSecPerKm || Math.round(bestPaceSecPerKm * 1.35),
    tempo: Math.round(bestPaceSecPerKm * 1.15),
    seuil: Math.round(bestPaceSecPerKm * 1.08),
    vma:   vmaSecPerKm,
    recup: Math.round(bestPaceSecPerKm * 1.55)
  } : null
  return { maxHR, avgHR, fcRepos, zones, vmaKmh, vo2max, paces, avgWeeklyKm: Math.round(avgWeeklyKm || 0) }
}

// ── Vérification faisabilité objectif ──
export function checkGoalFeasibility(goal, profile) {
  const today = new Date()
  const raceDate = new Date(goal.race_date)
  const weeksLeft = Math.ceil((raceDate - today) / (7 * 86400000))

  if (weeksLeft < 3) {
    return { feasible: false, message: `Seulement ${weeksLeft} semaine(s) avant la course — il faut minimum 3 semaines pour générer un programme efficace.` }
  }

  if (!goal.target_time || !profile?.paces) return { feasible: true, message: null }

  const timeStr = goal.target_time
  let targetSec = null
  const hMatch = timeStr.match(/(\d+)h(\d+)/i)
  const mMatch = timeStr.match(/^(\d+)[\s]?min/i)
  if (hMatch) targetSec = parseInt(hMatch[1]) * 3600 + parseInt(hMatch[2]) * 60
  else if (mMatch) targetSec = parseInt(mMatch[1]) * 60

  if (!targetSec) return { feasible: true, message: null }

  const targetPaceSecPerKm = targetSec / goal.distance_km
  const minRealisticPace = profile.paces.vma ? Math.round(profile.paces.vma * 1.05) : null

  if (minRealisticPace && targetPaceSecPerKm < minRealisticPace) {
    return {
      feasible: false,
      message: `L'objectif "${goal.target_time}" nécessite de courir à ${secToMMSS(targetPaceSecPerKm)}/km, ce qui dépasse tes capacités actuelles (VMA estimée: ${profile.vmaKmh} km/h). Essaie un objectif plus progressif ou sélectionne "Finisher".`
    }
  }

  return { feasible: true, message: null }
}

// ── Génération du programme ──
export async function generateTrainingPlan(goal, stravaStats) {
  const today = new Date()
  const raceDate = new Date(goal.race_date)
  const weeksTotal = Math.min(Math.max(3, Math.ceil((raceDate - today) / (7 * 86400000))), 20)

  const profile = computeAthleteProfile(stravaStats)

  const feasibility = checkGoalFeasibility(goal, profile)
  if (!feasibility.feasible) throw new Error(feasibility.message)

  const baseKm = Math.max(profile?.avgWeeklyKm || 30, goal.distance_km * 0.85)
  const mults = { débutant: 0.9, intermédiaire: 1.15, avancé: 1.35 }
  const mult = mults[goal.level] || 1.1
  const vStart   = Math.round(baseKm * 0.70)
  const vPeak    = Math.round(baseKm * mult * 1.25)
  const vTaper   = Math.round(baseKm * 0.50)
  const vPreRace = Math.round(baseKm * 0.30)

  const isTrail = goal.race_type === 'trail' || goal.race_type === 'ultra'
  const isUltra = goal.race_type === 'ultra' || goal.distance_km > 60

  const z2str = profile?.zones ? `${profile.zones.z2.min}-${profile.zones.z2.max} bpm` : '65-75% FCmax'
  const z3str = profile?.zones ? `${profile.zones.z3.min}-${profile.zones.z3.max} bpm` : '72-82% FCmax'
  const z4str = profile?.zones ? `${profile.zones.z4.min}-${profile.zones.z4.max} bpm` : '82-90% FCmax'
  const z5str = profile?.zones ? `${profile.zones.z5.min}-${profile?.maxHR} bpm` : '90-100% FCmax'

  const efStr    = profile?.paces?.ef    ? secToMMSS(profile.paces.ef)    + '/km' : 'allure très facile'
  const tempoStr = profile?.paces?.tempo ? secToMMSS(profile.paces.tempo) + '/km' : 'allure marathon'
  const seuilStr = profile?.paces?.seuil ? secToMMSS(profile.paces.seuil) + '/km' : 'allure semi-marathon'
  const vmaStr   = profile?.paces?.vma   ? secToMMSS(profile.paces.vma)   + '/km' : 'allure VMA'
  const recupStr = profile?.paces?.recup ? secToMMSS(profile.paces.recup) + '/km' : 'trot très lent'

  const nbSessions = goal.sessions_per_week || 3
  const days = goal.preferred_days || [1, 3, 5]

  const system = `Tu es un coach running et trail expert certifié niveau 3. Tu génères des programmes d'entraînement CORRECTS et COHÉRENTS.

RÈGLES STRICTES SUR LES TYPES DE SÉANCES — NE JAMAIS VIOLER:

1. ENDURANCE FONDAMENTALE (EF) = footing CONTINU sans interruption
   - Zone Z2 (${z2str}), allure ${efStr}
   - PAS d'intervalles, PAS de répétitions avec pauses
   - En trail: marche autorisée dans les montées UNIQUEMENT pour rester en Z2

2. FRACTIONNÉ / VMA = répétitions COURTES et INTENSES avec récupération
   - Zone Z5 (${z5str}), allure ${vmaStr}
   - Format: "8 × 400m à ${vmaStr} récup 90sec trot"
   - Récup entre répétitions: trot à ${recupStr}

3. SEUIL / TEMPO = efforts SOUTENUS de 5-20 min
   - Zone Z4 (${z4str}), allure ${seuilStr}
   - Format: "3 × 8 min à ${seuilStr} récup 3 min trot" ou "25 min continu"

4. SORTIE LONGUE = footing LONG et CONTINU en Z2
   - Allure ${efStr}, terrain varié si trail

5. CÔTES (trail uniquement) = montées effort + descente récupération
   - "6 × 3 min montée à ${z4str} récup descente"

RÈGLES DE STRUCTURE:
- EXACTEMENT ${nbSessions} séances par semaine
- Jours choisis: ${days.join(', ')} (0=Lun, 1=Mar, 2=Mer, 3=Jeu, 4=Ven, 5=Sam, 6=Dim)
- JAMAIS 2 séances qualité (Z4-Z5) consécutives
- 80% volume en Z1-Z2
- Max 1 séance Z5 par semaine
- Semaine de décharge toutes les 3-4 semaines (-30%)
- JSON pur UNIQUEMENT`

  const user = `Programme: ${goal.race_type} ${goal.distance_km}km D+${goal.elevation_gain || 0}m
${weeksTotal} semaines | Niveau: ${goal.level} | Objectif: ${goal.target_time || 'Finisher'}
${nbSessions} séances/sem sur jours: [${days.join(', ')}]
${isUltra ? 'ULTRA: rando-courses longues, marche active systématique' : ''}

PROFIL ATHLÈTE (Strava):
Volume: ${profile?.avgWeeklyKm || '?'} km/sem | VMA: ${profile?.vmaKmh || '?'} km/h | VO2max: ~${profile?.vo2max || '?'}
EF: ${efStr} | Tempo: ${tempoStr} | Seuil: ${seuilStr} | VMA: ${vmaStr} | Récup: ${recupStr}
FC max: ${profile?.maxHR || '?'} bpm

Volumes: S1=${vStart}km → pic=${vPeak}km → affûtage=${vTaper}km → J-7=${vPreRace}km

JSON:
{
  "plan_name": "string",
  "total_weeks": ${weeksTotal},
  "objective_summary": "string",
  "target_time": "${goal.target_time || 'Finisher'}",
  "fc_zones": {
    "z1": "bpm — Récupération",
    "z2": "${z2str} — Endurance Fondamentale",
    "z3": "${z3str} — Tempo",
    "z4": "${z4str} — Seuil lactique",
    "z5": "${z5str} — VO2max"
  },
  "phases": [{"name":"string","weeks":[1,2],"description":"string","color":"#hex"}],
  "weeks": [{
    "week_number": 1,
    "phase": "Base aérobie",
    "total_km": ${vStart},
    "total_elevation": 0,
    "focus": "string",
    "coach_tip": "conseil motivant",
    "load": "légère",
    "is_recovery_week": false,
    "sessions": [{
      "day_of_week": ${days[0]},
      "type": "Endurance fondamentale",
      "title": "Footing EF",
      "duration_min": 45,
      "distance_km": 7,
      "elevation_m": 0,
      "intensity": "facile",
      "heart_rate_zone": "Z2 — ${z2str} — EF",
      "target_pace": "${efStr}",
      "warmup": "Partir directement lentement, pas d'échauffement nécessaire",
      "main_set": "45 min de footing CONTINU à ${efStr}, FC entre ${z2str}. Aucune pause. Test de la parole: tu dois pouvoir parler en phrases complètes.",
      "cooldown": "5 min de marche",
      "nutrition_tip": "",
      "description": "Développer la base aérobie",
      "tips": "Résister à l'envie d'accélérer. Rester en Z2 du début à la fin.",
      "equipment": "Chaussures running, montre GPS",
      "completed": false,
      "quality": null,
      "strava_activity": null,
      "analysis": null
    }]
  }],
  "race_day_plan": "string avec allures et stratégie"
}

IMPORTANT: Génère EXACTEMENT ${nbSessions} sessions/semaine sur les jours [${days.join(', ')}].`

  const text = await groqRequest(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    9000, true, false
  )
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!parsed.weeks?.length) throw new Error('Programme invalide — réessaie')
  return parsed
}

// ── Analyse post-séance (modèle RAPIDE = moins de tokens) ──
export async function analyzeSession(plannedSession, stravaActivity) {
  const paceSec = stravaActivity.average_speed ? Math.round(1000 / stravaActivity.average_speed) : null
  const paceStr = paceSec ? secToMMSS(paceSec) + '/km' : 'N/A'

  const system = `Coach running expert. Analyse la séance avec précision. JSON uniquement.`
  const user = `PRÉVU: ${plannedSession.title} — ${plannedSession.main_set?.slice(0, 200)}
Distance: ${plannedSession.distance_km}km · Durée: ${plannedSession.duration_min}min · Zone: ${plannedSession.heart_rate_zone} · Allure: ${plannedSession.target_pace}
RÉALISÉ: ${(stravaActivity.distance/1000).toFixed(2)}km · ${Math.round(stravaActivity.moving_time/60)}min · ${paceStr} · FC: ${stravaActivity.average_heartrate||'N/A'}bpm · D+${Math.round(stravaActivity.total_elevation_gain||0)}m
JSON: {"verdict":"VALIDÉE","verdict_color":"#00b894","quality_score":4,"quality_label":"Très bien","compliance_pct":92,"pace_analysis":"string","heart_rate_analysis":"string","positives":["string"],"improvements":["string"],"coach_comment":"string","recovery_advice":"string","next_session_adjustment":"string"}
Verdicts possibles: VALIDÉE(#00b894), TROP RAPIDE(#e53e3e), TROP LENTE(#0066ff), INCOMPLÈTE(#d97706), DÉPASSÉE(#8b5cf6)`

  // Utilise le modèle RAPIDE pour économiser les tokens
  const text = await groqRequest(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    800, true, true // fast=true → llama-3.1-8b-instant
  )
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

// ── Insight du jour (modèle rapide) ──
export async function getTodayInsight(todaySession, recentActivities, weekProgress, goal) {
  if (!todaySession) return null
  try {
    const recent = recentActivities?.slice(0, 3).map(a => {
      const p = a.average_speed ? secToMMSS(Math.round(1000/a.average_speed)) + '/km' : 'N/A'
      return `${a.name}: ${(a.distance/1000).toFixed(1)}km @ ${p}`
    }).join(', ') || 'aucune activité récente'
    const system = `Coach running. Insight court et motivant. JSON uniquement.`
    const user = `Séance: ${todaySession.title} (${todaySession.type}, ${todaySession.distance_km}km, ${todaySession.target_pace})
Récent: ${recent} | Semaine: ${weekProgress.completed}/${weekProgress.total} | J-${goal ? Math.ceil((new Date(goal.race_date)-new Date())/86400000) : '?'}
JSON: {"message":"max 130 chars motivant","type":"normal|warning|positive"}`
    const text = await groqRequest(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      300, true, true // fast=true
    )
    return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
  } catch { return null }
}

// ── Insights dashboard (local, sans IA) ──
export function generateInsights(stats, goals) {
  if (!stats) return []
  const profile = computeAthleteProfile(stats)
  const insights = []
  const activeGoal = goals?.find(g => new Date(g.race_date) >= new Date())
  const daysLeft = activeGoal ? Math.ceil((new Date(activeGoal.race_date) - new Date()) / 86400000) : null
  const lastWeek = stats.weeklyTrend?.[stats.weeklyTrend.length - 1]?.km || 0
  const prevWeek = stats.weeklyTrend?.[stats.weeklyTrend.length - 2]?.km || 0
  if (lastWeek > prevWeek * 1.1) insights.push({ type: 'positive', icon: '📈', text: `Volume en hausse (+${Math.round(lastWeek - prevWeek)}km cette semaine) — bonne progression !` })
  else if (lastWeek < prevWeek * 0.7 && prevWeek > 0) insights.push({ type: 'warning', icon: '⚠️', text: `Volume en baisse (${lastWeek}km vs ${prevWeek}km). Fatigue ou semaine chargée ?` })
  if (stats.currentStreak >= 3) insights.push({ type: 'positive', icon: '🔥', text: `${stats.currentStreak} semaines régulières — la constance est la clé du progrès.` })
  if (stats.efPaceSecPerKm) insights.push({ type: 'info', icon: '💡', text: `Allure EF réelle Strava: ${secToMMSS(stats.efPaceSecPerKm)}/km. 80% de tes km doivent être à cette allure (zone 2).` })
  if (stats.avgHR && stats.maxHR) {
    const pct = Math.round((stats.avgHR / stats.maxHR) * 100)
    if (pct > 78) insights.push({ type: 'warning', icon: '❤️', text: `FC moyenne ${stats.avgHR}bpm (${pct}% FCmax) trop élevée — trop d'intensité. Intègre plus d'EF !` })
  }
  if (daysLeft && daysLeft < 21 && activeGoal) insights.push({ type: 'warning', icon: '🏁', text: `J-${daysLeft} avant ${activeGoal.name} — affûtage, réduis le volume et préserve ta fraîcheur.` })
  if (profile?.vmaKmh) insights.push({ type: 'info', icon: '⚡', text: `VMA estimée: ${profile.vmaKmh} km/h | VO2max: ~${profile.vo2max} ml/kg/min.` })
  return insights.slice(0, 3)
}

// ── Adaptation plan (modèle rapide) ──
export async function adaptWeek(currentWeek, completedSessions, missedSessions, fatigue, goal, stravaStats) {
  const profile = computeAthleteProfile(stravaStats)
  const system = `Coach running expert. Adapte le programme. 80/20, jamais 2 séances qualité consécutives. JSON uniquement.`
  const user = `Semaine ${currentWeek?.week_number} (${currentWeek?.phase}):
Faites: ${completedSessions.map(s=>s.title).join(', ')||'aucune'}
Manquées: ${missedSessions.map(s=>s.title).join(', ')||'aucune'}
Fatigue: ${fatigue}/5 | Volume: ${profile?.avgWeeklyKm || '?'} km/sem
JSON: {"adaptation_needed":true,"reason":"string","adjustments":[{"session_title":"string","original_distance_km":10,"new_distance_km":8,"change_reason":"string"}],"coach_message":"string","weekly_volume_pct":-10}`
  const text = await groqRequest(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    1000, true, true // fast=true
  )
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

// ── Chat coach ──
export async function chatWithCoach(messages, ctx) {
  const efStr = ctx.efPaceSec ? secToMMSS(ctx.efPaceSec) + '/km' : 'non définie'
  const system = `Tu es TrailForge Coach, coach running et trail expert certifié niveau 3.
Athlète: objectif="${ctx.goalName||'?'}", niveau="${ctx.level||'?'}", ${ctx.weeklyKm||0}km/sem, J-${ctx.daysUntilRace||'?'}${ctx.targetTime?', objectif: '+ctx.targetTime:''}.
Allure EF réelle: ${efStr}. FC max: ${ctx.maxHR||'?'}bpm. Ce mois: ${ctx.monthKm||0}km, ${ctx.monthElevation||0}m D+.
Réponds en français. Direct, expert, motivant. Allures en MM:SS/km. Max 4 paragraphes.`
  const text = await groqRequest(
    [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))],
    1200, false, false
  )
  return text
}
