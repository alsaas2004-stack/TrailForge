import { useState } from 'react'
import { useGoals } from '../hooks/useGoals'
import { useStrava } from '../hooks/useStrava'
import { analyzeSession, generateTrainingPlan } from '../lib/grok'
import { secToMMSS, fmtDuration, speedToSecPerKm } from '../lib/strava'

function sessionStyle(type) {
  const t = (type || '').toLowerCase()
  if (t.includes('endurance') || t.includes('footing') || t.includes('ef') || t.includes('récup')) return { chip: 'chip-ef', color: 'var(--ef-color)', bg: 'var(--ef-bg)' }
  if (t.includes('fractionné') || t.includes('vma') || t.includes('interval')) return { chip: 'chip-frac', color: 'var(--frac-color)', bg: 'var(--frac-bg)' }
  if (t.includes('longue') || t.includes('long')) return { chip: 'chip-long', color: 'var(--long-color)', bg: 'var(--long-bg)' }
  if (t.includes('seuil') || t.includes('tempo')) return { chip: 'chip-seuil', color: 'var(--seuil-color)', bg: 'var(--seuil-bg)' }
  if (t.includes('côte') || t.includes('cote') || t.includes('montée')) return { chip: 'chip-cotes', color: 'var(--cotes-color)', bg: 'var(--cotes-bg)' }
  return { chip: 'chip-repos', color: 'var(--repos-color)', bg: 'var(--repos-bg)' }
}
const formatDuration = fmtDuration
import {
  ChevronLeft, ChevronRight, CheckCircle, X, Link, Loader,
  Zap, RefreshCw, Calendar, Mountain, Clock, TrendingUp,
  AlertCircle, ChevronDown, ChevronUp, Star
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function QualityStars({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[1,2,3,4,5].map(i => (
        <button key={i} onClick={() => onChange(i)} style={{ background:'none', border:'none', cursor:'pointer', padding:1 }}>
          <Star size={14} fill={i<=(value||0)?'#ff5500':'none'} color={i<=(value||0)?'#ff5500':'var(--text3)'} />
        </button>
      ))}
    </div>
  )
}

function StravaModal({ session, activities, onAssociate, onClose }) {
  const [selected, setSelected] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)

  const runs = (activities||[]).filter(a => ['Run','TrailRun'].includes(a.type)||['Run','TrailRun'].includes(a.sport_type)).slice(0,15)

  const handle = async () => {
    if (!selected) return
    setAnalyzing(true)
    try { const analysis = await analyzeSession(session, selected); onAssociate(selected, analysis) }
    catch { onAssociate(selected, null) }
    finally { setAnalyzing(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:20 }}>
      <div className="card fade-in" style={{ width:'100%', maxWidth:480, maxHeight:'80vh', overflowY:'auto', boxShadow:'var(--shadow-lg)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <h3 style={{ fontWeight:700, fontSize:16 }}>Associer une activité Strava</h3>
            <p style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>Séance: <strong>{session.title}</strong></p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', padding:4 }}><X size={18}/></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
          {runs.length === 0 && <p style={{ color:'var(--text2)', fontSize:13, textAlign:'center', padding:24 }}>Aucune activité Strava disponible</p>}
          {runs.map(run => {
            const paceSec = run.average_speed > 0 ? 1000/run.average_speed : null
            const paceStr = paceSec ? `${Math.floor(paceSec/60)}'${String(Math.round(paceSec%60)).padStart(2,'0')}"` : '--'
            return (
              <div key={run.id} onClick={() => setSelected(selected?.id===run.id?null:run)}
                style={{ padding:'11px 14px', borderRadius:10, cursor:'pointer', transition:'all 0.15s',
                  border:`2px solid ${selected?.id===run.id?'var(--accent)':'var(--border)'}`,
                  background:selected?.id===run.id?'var(--accent-light)':'var(--bg3)' }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <p style={{ fontWeight:600, fontSize:13 }}>{run.name}</p>
                  <span style={{ fontSize:11, color:'var(--text3)' }}>{format(parseISO(run.start_date),'dd/MM/yy',{locale:fr})}</span>
                </div>
                <div style={{ display:'flex', gap:12, marginTop:5 }}>
                  <span style={{ fontSize:12, fontWeight:700 }}>{(run.distance/1000).toFixed(1)}km</span>
                  <span style={{ fontSize:12, color:'var(--text2)' }}>{formatDuration(run.moving_time)}</span>
                  <span style={{ fontSize:12, color:'var(--accent2)' }}>{paceStr}/km</span>
                  {run.total_elevation_gain>0 && <span style={{ fontSize:12, color:'var(--text2)' }}>↑{Math.round(run.total_elevation_gain)}m</span>}
                </div>
              </div>
            )
          })}
        </div>
        <button onClick={handle} disabled={!selected||analyzing} className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:11 }}>
          {analyzing ? <><Loader size={14} style={{ animation:'spin 0.8s linear infinite' }}/> Analyse en cours…</> : <><Link size={14}/> Associer + analyser</>}
        </button>
      </div>
    </div>
  )
}

