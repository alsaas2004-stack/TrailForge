import { secToMMSS } from './strava'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

async function geminiRequest(systemPrompt, userMessage, jsonMode = false) {
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: jsonMode ? 16000 : 1500,
      ...(jsonMode && { responseMimeType: 'application/json' })
    }
  }
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Erreur Gemini ${res.status}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function geminiChat(messages, systemPrompt) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.5, maxOutputTokens: 1500 }
  }
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Erreur Gemini ${res.status}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

function buildPaceContext(stravaStats) {
  if (!stravaStats) return 'Pas de données Strava disponibles.'
  const ef = stravaStats.efPaceSecPerKm ? secToMMSS(stravaStats.efPaceSecPerKm) + '/km' : 'inconnue'
  const best = stravaStats.bestPaceSecPerKm ? secToMMSS(stravaStats.bestPaceSecPerKm) + '/km' : 'inconnue'
  const seuil = stravaStats.bestPaceSecPerKm ? secToMMSS(Math.round(stravaStats.bestPaceSecPerKm * 1.22)) + '/km' : 'inconnue'
  const vma = stravaStats.bestPaceSecPerKm ? secToMMSS(Math.round(stravaStats.bestPaceSecPerKm * 0.92)) + '/km' : 'inconnue'
  return `DONNÉES RÉELLES STRAVA:
- Allure EF (zone 2, mesurée): ${ef} → UTILISE CETTE ALLURE pour toutes les séances faciles
- Meilleure allure récente (5km+): ${best}
- Allure seuil estimée: ${seuil}
- Allure VMA estimée: ${vma}
- FC max: ${stravaStats.maxHR || '?'} bpm
- Volume actuel: ${Math.round(stravaStats.avgWeeklyKm)} km/sem
RÈGLE: Ne jamais inventer des allures. Format MM:SS/km UNIQUEMENT (ex: 6:30/km, jamais 6.5).`
}

export async function generateTrainingPlan(goal, stravaStats) {
  const today = new Date()
  const raceDate = new Date(goal.race_date)
  const weeksTotal = Math.min(Math.max(2, Math.ceil((raceDate - today) / (7 * 86400000))), 20)
  const base = Math.max(goal.current_weekly_km || 30, goal.distance_km * 0.9)
  const mults = { débutant: 1.0, intermédiaire: 1.2, avancé: 1.4 }
  const mult = mults[goal.level] || 1.2
  const vStart = Math.round(base * 0.75)
  const vPeak = Math.round(base * mult * 1.35)
  const vTaper = Math.round(base * 0.55)
  const vPreRace = Math.round(base * 0.35)
  const paceCtx = buildPaceContext(stravaStats)

  const system = `Tu es un coach trail et running expert de niveau international (UTMB, RunMotion, Kilian Jornet coaching). Tu génères des programmes d'entraînement PROFESSIONNELS, RÉALISTES et BIEN DIMENSIONNÉS.

RÈGLES ABSOLUES:
1. Volume pic OBLIGATOIRE: ${vPeak}km/sem MINIMUM pour un ${goal.distance_km}km
2. Sortie longue max: ${Math.round(goal.distance_km * 0.70)}km en semaine de pic
3. 75% du volume en zone 2 (endurance fondamentale)
4. Cycle 3 semaines charge + 1 semaine récupération (-20%)
5. Allures TOUJOURS en MM:SS/km - JAMAIS de décimales
6. Pour trail: séances spécifiques montée/descente technique, bâtons si ultra
7. Séances variées: EF, fractionné, seuil, côtes, sortie longue, récup active
8. Retourner du JSON pur valide uniquement, aucun texte autour`

  const user = `Génère un programme complet pour:
COURSE: ${goal.race_type.toUpperCase()} ${goal.distance_km}km D+${goal.elevation_gain || 0}m
DATE: ${goal.race_date} | DURÉE: ${weeksTotal} semaines
NIVEAU: ${goal.level} | OBJECTIF: ${goal.target_time || 'Finir confortablement'}
SÉANCES/SEM: ${goal.sessions_per_week} | JOURS (0=Lun,6=Dim): ${goal.preferred_days?.join(',')}

${paceCtx}

VOLUMES OBLIGATOIRES:
S1: ${vStart}km → montée progressive → pic: ${vPeak}km → affûtage: ${vTaper}km → J-7: ${vPreRace}km

JSON PUR:
{
  "plan_name": "string",
  "total_weeks": ${weeksTotal},
  "objective_summary": "string 2-3 phrases",
  "target_time": "${goal.target_time || 'Finisher'}",
  "phases": [{"name":"string","weeks":[1,2],"description":"string","color":"#hex"}],
  "weeks": [{
    "week_number": 1,
    "phase": "Fondamentale",
    "total_km": ${vStart},
    "total_elevation": 200,
    "focus": "string court",
    "coach_tip": "conseil motivant précis",
    "sessions": [{
      "day_of_week": 1,
      "type": "Endurance fondamentale",
      "title": "Footing EF",
      "duration_min": 45,
      "distance_km": 7,
      "elevation_m": 0,
      "intensity": "facile",
      "heart_rate_zone": "Zone 2 — 65-75% FCmax",
      "target_pace": "MM:SS/km basé sur données réelles",
      "warmup": "description échauffement",
      "main_set": "description TRÈS DÉTAILLÉE avec allures MM:SS, répétitions, récupérations",
      "cooldown": "description retour au calme",
      "nutrition_tip": "",
      "description": "but de la séance",
      "tips": "conseil exécution",
      "equipment": "matériel recommandé",
      "completed": false,
      "quality": null,
      "strava_activity": null,
      "analysis": null
    }]
  }],
  "race_day_plan": "plan course détaillé avec allures MM:SS par section"
}`

  const text = await geminiRequest(system, user, true)
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!parsed.weeks?.length) throw new Error('Programme invalide — réessaie')
  return parsed
}

