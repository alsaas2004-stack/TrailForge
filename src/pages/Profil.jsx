import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useGoals } from '../hooks/useGoals'
import { useStrava } from '../hooks/useStrava'
import { generateTrainingPlan } from '../lib/grok'
import { getStravaAuthUrl } from '../lib/strava'
import { Settings, Activity, Target, Plus, Trash2, Zap, ChevronRight, LogOut, Timer, Mountain, TrendingUp, Calendar, Loader, AlertCircle, CheckCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'

const DAYS_FR = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']

function GoalForm({ onSave, onCancel, stats }) {
  const [form, setForm] = useState({
    name:'', race_type:'trail', distance_km:20, elevation_gain:800,
    race_date:'', level:'intermédiaire',
    current_weekly_km: stats ? Math.round(stats.avgWeeklyKm) : 30,
    preferred_days:[1,3,5,6], target_time:''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const toggleDay = d => set('preferred_days', form.preferred_days.includes(d) ? form.preferred_days.filter(x=>x!==d) : [...form.preferred_days,d].sort())
  const sessions_per_week = form.preferred_days.length

  const weeksLeft = form.race_date ? Math.ceil((new Date(form.race_date)-new Date())/(7*86400000)) : 0

  const handleSubmit = async () => {
    if (!form.name||!form.race_date) { setError('Nom et date obligatoires'); return }
    if (new Date(form.race_date)<new Date()) { setError('Date dans le futur'); return }
    setSaving(true); setError('')
    try { await onSave({ ...form, sessions_per_week }) }
    catch(e) { setError(e.message); setSaving(false) }
  }

  return (
    <div className="card" style={{ padding:24, marginBottom:20 }}>
      <h3 style={{ fontWeight:700, fontSize:16, marginBottom:20 }}>🎯 Nouvel objectif</h3>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div><label className="label">Nom de la course</label>
          <input className="input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="ex: Trail des Vosges 34km"/></div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><label className="label">Type</label>
            <select className="select" value={form.race_type} onChange={e=>set('race_type',e.target.value)}>
              <option value="trail">Trail</option><option value="road">Route</option><option value="ultra">Ultra Trail</option>
            </select></div>
          <div><label className="label">Distance (km)</label>
            <input className="input" type="number" min="1" max="300" value={form.distance_km} onChange={e=>set('distance_km',+e.target.value)}/></div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><label className="label">Dénivelé (m D+)</label>
            <input className="input" type="number" min="0" max="15000" value={form.elevation_gain} onChange={e=>set('elevation_gain',+e.target.value)}/></div>
          <div><label className="label">Date de course</label>
            <input className="input" type="date" value={form.race_date} min={new Date().toISOString().split('T')[0]} onChange={e=>set('race_date',e.target.value)}/></div>
        </div>

        {weeksLeft>0 && <div style={{ background:'var(--accent-light)', border:'1px solid #ffd0b0', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--accent)', fontWeight:600 }}>
          📅 {weeksLeft} semaines disponibles
        </div>}

        <div><label className="label" style={{ display:'flex', alignItems:'center', gap:5 }}><Timer size={12}/> Objectif temps <span style={{ color:'var(--text3)', fontWeight:400 }}>(optionnel)</span></label>
          <input className="input" value={form.target_time} onChange={e=>set('target_time',e.target.value)} placeholder="ex: 3h45, 1h55, Finisher..."/>
          <p style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>L'IA adapte les allures cibles selon cet objectif.</p></div>

        <div><label className="label">Niveau</label>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {['débutant','intermédiaire','avancé'].map(l => (
              <button key={l} type="button" onClick={()=>set('level',l)} style={{ padding:'9px 6px', borderRadius:10, border:`2px solid ${form.level===l?'var(--accent)':'var(--border)'}`, background:form.level===l?'var(--accent-light)':'var(--bg3)', color:form.level===l?'var(--accent)':'var(--text2)', fontFamily:'var(--font-body)', fontWeight:600, fontSize:12, cursor:'pointer', transition:'all 0.15s', textTransform:'capitalize' }}>
                {l}
              </button>
            ))}</div></div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><label className="label">Volume actuel (km/sem)</label>
            <input className="input" type="number" min="0" max="200" value={form.current_weekly_km} onChange={e=>set('current_weekly_km',+e.target.value)}/>
            {stats && <p style={{ fontSize:11, color:'var(--ef-color)', marginTop:3 }}>Strava: ~{Math.round(stats.avgWeeklyKm)} km/sem</p>}</div>
          <div><label className="label">Séances / semaine</label>
            <div style={{ display:'flex', alignItems:'center', height:42, padding:'0 14px', background:'var(--bg3)', borderRadius:'var(--radius)', border:'1.5px solid var(--border)', gap:8 }}>
              <span style={{ fontSize:22, fontWeight:800, color:'var(--accent)' }}>{sessions_per_week}</span>
              <span style={{ fontSize:12, color:'var(--text2)' }}>séances — selon tes jours</span>
            </div></div>
        </div>

        <div><label className="label">Jours d'entraînement</label>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {DAYS_FR.map((d,i) => (
              <button key={i} type="button" onClick={()=>toggleDay(i)} style={{ width:40, height:40, borderRadius:10, border:`2px solid ${form.preferred_days.includes(i)?'var(--accent)':'var(--border)'}`, background:form.preferred_days.includes(i)?'var(--accent)':'var(--bg3)', color:form.preferred_days.includes(i)?'#fff':'var(--text2)', fontFamily:'var(--font-body)', fontWeight:700, fontSize:12, cursor:'pointer', transition:'all 0.15s' }}>
                {d}
              </button>
            ))}</div></div>

        {error && <div style={{ background:'#fff0f0', border:'1px solid #ffd0d0', borderRadius:8, padding:'10px 12px', color:'#e53e3e', fontSize:13, display:'flex', gap:8, alignItems:'center' }}><AlertCircle size={13}/>{error}</div>}

        <div style={{ display:'flex', gap:10, marginTop:4 }}>
          <button onClick={onCancel} className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }}>Annuler</button>
          <button onClick={handleSubmit} className="btn btn-primary" disabled={saving} style={{ flex:2, justifyContent:'center' }}>
            {saving ? <><Loader size={14} style={{ animation:'spin 0.8s linear infinite' }}/> Génération…</> : <><Zap size={14}/> Créer + générer le plan</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { goals, loading, createGoal, deleteGoal, savePlan } = useGoals()
  const { stats, connected, stravaData, disconnect } = useStrava()
  const [showForm, setShowForm] = useState(false)
  const [generatingId, setGeneratingId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [section, setSection] = useState('objectifs') // 'objectifs' | 'strava' | 'compte'

  const handleCreate = async (formData) => {
    const goal = await createGoal(formData)
    setShowForm(false)
    setGeneratingId(goal.id)
    try {
      const plan = await generateTrainingPlan(formData)
      await savePlan(goal.id, plan)
    } catch(e) { console.error(e) }
    finally { setGeneratingId(null) }
    navigate('/programme')
  }

  const upcoming = goals.filter(g => new Date(g.race_date) >= new Date())
  const past = goals.filter(g => new Date(g.race_date) < new Date())

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:34, letterSpacing:1 }}>PROFIL</h1>
          <p style={{ color:'var(--text2)', marginTop:3, fontSize:13 }}>{user?.email}</p>
        </div>
        <Settings size={22} color="var(--text3)"/>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:24, background:'var(--bg3)', padding:4, borderRadius:14 }}>
        {[{k:'objectifs',label:'Objectifs'},{k:'strava',label:'Strava'},{k:'compte',label:'Compte'}].map(({k,label}) => (
          <button key={k} onClick={()=>setSection(k)} style={{ flex:1, padding:'9px', borderRadius:10, border:'none', cursor:'pointer', fontFamily:'var(--font-body)', fontWeight:600, fontSize:14, transition:'all 0.15s', background:section===k?'var(--bg2)':'transparent', color:section===k?'var(--text)':'var(--text2)', boxShadow:section===k?'var(--shadow-sm)':'none' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── SECTION OBJECTIFS ── */}
      {section==='objectifs' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <p style={{ fontSize:13, fontWeight:600, color:'var(--text2)' }}>Mes objectifs de course</p>
            {!showForm && <button onClick={()=>setShowForm(true)} className="btn btn-primary" style={{ fontSize:13 }}><Plus size={14}/> Nouveau</button>}
          </div>

          {showForm && <GoalForm onSave={handleCreate} onCancel={()=>setShowForm(false)} stats={stats}/>}

          {generatingId && (
            <div className="card" style={{ textAlign:'center', padding:28, marginBottom:16 }}>
              <Loader size={24} style={{ color:'var(--accent)', animation:'spin 0.8s linear infinite', margin:'0 auto 10px' }}/>
              <p style={{ fontWeight:700 }}>Génération du plan en cours…</p>
              <p style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>L'IA crée ton programme personnalisé (~30 sec)</p>
            </div>
          )}

          {loading ? <div className="skeleton" style={{ height:100 }}/> : (
            <>
              {upcoming.length===0 && !showForm && (
                <div className="card" style={{ textAlign:'center', padding:40, border:'2px dashed var(--border)' }}>
                  <Target size={36} style={{ color:'var(--text3)', margin:'0 auto 14px' }}/>
                  <p style={{ color:'var(--text2)', marginBottom:16, fontSize:13 }}>Définis ta prochaine course</p>
                  <button onClick={()=>setShowForm(true)} className="btn btn-primary"><Plus size={14}/> Créer mon objectif</button>
                </div>
              )}

              {upcoming.map(g => {
                const daysLeft = Math.ceil((new Date(g.race_date)-new Date())/86400000)
                const plan = g.training_plans?.[0]
                const allSess = plan?.plan_data?.weeks?.flatMap(w=>w.sessions||[])||[]
                const done = allSess.filter(s=>s.completed).length
                const total = allSess.filter(s=>s.type!=='Repos').length
                return (
                  <div key={g.id} className="card" style={{ padding:'16px 20px', marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                          <h3 style={{ fontWeight:700, fontSize:15 }}>{g.name}</h3>
                          <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, background:'var(--frac-light)', color:'var(--frac)' }}>{g.race_type.toUpperCase()}</span>
                        </div>
                        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                          <span style={{ fontSize:12, color:'var(--text2)', display:'flex', gap:3, alignItems:'center' }}><TrendingUp size={12}/>{g.distance_km}km</span>
                          {g.elevation_gain>0 && <span style={{ fontSize:12, color:'var(--text2)', display:'flex', gap:3, alignItems:'center' }}><Mountain size={12}/>+{g.elevation_gain}m</span>}
                          <span style={{ fontSize:12, color:'var(--text2)', display:'flex', gap:3, alignItems:'center' }}><Calendar size={12}/>{format(parseISO(g.race_date),'d MMM yyyy',{locale:fr})}</span>
                          {g.target_time && <span style={{ fontSize:12, color:'var(--accent)', fontWeight:600 }}>🎯 {g.target_time}</span>}
                        </div>
                        {total>0 && (
                          <div style={{ marginTop:10 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text2)', marginBottom:3 }}>
                              <span>Progression</span><span style={{ fontWeight:700 }}>{done}/{total} ({Math.round(done/total*100)}%)</span>
                            </div>
                            <div className="progress-bar"><div className="progress-fill" style={{ width:`${done/total*100}%` }}/></div>
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:26, fontWeight:800, color:daysLeft<14?'#e53e3e':'var(--accent)', lineHeight:1 }}>J-{daysLeft}</div>
                        <div style={{ display:'flex', gap:6, marginTop:10, justifyContent:'flex-end' }}>
                          <button onClick={()=>navigate('/programme')} className="btn btn-primary" style={{ fontSize:12, padding:'7px 12px' }}>Programme <ChevronRight size={12}/></button>
                          <button onClick={()=>setDeleteId(g.id)} className="btn btn-danger" style={{ fontSize:12, padding:'7px 10px' }}><Trash2 size={12}/></button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {past.length>0 && (
                <div style={{ marginTop:20 }}>
                  <p style={{ fontSize:12, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.08, marginBottom:10 }}>Historique</p>
                  {past.map(g => (
                    <div key={g.id} className="card" style={{ padding:'12px 16px', marginBottom:8, opacity:0.65 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div>
                          <p style={{ fontWeight:600, fontSize:14 }}>{g.name}</p>
                          <p style={{ fontSize:12, color:'var(--text2)' }}>{g.distance_km}km · {format(parseISO(g.race_date),'d MMM yyyy',{locale:fr})}</p>
                        </div>
                        <button onClick={()=>setDeleteId(g.id)} className="btn btn-ghost" style={{ padding:'6px 10px' }}><Trash2 size={13}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SECTION STRAVA ── */}
      {section==='strava' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card" style={{ padding:'20px 24px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
              <div style={{ width:44, height:44, borderRadius:14, background:connected?'var(--ef-light)':'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Activity size={22} color={connected?'var(--ef)':'var(--text3)'}/>
              </div>
              <div>
                <p style={{ fontWeight:700, fontSize:16 }}>Strava</p>
                <p style={{ fontSize:13, color:connected?'var(--ef)':'var(--text3)', fontWeight:600 }}>
                  {connected ? `✓ Connecté — ${stravaData?.athlete?.firstname} ${stravaData?.athlete?.lastname}` : 'Non connecté'}
                </p>
              </div>
            </div>
            {connected ? (
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ flex:1, padding:'10px 12px', background:'var(--bg3)', borderRadius:10 }}>
                  <p style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}>Sorties totales</p>
                  <p style={{ fontSize:16, fontWeight:800 }}>{stats?.totalRuns||0}</p>
                </div>
                <div style={{ flex:1, padding:'10px 12px', background:'var(--bg3)', borderRadius:10 }}>
                  <p style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}>Volume total</p>
                  <p style={{ fontSize:16, fontWeight:800 }}>{Math.round(stats?.totalDistance||0)} km</p>
                </div>
                <div style={{ flex:1, padding:'10px 12px', background:'var(--bg3)', borderRadius:10 }}>
                  <p style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}>D+ total</p>
                  <p style={{ fontSize:16, fontWeight:800 }}>{((stats?.totalElevation||0)/1000).toFixed(0)} km</p>
                </div>
              </div>
            ) : (
              <a href={getStravaAuthUrl()} className="btn btn-primary" style={{ justifyContent:'center', padding:'12px' }}>
                <Activity size={16}/> Connecter Strava
              </a>
            )}
            {connected && (
              <button onClick={disconnect} className="btn btn-danger" style={{ marginTop:12, width:'100%', justifyContent:'center' }}>
                Déconnecter Strava
              </button>
            )}
          </div>

          <div className="card" style={{ padding:'16px 20px' }}>
            <p style={{ fontWeight:700, fontSize:14, marginBottom:8 }}>Comment ça marche ?</p>
            {[
              'Connecte ton compte Strava',
              'Tes activités sont synchronisées automatiquement',
              'Après chaque sortie, lie ton activité Strava à une séance du plan',
              "L'IA analyse la séance et adapte la suite du programme"
            ].map((s,i) => (
              <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:8 }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:'var(--accent)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0, marginTop:1 }}>{i+1}</div>
                <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.5 }}>{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION COMPTE ── */}
      {section==='compte' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="card" style={{ padding:'16px 20px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.08, marginBottom:12 }}>Connexion</p>
            <div style={{ padding:'10px 14px', background:'var(--bg3)', borderRadius:10, marginBottom:12 }}>
              <p style={{ fontSize:12, color:'var(--text3)', marginBottom:2 }}>Email</p>
              <p style={{ fontSize:14, fontWeight:600 }}>{user?.email}</p>
            </div>
            <button onClick={async () => { await signOut() }} className="btn btn-danger" style={{ width:'100%', justifyContent:'center' }}>
              <LogOut size={14}/> Se déconnecter
            </button>
          </div>

          <div className="card" style={{ padding:'16px 20px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:0.08, marginBottom:12 }}>À propos de TrailForge</p>
            <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
              TrailForge génère des programmes de course personnalisés grâce à l'IA (Groq / LLaMA 3). Les plans tiennent compte de ton niveau, ton volume actuel et ton objectif de temps pour te proposer des séances adaptées.
            </p>
            <p style={{ fontSize:12, color:'var(--text3)', marginTop:10 }}>Version 4.0 — React + Supabase + Groq + Strava</p>
          </div>
        </div>
      )}

      {/* Modal suppression */}
      {deleteId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:20 }}>
          <div className="card fade-in" style={{ maxWidth:340, width:'100%', padding:28, textAlign:'center' }}>
            <Trash2 size={34} color="#e53e3e" style={{ margin:'0 auto 14px' }}/>
            <h3 style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>Supprimer cet objectif ?</h3>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:22 }}>Le programme sera également supprimé.</p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setDeleteId(null)} className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }}>Annuler</button>
              <button onClick={()=>{ deleteGoal(deleteId); setDeleteId(null) }} className="btn btn-danger" style={{ flex:1, justifyContent:'center' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