function SessionAnalysis({ analysis }) {
  if (!analysis) return null
  return (
    <div style={{ marginTop:12, padding:'12px 14px', background:'var(--bg3)', borderRadius:10, border:'1px solid var(--border)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:12, fontWeight:700 }}>Analyse</span>
          {analysis.verdict && (
            <span style={{ fontSize:10, fontWeight:800, padding:'3px 9px', borderRadius:100, background:`${analysis.verdict_color||'var(--accent)'}20`, color:analysis.verdict_color||'var(--accent)', border:`1px solid ${analysis.verdict_color||'var(--accent)'}40` }}>
              {analysis.verdict}
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:['','#e53e3e','#ff5500','#d97706','#0066ff','#00b894'][analysis.quality_score]||'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:12 }}>
            {analysis.quality_score}
          </div>
          <span style={{ fontSize:11, color:'var(--text2)' }}>{analysis.quality_label}</span>
        </div>
      </div>
      <div style={{ marginBottom:8 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text2)', marginBottom:3 }}>
          <span>Conformité</span><span style={{ fontWeight:700 }}>{analysis.compliance_pct}%</span>
        </div>
        <div className="progress-bar"><div className="progress-fill" style={{ width:`${analysis.compliance_pct}%`, background:analysis.compliance_pct>80?'var(--ef)':analysis.compliance_pct>60?'var(--long)':'var(--accent)' }}/></div>
      </div>
      {analysis.pace_analysis && <p style={{ fontSize:11, color:'var(--text2)', padding:'5px 8px', background:'var(--bg2)', borderRadius:6, marginBottom:6 }}>🏃 {analysis.pace_analysis}</p>}
      {analysis.heart_rate_analysis && <p style={{ fontSize:11, color:'var(--text2)', padding:'5px 8px', background:'var(--bg2)', borderRadius:6, marginBottom:6 }}>♥ {analysis.heart_rate_analysis}</p>}
      {analysis.positives?.map((p,i) => <p key={i} style={{ fontSize:11, color:'var(--ef)', marginBottom:3 }}>✓ {p}</p>)}
      {analysis.improvements?.map((p,i) => <p key={i} style={{ fontSize:11, color:'var(--frac)', marginBottom:3 }}>→ {p}</p>)}
      {analysis.coach_comment && (
        <div style={{ padding:'8px 10px', background:'var(--accent-light)', borderRadius:8, borderLeft:'3px solid var(--accent)', marginTop:8 }}>
          <p style={{ fontSize:11, color:'var(--text)', lineHeight:1.5 }}>💬 {analysis.coach_comment}</p>
        </div>
      )}
      {analysis.next_session_adjustment && <p style={{ fontSize:11, color:'var(--long)', fontWeight:600, marginTop:6 }}>📌 {analysis.next_session_adjustment}</p>}
    </div>
  )
}

function SessionDetail({ session, weekIdx, sessionIdx, plan, onUpdate, activities, onClose }) {
  const [showAssoc, setShowAssoc] = useState(false)
  const style = sessionStyle(session.type)

  const handleAssociate = async (activity, analysis) => {
    await onUpdate(plan.id, weekIdx, sessionIdx, {
      completed: true,
      strava_activity: { id: activity.id, name: activity.name, distance: activity.distance, moving_time: activity.moving_time, average_heartrate: activity.average_heartrate, total_elevation_gain: activity.total_elevation_gain, average_speed: activity.average_speed },
      analysis, quality: analysis?.quality_score || null
    })
    setShowAssoc(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:200, padding:'0' }}>
      <div className="fade-in" style={{ background:'var(--bg2)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:640, maxHeight:'90vh', overflowY:'auto', padding:'24px', boxShadow:'var(--shadow-lg)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <span className={`session-badge badge-${style.badge?.replace('badge-','')}`}>{style.label?.toUpperCase()}</span>
            <h2 style={{ fontSize:22, fontWeight:800, marginTop:8, color:'var(--text)' }}>{session.title}</h2>
            <div style={{ display:'flex', gap:14, marginTop:8, flexWrap:'wrap' }}>
              {session.duration_min>0 && <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, color:'var(--text2)' }}><Clock size={13}/> {session.duration_min}min</span>}
              {session.distance_km>0 && <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, color:'var(--text2)' }}><TrendingUp size={13}/> {session.distance_km}km</span>}
              {session.elevation_m>0 && <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, color:'var(--text2)' }}><Mountain size={13}/> +{session.elevation_m}m</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', padding:6 }}><X size={20}/></button>
        </div>

        {/* Allure + Zone */}
        {(session.target_pace || session.heart_rate_zone) && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:18 }}>
            {session.heart_rate_zone && <div style={{ background:'var(--bg3)', borderRadius:12, padding:'12px 14px' }}>
              <p style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.08, marginBottom:4 }}>Zone cible</p>
              <p style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{session.heart_rate_zone}</p>
            </div>}
            {session.target_pace && <div style={{ background:style.light, borderRadius:12, padding:'12px 14px', border:`1px solid ${style.color}30` }}>
              <p style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.08, marginBottom:4 }}>Allure cible</p>
              <p style={{ fontSize:14, fontWeight:700, color:style.color }}>{session.target_pace}</p>
            </div>}
          </div>
        )}

        {/* Corps séance */}
        {session.warmup && <div style={{ marginBottom:14 }}>
          <p style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.06, marginBottom:6 }}>Échauffement</p>
          <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.6 }}>{session.warmup}</p>
        </div>}
        {session.main_set && <div style={{ marginBottom:14 }}>
          <p style={{ fontSize:11, fontWeight:700, color:style.color, textTransform:'uppercase', letterSpacing:0.06, marginBottom:6 }}>Corps de séance</p>
          <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, background:'var(--bg3)', padding:'12px 14px', borderRadius:10, borderLeft:`3px solid ${style.color}` }}>{session.main_set}</p>
        </div>}
        {session.cooldown && <div style={{ marginBottom:14 }}>
          <p style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.06, marginBottom:6 }}>Retour au calme</p>
          <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.6 }}>{session.cooldown}</p>
        </div>}
        {session.tips && <div style={{ padding:'10px 12px', background:'#fffbeb', borderRadius:10, border:'1px solid #fde68a', marginBottom:14 }}>
          <p style={{ fontSize:12, color:'#d97706', lineHeight:1.5 }}>💡 {session.tips}</p>
        </div>}
        {session.nutrition_tip && <div style={{ padding:'10px 12px', background:'var(--ef-light)', borderRadius:10, marginBottom:14 }}>
          <p style={{ fontSize:12, color:'var(--ef)' }}>🍌 {session.nutrition_tip}</p>
        </div>}

        {/* Strava associé */}
        {session.strava_activity && (
          <div style={{ padding:'8px 12px', background:'#fff5f0', border:'1px solid #ffd0b0', borderRadius:8, marginBottom:14, display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:16 }}>🟠</span>
            <span style={{ fontSize:12, fontWeight:600, color:'#FC4C02' }}>{session.strava_activity.name}</span>
            <span style={{ fontSize:11, color:'var(--text2)' }}>{(session.strava_activity.distance/1000).toFixed(1)}km</span>
          </div>
        )}

        {/* Analyse */}
        {session.analysis && <SessionAnalysis analysis={session.analysis} />}

        {/* Qualité */}
        {session.completed && (
          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:14 }}>
            <span style={{ fontSize:12, color:'var(--text2)' }}>Qualité :</span>
            <QualityStars value={session.quality} onChange={q => onUpdate(plan.id, weekIdx, sessionIdx, { quality:q, completed:true })} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display:'flex', gap:10, marginTop:18 }}>
          {!session.completed && (
            <button onClick={() => onUpdate(plan.id, weekIdx, sessionIdx, { completed:true })} className="btn btn-green" style={{ flex:1, justifyContent:'center' }}>
              <CheckCircle size={14}/> Marquer comme faite
            </button>
          )}
          <button onClick={() => setShowAssoc(true)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>
            <Link size={14}/> Lier Strava
          </button>
        </div>
      </div>

      {showAssoc && <StravaModal session={session} activities={activities} onAssociate={handleAssociate} onClose={() => setShowAssoc(false)} />}
    </div>
  )
}

