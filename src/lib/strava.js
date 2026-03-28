const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID
const CLIENT_SECRET = import.meta.env.VITE_STRAVA_CLIENT_SECRET
const REDIRECT_URI = import.meta.env.VITE_STRAVA_REDIRECT_URI
const STRAVA_API = 'https://www.strava.com/api/v3'

export function getStravaAuthUrl() {
  const scope = 'read,activity:read_all'
  return `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&approval_prompt=force`
}

export async function exchangeToken(code) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: 'authorization_code' })
  })
  if (!res.ok) throw new Error('Erreur échange token Strava')
  return res.json()
}

export async function refreshToken(refresh_token) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token, grant_type: 'refresh_token' })
  })
  if (!res.ok) throw new Error('Erreur refresh token Strava')
  return res.json()
}

async function stravaFetch(endpoint, token) {
  const res = await fetch(`${STRAVA_API}${endpoint}`, { headers: { 'Authorization': `Bearer ${token}` } })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok) throw new Error(`Erreur Strava: ${res.status}`)
  return res.json()
}

export const getAthlete = (t) => stravaFetch('/athlete', t)
export const getActivities = (t, page = 1, perPage = 100) => stravaFetch(`/athlete/activities?page=${page}&per_page=${perPage}`, t)
export const getAthleteStats = (t, id) => stravaFetch(`/athletes/${id}/stats`, t)

// ── Conversions allure en BASE 60 (jamais de décimal) ──
// Input: secondes/km  Output: "6:30"
export function secToMMSS(secPerKm) {
  if (!secPerKm || secPerKm <= 0 || !isFinite(secPerKm)) return '--'
  const s = Math.round(secPerKm)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Input: m/s (Strava) → sec/km
export function speedToSecPerKm(mps) {
  if (!mps || mps <= 0) return null
  return 1000 / mps
}

export function fmtDuration(totalSec) {
  if (!totalSec) return '--'
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}

export function computeStats(activities) {
  const runs = activities.filter(a => ['Run', 'TrailRun'].includes(a.type) || ['Run', 'TrailRun'].includes(a.sport_type))
  const now = new Date()

  const totalDistance = runs.reduce((s, a) => s + a.distance, 0)
  const totalTime = runs.reduce((s, a) => s + a.moving_time, 0)
  const totalElevation = runs.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)
  const totalRuns = runs.length

  // Stats mois en cours
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthRuns = runs.filter(a => new Date(a.start_date) >= startOfMonth)
  const monthStats = {
    km: Math.round(monthRuns.reduce((s, a) => s + a.distance, 0) / 100) / 10,
    elevation: Math.round(monthRuns.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)),
    runs: monthRuns.length,
    time: monthRuns.reduce((s, a) => s + a.moving_time, 0),
  }

  // Volume hebdo moyen 4 semaines
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000)
  const avgWeeklyKm = runs.filter(a => new Date(a.start_date) > fourWeeksAgo).reduce((s, a) => s + a.distance, 0) / 4000

  // FC
  const hrRuns = runs.filter(a => a.average_heartrate > 0)
  const maxHR = hrRuns.length ? Math.round(Math.max(...hrRuns.map(a => a.max_heartrate || 0))) : null
  const avgHR = hrRuns.length ? Math.round(hrRuns.reduce((s, a) => s + a.average_heartrate, 0) / hrRuns.length) : null

  // Allure EF RÉELLE depuis Strava (zone 2 = FC < 75% FCmax)
  let efPaceSecPerKm = null
  if (maxHR) {
    const z2Max = maxHR * 0.75
    const efRuns = hrRuns.filter(a => a.average_heartrate < z2Max && a.distance > 3000 && a.average_speed > 0)
    if (efRuns.length > 0) {
      efPaceSecPerKm = efRuns.reduce((s, a) => s + speedToSecPerKm(a.average_speed), 0) / efRuns.length
    }
  }
  // Fallback: allure moyenne runs courts + 12% (EF = plus lent que moyenne)
  if (!efPaceSecPerKm) {
    const shortRuns = runs.filter(a => a.distance < 10000 && a.distance > 3000 && a.average_speed > 0).slice(0, 20)
    if (shortRuns.length > 0) {
      const avgPace = shortRuns.reduce((s, a) => s + speedToSecPerKm(a.average_speed), 0) / shortRuns.length
      efPaceSecPerKm = avgPace * 1.12
    }
  }

  // Meilleure allure (runs > 5km)
  const raceRuns = runs.filter(a => a.distance > 5000 && a.average_speed > 0).slice(0, 20)
  const bestPaceSecPerKm = raceRuns.length ? Math.min(...raceRuns.map(a => speedToSecPerKm(a.average_speed))) : null

  // VO2max
  let vo2max = null
  if (bestPaceSecPerKm) {
    const speedMperMin = 60000 / bestPaceSecPerKm
    vo2max = Math.round(-4.6 + 0.182258 * speedMperMin + 0.000104 * speedMperMin * speedMperMin)
    vo2max = Math.max(20, Math.min(90, vo2max))
  }

  // Charge 7 derniers jours
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
  const last7Runs = runs.filter(a => new Date(a.start_date) >= sevenDaysAgo)
  const charge7d = {
    km: Math.round(last7Runs.reduce((s, a) => s + a.distance, 0) / 100) / 10,
    elevation: Math.round(last7Runs.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)),
    runs: last7Runs.length,
    time: last7Runs.reduce((s, a) => s + a.moving_time, 0)
  }

  // Stats depuis debut annee
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const yearRuns = runs.filter(a => new Date(a.start_date) >= startOfYear)
  const yearStats = {
    km: Math.round(yearRuns.reduce((s, a) => s + a.distance, 0) / 100) / 10,
    elevation: Math.round(yearRuns.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)),
    runs: yearRuns.length,
    time: yearRuns.reduce((s, a) => s + a.moving_time, 0)
  }

  // Weekly trend 8 semaines avec dates claires
  const MOIS_FR = ['jan','fév','mars','avr','mai','juin','juil','août','sep','oct','nov','déc']
  const weeklyTrend = []
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - (i + 1) * 7 * 86400000)
    const weekEnd = new Date(now.getTime() - i * 7 * 86400000)
    const wr = runs.filter(a => { const d = new Date(a.start_date); return d >= weekStart && d < weekEnd })
    const label = weekStart.getDate() + ' ' + MOIS_FR[weekStart.getMonth()]
    const endLabel = weekEnd.getDate() + ' ' + MOIS_FR[weekEnd.getMonth()]
    weeklyTrend.push({
      week: label,
      weekFull: label + ' - ' + endLabel,
      km: Math.round(wr.reduce((s, a) => s + a.distance, 0) / 100) / 10,
      elevation: Math.round(wr.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)),
      runs: wr.length
    })
  }

  // Regularite
  let currentStreak = 0
  for (let i = weeklyTrend.length - 1; i >= 0; i--) {
    if (weeklyTrend[i].runs > 0) currentStreak++
    else break
  }
  const regularWeeks = weeklyTrend.filter(w => w.runs > 0).length

  return {
    totalDistance: totalDistance / 1000, totalTime, totalElevation, totalRuns,
    avgWeeklyKm, monthStats, yearStats, charge7d, weeklyTrend,
    bestPaceSecPerKm, efPaceSecPerKm, avgHR, maxHR, vo2max,
    currentStreak, regularWeeks,
    recentRuns: runs.slice(0, 15)
  }
}
