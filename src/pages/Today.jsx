import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoals } from '../hooks/useGoals'
import { useStrava } from '../hooks/useStrava'
import { getTodayInsight } from '../lib/grok'
import { fmtDuration } from '../lib/strava'
import { Sun, Zap, CheckCircle, Coffee, ChevronRight, TrendingUp, Mountain, Activity, Loader } from 'lucide-react'

function getSessionStyle(type) {
  const t = (type || '').toLowerCase()
  if (t.includes('endurance') || t.includes('footing') || t.includes('ef') || t.includes('récup')) return { chip: 'chip-ef', color: 'var(--ef-color)', emoji: '🟢' }
  if (t.includes('fractionné') || t.includes('vma') || t.includes('interval')) return { chip: 'chip-frac', color: 'var(--frac-color)', emoji: '🟠' }
  if (t.includes('longue') || t.includes('long')) return { chip: 'chip-long', color: 'var(--long-color)', emoji: '🔵' }
  if (t.includes('seuil') || t.includes('tempo')) return { chip: 'chip-seuil', color: 'var(--seuil-color)', emoji: '🟣' }
  if (t.includes('côte') || t.includes('cote') || t.includes('montée')) return { chip: 'chip-cotes', color: 'var(--cotes-color)', emoji: '🟡' }
  return { chip: 'chip-ef', color: 'var(--ef-color)', emoji: '🟢' }
}