export async function analyzeSession(plannedSession, stravaActivity) {
  const paceSec = stravaActivity.average_speed ? Math.round(1000 / stravaActivity.average_speed) : null
  const paceStr = paceSec ? secToMMSS(paceSec) + '/km' : 'N/A'
  const system = `Tu es un coach running expert. Analyse la séance précisément. JSON uniquement.`
  const user = `PRÉVU: ${plannedSession.title} — ${plannedSession.main_set}
Distance: ${plannedSession.distance_km}km · Durée: ${plannedSession.duration_min}min · Allure cible: ${plannedSession.target_pace}
RÉALISÉ: ${(stravaActivity.distance/1000).toFixed(2)}km · ${Math.round(stravaActivity.moving_time/60)}min · ${paceStr} · FC: ${stravaActivity.average_heartrate||'N/A'}bpm · D+${Math.round(stravaActivity.total_elevation_gain||0)}m

JSON: {"verdict":"VALIDÉE","verdict_color":"#00b894","quality_score":4,"quality_label":"Très bien","compliance_pct":92,"pace_analysis":"string","heart_rate_analysis":"string","positives":["string"],"improvements":["string"],"coach_comment":"string","recovery_advice":"string","next_session_adjustment":"string"}
Verdicts possibles: VALIDÉE (#00b894), TROP RAPIDE (#e53e3e), TROP LENTE (#0066ff), INCOMPLÈTE (#d97706), DÉPASSÉE (#8b5cf6)`

  const text = await geminiRequest(system, user, true)
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

export async function getTodayInsight(todaySession, recentActivities, weekProgress, goal) {
  if (!todaySession) return null
  try {
    const recent = recentActivities?.slice(0, 3).map(a => {
      const p = a.average_speed ? secToMMSS(Math.round(1000/a.average_speed)) + '/km' : 'N/A'
      return `${a.name}: ${(a.distance/1000).toFixed(1)}km @ ${p}`
    }).join(', ') || 'aucune activité récente'
    const system = `Coach running. Insight court et motivant pour la séance du jour. JSON uniquement.`
    const user = `Séance: ${todaySession.title} (${todaySession.type}, ${todaySession.distance_km}km, allure: ${todaySession.target_pace})
Récent: ${recent} | Semaine: ${weekProgress.completed}/${weekProgress.total} | J-${goal ? Math.ceil((new Date(goal.race_date)-new Date())/86400000) : '?'}
JSON: {"message":"max 120 chars motivant et actionnable","type":"normal"}`
    const text = await geminiRequest(system, user, true)
    return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
  } catch { return null }
}

export function generateInsights(stats, goals) {
  if (!stats) return []
  const insights = []
  const activeGoal = goals?.find(g => new Date(g.race_date) >= new Date())
  const daysLeft = activeGoal ? Math.ceil((new Date(activeGoal.race_date) - new Date()) / 86400000) : null
  const lastWeek = stats.weeklyTrend?.[stats.weeklyTrend.length - 1]?.km || 0
  const prevWeek = stats.weeklyTrend?.[stats.weeklyTrend.length - 2]?.km || 0
  if (lastWeek > prevWeek * 1.1) insights.push({ type: 'positive', text: `Volume en hausse (+${Math.round(lastWeek - prevWeek)}km cette semaine) — bonne progression.` })
  else if (lastWeek < prevWeek * 0.7 && prevWeek > 0) insights.push({ type: 'warning', text: `Volume en baisse (${lastWeek}km vs ${prevWeek}km). Fatigue ou imprévu ?` })
  if (stats.currentStreak >= 3) insights.push({ type: 'positive', text: `${stats.currentStreak} semaines régulières consécutives — la constance fait tout.` })
  if (stats.efPaceSecPerKm) insights.push({ type: 'info', text: `Allure EF réelle Strava: ${secToMMSS(stats.efPaceSecPerKm)}/km. Reste dans cette fourchette sur les footings faciles.` })
  if (daysLeft && daysLeft < 21 && activeGoal) insights.push({ type: 'warning', text: `J-${daysLeft} avant ${activeGoal.name} — affûtage, réduis le volume progressivement.` })
  return insights.slice(0, 3)
}

export async function adaptWeek(currentWeek, completedSessions, missedSessions, fatigue, goal, stravaStats) {
  const system = `Tu es coach running. Tu adaptes le programme selon la réalité. JSON uniquement.`
  const user = `Semaine ${currentWeek?.week_number}: ${completedSessions.length} faites, manquées: ${missedSessions.map(s=>s.title).join(', ')||'aucune'}
Fatigue: ${fatigue}/5 | ${buildPaceContext(stravaStats)}
JSON: {"adaptation_needed":true,"reason":"string","adjustments":[{"session_title":"string","original_distance_km":10,"new_distance_km":8,"change_reason":"string"}],"coach_message":"string","weekly_volume_pct":-10}`
  const text = await geminiRequest(system, user, true)
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

export async function chatWithCoach(messages, ctx) {
  const efStr = ctx.efPaceSec ? secToMMSS(ctx.efPaceSec) + '/km' : 'non définie'
  const system = `Tu es TrailForge Coach, expert running et trail francophone.
Athlète: objectif="${ctx.goalName||'?'}", niveau="${ctx.level||'?'}", ${ctx.weeklyKm||0}km/sem, J-${ctx.daysUntilRace||'?'}${ctx.targetTime?', objectif: '+ctx.targetTime:''}.
Allure EF réelle: ${efStr}. FC max: ${ctx.maxHR||'?'}bpm. Ce mois: ${ctx.monthKm||0}km, ${ctx.monthElevation||0}m D+.
Réponds en français. Direct, motivant, précis. Allures en MM:SS/km uniquement. Max 4 paragraphes courts.`
  return geminiChat(messages, system)
}