export default function Programme() {
  const { goals, loading, updateSession, savePlan } = useGoals()
  const { stravaData } = useStrava()
  const [selectedGoalId, setSelectedGoalId] = useState(null)
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0)
  const [viewMode, setViewMode] = useState('semaine') // 'semaine' | 'mois' | 'complet'
  const [selectedSession, setSelectedSession] = useState(null) // { session, weekIdx, sessionIdx }
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState('')

  const goal = goals.find(g => g.id === selectedGoalId) || goals.find(g => new Date(g.race_date) >= new Date()) || goals[0]
  const plan = goal?.training_plans?.[0]
  const planData = plan?.plan_data
  const weeks = planData?.weeks || []

  const daysUntilRace = goal ? Math.ceil((new Date(goal.race_date) - new Date()) / 86400000) : 0
  const weeksUntilRace = Math.ceil(daysUntilRace / 7)
  const currentWeekIdx = planData ? Math.max(0, (planData.total_weeks || 0) - weeksUntilRace) : 0

  // Semaines visibles
  let visibleWeeks = []
  if (viewMode === 'semaine') visibleWeeks = weeks.slice(currentWeekIdx + currentWeekOffset, currentWeekIdx + currentWeekOffset + 1)
  else if (viewMode === 'mois') visibleWeeks = weeks.slice(currentWeekIdx + currentWeekOffset, currentWeekIdx + currentWeekOffset + 4)
  else visibleWeeks = weeks

  const handleRegenerate = async () => {
    if (!goal) return
    setRegenerating(true); setRegenError('')
    try {
      const newPlan = await generateTrainingPlan({ race_type:goal.race_type, distance_km:goal.distance_km, elevation_gain:goal.elevation_gain, race_date:goal.race_date, level:goal.level, sessions_per_week:goal.sessions_per_week, preferred_days:goal.preferred_days, current_weekly_km:goal.current_weekly_km, target_time:goal.target_time })
      await savePlan(goal.id, newPlan)
    } catch (e) { setRegenError(e.message) }
    finally { setRegenerating(false) }
  }

  if (loading) return <div style={{ display:'flex', flexDirection:'column', gap:14 }}>{[1,2].map(i=><div key={i} className="skeleton" style={{ height:200 }}/>)}</div>

  if (!goal) return (
    <div className="fade-in card" style={{ textAlign:'center', padding:48 }}>
      <Calendar size={40} style={{ color:'var(--text3)', margin:'0 auto 14px' }}/>
      <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Aucun objectif</h2>
      <p style={{ color:'var(--text2)', marginBottom:20, fontSize:13 }}>Va dans Profil pour créer ton premier objectif.</p>
    </div>
  )

  if (!planData) return (
    <div className="fade-in card" style={{ textAlign:'center', padding:48 }}>
      <Zap size={36} style={{ color:'var(--accent)', margin:'0 auto 14px' }}/>
      <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Génère ton programme</h2>
      <p style={{ color:'var(--text2)', marginBottom:20, fontSize:13 }}>L'IA crée ton plan personnalisé en ~30 secondes.</p>
      {regenError && <div style={{ background:'#fff0f0', border:'1px solid #ffd0d0', borderRadius:10, padding:'10px 14px', marginBottom:16, color:'#e53e3e', fontSize:12 }}>{regenError}</div>}
      <button onClick={handleRegenerate} className="btn btn-primary" disabled={regenerating} style={{ justifyContent:'center' }}>
        {regenerating ? <><Loader size={15} style={{ animation:'spin 0.8s linear infinite' }}/> Génération…</> : <><Zap size={15}/> Générer mon programme</>}
      </button>
    </div>
  )

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:32, letterSpacing:1, color:'var(--text)' }}>{planData.plan_name}</h1>
          <p style={{ color:'var(--text2)', fontSize:13, marginTop:3 }}>
            {goal.name} · {goal.distance_km}km · J-{daysUntilRace}
            {goal.target_time && <span style={{ color:'var(--accent)', fontWeight:700 }}> · {goal.target_time}</span>}
          </p>
          {planData.ef_pace_range && (
            <p style={{ fontSize:12, color:'var(--ef)', marginTop:3, fontWeight:600 }}>
              🏃 Allure EF recommandée : {planData.ef_pace_range}
            </p>
          )}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {goals.length > 1 && (
            <select className="select" style={{ width:'auto', fontSize:13 }} value={goal.id} onChange={e => setSelectedGoalId(e.target.value)}>
              {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <button onClick={handleRegenerate} className="btn btn-secondary" disabled={regenerating} style={{ fontSize:13 }}>
            <RefreshCw size={13} style={{ animation:regenerating?'spin 0.8s linear infinite':'none' }}/>
            {regenerating?'Génération…':'Régénérer'}
          </button>
        </div>
      </div>

      {regenError && <div style={{ background:'#fff0f0', border:'1px solid #ffd0d0', borderRadius:10, padding:'10px 14px', marginBottom:14, color:'#e53e3e', fontSize:12, display:'flex', gap:8, alignItems:'center' }}><AlertCircle size={13}/> {regenError}</div>}

      {/* Sélecteur vue */}
      <div style={{ display:'flex', gap:6, marginBottom:18 }}>
        {['semaine','mois','complet'].map(mode => (
          <button key={mode} onClick={() => { setViewMode(mode); setCurrentWeekOffset(0) }}
            style={{ padding:'7px 16px', borderRadius:100, border:`1.5px solid ${viewMode===mode?'var(--accent)':'var(--border)'}`, background:viewMode===mode?'var(--accent-light)':'var(--bg2)', color:viewMode===mode?'var(--accent)':'var(--text2)', fontFamily:'var(--font-body)', fontWeight:600, fontSize:13, cursor:'pointer', transition:'all 0.15s', textTransform:'capitalize' }}>
            {mode}
          </button>
        ))}
      </div>

      {/* Phases */}
      {planData.phases && (
        <div style={{ display:'flex', gap:6, marginBottom:16, overflowX:'auto', paddingBottom:4 }}>
          {planData.phases.map((phase, i) => (
            <div key={i} style={{ padding:'5px 12px', borderRadius:100, whiteSpace:'nowrap', background:'var(--bg2)', border:'1px solid var(--border)', fontSize:11 }}>
              <span style={{ color:phase.color||'var(--accent)', fontWeight:700 }}>{phase.name}</span>
              <span style={{ color:'var(--text3)', marginLeft:5 }}>S{phase.weeks?.[0]}–{phase.weeks?.[phase.weeks.length-1]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Navigation semaine */}
      {viewMode !== 'complet' && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <button onClick={() => setCurrentWeekOffset(o => Math.max(-(currentWeekIdx), o-1))} disabled={currentWeekIdx+currentWeekOffset<=0} className="btn btn-ghost" style={{ fontSize:13 }}>
            <ChevronLeft size={15}/> Préc.
          </button>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--text2)' }}>
            Semaine {currentWeekIdx+currentWeekOffset+1}
            {viewMode==='mois' && `–${Math.min(currentWeekIdx+currentWeekOffset+4,weeks.length)}`}
            {' '}/ {weeks.length}
            {currentWeekOffset!==0 && <button onClick={() => setCurrentWeekOffset(0)} style={{ marginLeft:10, fontSize:12, color:'var(--accent)', background:'none', border:'none', cursor:'pointer' }}>Semaine en cours</button>}
          </span>
          <button onClick={() => setCurrentWeekOffset(o => Math.min(weeks.length-currentWeekIdx-1, o+1))} disabled={currentWeekIdx+currentWeekOffset>=weeks.length-1} className="btn btn-ghost" style={{ fontSize:13 }}>
            Suiv. <ChevronRight size={15}/>
          </button>
        </div>
      )}

      {/* Semaines */}
      <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
        {visibleWeeks.map((week, relIdx) => {
          const weekIdx = viewMode==='complet' ? relIdx : currentWeekIdx+currentWeekOffset+(viewMode==='mois'?relIdx:0)
          const isCurrentWeek = weekIdx === currentWeekIdx
          const completedCount = week.sessions?.filter(s=>s.completed&&s.type!=='Repos').length||0
          const totalCount = week.sessions?.filter(s=>s.type!=='Repos').length||0
          const today = new Date()
          const todayDow = (today.getDay()+6)%7

          return (
            <div key={week.week_number} style={{ background:'var(--bg2)', border:`2px solid ${isCurrentWeek?'var(--accent)':'var(--border)'}`, borderRadius:20, overflow:'hidden', boxShadow:isCurrentWeek?'0 0 0 4px rgba(255,85,0,0.07)':'var(--shadow-sm)' }}>
              {/* Week header */}
              <div style={{ padding:'16px 20px', background:isCurrentWeek?'var(--accent-light)':'var(--bg3)', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:3 }}>
                      <h3 style={{ fontFamily:'var(--font-display)', fontSize:22, letterSpacing:0.5, color:isCurrentWeek?'var(--accent)':'var(--text)' }}>SEMAINE {week.week_number}</h3>
                      {isCurrentWeek && <span style={{ fontSize:9, fontWeight:800, padding:'3px 8px', borderRadius:100, background:'var(--accent)', color:'#fff', letterSpacing:0.08 }}>EN COURS</span>}
                      <span style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>{week.phase}</span>
                    </div>
                    <p style={{ fontSize:13, color:'var(--text2)' }}>{week.focus}</p>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <p style={{ fontSize:18, fontWeight:800 }}>{week.total_km} km</p>
                    {week.total_elevation>0 && <p style={{ fontSize:11, color:'var(--text3)' }}>↑{week.total_elevation}m</p>}
                    {totalCount>0 && <p style={{ fontSize:11, color:completedCount===totalCount?'var(--ef)':'var(--text3)', fontWeight:700 }}>{completedCount}/{totalCount} ✓</p>}
                  </div>
                </div>
                {totalCount>0 && (
                  <div className="progress-bar" style={{ marginTop:10 }}>
                    <div className="progress-fill" style={{ width:`${(completedCount/totalCount)*100}%`, background:completedCount===totalCount?'var(--ef)':'var(--accent)' }}/>
                  </div>
                )}
                {week.coach_tip && <p style={{ fontSize:12, color:'var(--text2)', marginTop:10, padding:'7px 10px', background:'var(--bg2)', borderRadius:8, border:'1px solid var(--border)' }}>💬 {week.coach_tip}</p>}
              </div>

              {/* Vue 7 jours */}
              <div style={{ padding:'16px 20px', display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8 }}>
                {DAYS.map((dayLabel, dayIdx) => {
                  const daySessions = (week.sessions||[]).filter(s => s.day_of_week===dayIdx&&s.type!=='Repos')
                  const isToday = isCurrentWeek && dayIdx===todayDow
                  const isRest = daySessions.length===0

                  return (
                    <div key={dayIdx}
                      onClick={() => {
                        if (daySessions.length>0) {
                          setSelectedSession({ session:daySessions[0], weekIdx, sessionIdx:(week.sessions||[]).indexOf(daySessions[0]) })
                        }
                      }}
                      style={{ minHeight:90, borderRadius:12, background:isToday?'var(--accent-light)':isRest?'var(--bg3)':'var(--bg2)', border:`1.5px solid ${isToday?'var(--accent)':daySessions.length>0?sessionStyle(daySessions[0]?.type).color+'30':'var(--border)'}`, padding:8, transition:'all 0.15s', cursor:daySessions.length>0?'pointer':'default', position:'relative' }}>
                      <p style={{ fontSize:10, fontWeight:700, color:isToday?'var(--accent)':'var(--text3)', marginBottom:6, textAlign:'center', textTransform:'uppercase' }}>{dayLabel}</p>
                      {daySessions.length>0 ? daySessions.map((s,i) => {
                        const st = sessionStyle(s.type)
                        return (
                          <div key={i} style={{ background:st.light, border:`1px solid ${st.color}30`, borderRadius:8, padding:'5px 6px', marginBottom:4 }}>
                            <p style={{ fontSize:9, fontWeight:800, color:st.color, textTransform:'uppercase', letterSpacing:0.05, marginBottom:2 }}>{st.label}</p>
                            <p style={{ fontSize:9, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.title}</p>
                            <p style={{ fontSize:9, color:'var(--text3)', marginTop:2 }}>{s.distance_km>0?`${s.distance_km}km`:`${s.duration_min}min`}</p>
                            {s.completed && <div style={{ position:'absolute', top:6, right:6, width:14, height:14, borderRadius:'50%', background:'var(--ef)', display:'flex', alignItems:'center', justifyContent:'center' }}><CheckCircle size={9} color="#fff"/></div>}
                          </div>
                        )
                      }) : (
                        <p style={{ textAlign:'center', color:'var(--text3)', fontSize:18, marginTop:8 }}>—</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Race day plan */}
      {planData.race_day_plan && viewMode==='complet' && (
        <div className="card" style={{ marginTop:24, borderLeft:'4px solid var(--accent)' }}>
          <h3 style={{ fontSize:13, fontWeight:700, color:'var(--accent)', textTransform:'uppercase', letterSpacing:0.08, marginBottom:8 }}>🏁 Plan de course — Jour J</h3>
          <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.6 }}>{planData.race_day_plan}</p>
        </div>
      )}

      {/* Modal détail séance */}
      {selectedSession && (
        <SessionDetail
          session={selectedSession.session}
          weekIdx={selectedSession.weekIdx}
          sessionIdx={selectedSession.sessionIdx}
          plan={plan}
          onUpdate={updateSession}
          activities={stravaData?.activities}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  )
}