export default function Today() {
  const navigate = useNavigate()
  const { goals, updateSession } = useGoals()
  const { stats, stravaData, connected } = useStrava()
  const [fatigue, setFatigue] = useState(3)
  const [insight, setInsight] = useState(null)
  const [loadingInsight, setLoadingInsight] = useState(false)

  const activeGoal = goals.find(g => new Date(g.race_date) >= new Date())
  const plan = activeGoal?.training_plans?.[0]
  const planData = plan?.plan_data
  const today = new Date()
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1

  let todaySession = null, currentWeekIdx = 0, todaySessionIdx = 0
  if (planData && activeGoal) {
    const daysUntilRace = Math.ceil((new Date(activeGoal.race_date) - today) / 86400000)
    currentWeekIdx = Math.max(0, (planData.total_weeks || 0) - Math.ceil(daysUntilRace / 7))
    const week = planData.weeks?.[currentWeekIdx]
    if (week?.sessions) {
      const idx = week.sessions.findIndex(s => s.day_of_week === dayOfWeek)
      if (idx >= 0) { todaySession = week.sessions[idx]; todaySessionIdx = idx }
    }
  }

  const currentWeekData = planData?.weeks?.[currentWeekIdx]
  const weekSessions = currentWeekData?.sessions?.filter(s => s.type !== 'Repos') || []
  const weekCompleted = weekSessions.filter(s => s.completed).length
  const daysLeft = activeGoal ? Math.ceil((new Date(activeGoal.race_date) - today) / 86400000) : null
  const sessionStyle = todaySession ? getSessionStyle(todaySession.type) : null

  useEffect(() => {
    if (!todaySession || !activeGoal) return
    setLoadingInsight(true)
    getTodayInsight(todaySession, stravaData?.activities?.slice(0, 5) || [], { completed: weekCompleted, total: weekSessions.length }, activeGoal)
      .then(r => { setInsight(r); setLoadingInsight(false) })
      .catch(() => setLoadingInsight(false))
  }, [activeGoal?.id, currentWeekIdx]) // eslint-disable-line

  const handleComplete = async () => {
    if (!plan || !todaySession) return
    await updateSession(plan.id, currentWeekIdx, todaySessionIdx, { completed: !todaySession.completed })
  }

  if (!activeGoal || !planData) return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>{today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: 1 }}>BONJOUR {stravaData?.athlete?.firstname?.toUpperCase() || '!'} 👋</h1>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: '52px 24px', border: '2px dashed var(--border)' }}>
        <Zap size={44} style={{ color: 'var(--accent)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Crée ton objectif</h2>
        <p style={{ color: 'var(--text2)', marginBottom: 28, fontSize: 14, lineHeight: 1.7, maxWidth: 320, margin: '0 auto 28px' }}>Définis ta prochaine course et l'IA génère ton programme personnalisé.</p>
        <button onClick={() => navigate('/profil')} className="btn btn-primary" style={{ padding: '12px 28px' }}><Zap size={16} /> Commencer</button>
      </div>
    </div>
  )

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 22 }}>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>{today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: 1, lineHeight: 1 }}>BONJOUR {stravaData?.athlete?.firstname?.toUpperCase() || ''} 👋</h1>
        <p style={{ color: 'var(--text2)', marginTop: 6, fontSize: 14 }}>
          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{activeGoal.name}</span>
          {' · '}{activeGoal.distance_km}km{activeGoal.elevation_gain > 0 ? ` / ${activeGoal.elevation_gain}m D+` : ''}
          {' · '}<span style={{ fontWeight: 700 }}>J-{daysLeft}</span>
        </p>
      </div>

      {/* Carte principale séance du jour */}
      {todaySession ? (
        <div className="today-session-card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.1 }}>Séance du jour</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: `${sessionStyle.color}30`, color: sessionStyle.color, border: `1px solid ${sessionStyle.color}50` }}>{todaySession.type}</span>
              </div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.1, marginBottom: 6 }}>{todaySession.title}</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{todaySession.description || todaySession.main_set?.slice(0, 100)}</p>
            </div>
            {todaySession.completed && <CheckCircle size={32} color="#00b894" fill="#00b894" style={{ flexShrink: 0 }} />}
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
            {todaySession.duration_min > 0 && <div><p style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{todaySession.duration_min}<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 2 }}>min</span></p><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Durée</p></div>}
            {todaySession.distance_km > 0 && <div><p style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{todaySession.distance_km}<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 2 }}>km</span></p><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Distance</p></div>}
            {todaySession.target_pace && <div><p style={{ fontSize: 20, fontWeight: 800, color: sessionStyle.color }}>{todaySession.target_pace}</p><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Allure cible</p></div>}
            {todaySession.heart_rate_zone && <div><p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>{todaySession.heart_rate_zone.split('—')[0].trim()}</p><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Zone FC</p></div>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleComplete} style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, background: todaySession.completed ? '#00b894' : '#fff', color: todaySession.completed ? '#fff' : '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}>
              {todaySession.completed ? <><CheckCircle size={15} /> Séance validée</> : <><Zap size={15} /> Marquer comme faite</>}
            </button>
            <button onClick={() => navigate('/programme')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              Détails <ChevronRight size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: 32, marginBottom: 14 }}>
          <Coffee size={32} style={{ color: 'var(--text3)', margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Repos aujourd'hui 🛋️</h3>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>La récupération est aussi importante que l'entraînement.</p>
        </div>
      )}

      {/* 2 petites cartes */}
      <div className="grid-2" style={{ marginBottom: 14 }}>
        {/* Fatigue */}
        <div className="card">
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.1, marginBottom: 10 }}>Comment tu te sens ?</p>
          <div style={{ display: 'flex', gap: 5 }}>
            {[['😴','Épuisé'],['😓','Fatigué'],['😐','Normal'],['😊','Frais'],['🔥','Top']].map(([e, l], i) => (
              <button key={i} onClick={() => setFatigue(i + 1)} style={{ flex: 1, padding: '7px 2px', borderRadius: 8, border: `2px solid ${fatigue === i+1 ? 'var(--accent)' : 'var(--border)'}`, background: fatigue === i+1 ? 'var(--accent-light)' : 'var(--bg3)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700, color: fatigue === i+1 ? 'var(--accent)' : 'var(--text3)', textAlign: 'center', transition: 'all 0.15s' }}>
                {e}<br />{l}
              </button>
            ))}
          </div>
        </div>
        {/* Semaine */}
        <div className="card">
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.1, marginBottom: 10 }}>Semaine {currentWeekData?.week_number}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
            <div>
              <p style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{weekCompleted}<span style={{ fontSize: 15, color: 'var(--text3)' }}>/{weekSessions.length}</span></p>
              <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>séances faites</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{currentWeekData?.total_km} km</p>
              <p style={{ fontSize: 10, color: 'var(--text3)' }}>prévus</p>
            </div>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: weekSessions.length > 0 ? `${(weekCompleted/weekSessions.length)*100}%` : '0%', background: weekCompleted === weekSessions.length ? 'var(--ef-color)' : 'var(--accent)' }} /></div>
        </div>
      </div>

      {/* Insight intelligent */}
      <div className="card" style={{ borderLeft: '4px solid var(--accent2)', padding: '14px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent2-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {loadingInsight ? <Loader size={13} color="var(--accent2)" style={{ animation: 'spin 0.8s linear infinite' }} /> : <Zap size={13} color="var(--accent2)" />}
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent2)', marginBottom: 4 }}>Ajustement intelligent</p>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
              {insight ? insight.message : loadingInsight ? 'Analyse de tes dernières séances…' : currentWeekData?.coach_tip || 'Reste régulier, la constance est la clé du progrès.'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats mois si Strava connecté */}
      {connected && stats?.monthStats && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.1, marginBottom: 10 }}>Ce mois-ci</p>
          <div className="grid-3">
            {[
              { icon: Activity, label: 'Sorties', value: stats.monthStats.runs, unit: '' },
              { icon: TrendingUp, label: 'Distance', value: stats.monthStats.km, unit: 'km' },
              { icon: Mountain, label: 'Dénivelé', value: stats.monthStats.elevation, unit: 'm' },
            ].map(({ icon: Icon, label, value, unit }) => (
              <div key={label} className="card" style={{ padding: '14px', textAlign: 'center' }}>
                <Icon size={15} style={{ color: 'var(--accent)', margin: '0 auto 6px' }} />
                <p style={{ fontSize: 20, fontWeight: 800 }}>{value}<span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 2 }}>{unit}</span></p>
                <p style={{ fontSize: 10, color: 'var(--text3)' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
