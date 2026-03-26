import { useStrava } from '../hooks/useStrava'
import { useGoals } from '../hooks/useGoals'
import { getStravaAuthUrl, secToMMSS, fmtDuration } from '../lib/strava'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { Activity, TrendingUp, Mountain, RefreshCw, Heart, Zap } from 'lucide-react'

const formatDuration = fmtDuration
const MOIS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

function getLocalInsights(stats, goal) {
  if (!stats) return []
  const out = []
  const trend = stats.weeklyTrend || []
  const lastKm = trend[trend.length - 1]?.km || 0
  const prevKm = trend[trend.length - 2]?.km || 0
  if (lastKm > prevKm * 1.1) out.push({ type: 'positive', text: `Ton volume progresse bien cette semaine (+${(lastKm - prevKm).toFixed(1)}km vs la semaine précédente).` })
  else if (lastKm < prevKm * 0.7 && prevKm > 0) out.push({ type: 'warning', text: `Volume en baisse cette semaine (${lastKm}km vs ${prevKm}km). Fatigue ou agenda chargé ?` })
  if (stats.currentStreak >= 3) out.push({ type: 'positive', text: `${stats.currentStreak} semaines régulières consécutives — excellent, la constance fait tout !` })
  if (stats.efPaceSecPerKm) out.push({ type: 'info', text: `Ton allure EF réelle Strava : ${secToMMSS(stats.efPaceSecPerKm)}/km. Reste dans cette fourchette sur tes footings faciles.` })
  if (goal) {
    const daysLeft = Math.ceil((new Date(goal.race_date) - new Date()) / 86400000)
    if (daysLeft < 21) out.push({ type: 'warning', text: `J-${daysLeft} avant ${goal.name} — phase d'affûtage, réduis le volume progressivement.` })
  }
  return out.slice(0, 3)
}

function KpiCard({ icon: Icon, label, value, unit, color, sub }) {
  return (
    <div className="card" style={{ padding:'16px 18px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div style={{ width:34, height:34, borderRadius:10, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={16} color={color}/>
        </div>
      </div>
      <div style={{ fontSize:24, fontWeight:800, color:'var(--text)', lineHeight:1 }}>
        {value ?? '--'}<span style={{ fontSize:12, fontWeight:500, color:'var(--text2)', marginLeft:3 }}>{unit}</span>
      </div>
      <div style={{ fontSize:12, color:'var(--text2)', marginTop:5 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

const ChartTip = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 12px', fontSize:12, boxShadow:'var(--shadow)' }}>
      <p style={{ color:'var(--text2)', marginBottom:4, fontWeight:600 }}>Sem. {label}</p>
      {payload.map((p,i) => <p key={i} style={{ color:p.color, fontWeight:700 }}>{p.name}: {typeof p.value==='number'?p.value.toFixed(1):p.value}</p>)}
    </div>
  )
}

export default function Dashboard() {
  const { stats, stravaData, loading, connected, refetch } = useStrava()
  const { goals } = useGoals()
  const activeGoal = goals.find(g => new Date(g.race_date) >= new Date())
  const monthLabel = MOIS[new Date().getMonth()]

  // Génère les insights localement sans appel IA
  const insights = getLocalInsights(stats, activeGoal)

  if (!connected) return (
    <div className="fade-in">
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:34, letterSpacing:1 }}>DASHBOARD</h1>
        <p style={{ color:'var(--text2)', marginTop:4, fontSize:14 }}>Connecte Strava pour voir ta progression</p>
      </div>
      <div className="card" style={{ textAlign:'center', padding:'44px 24px', border:'2px dashed var(--border)' }}>
        <Activity size={36} color="#FC4C02" style={{ margin:'0 auto 16px' }}/>
        <h2 style={{ fontSize:18, fontWeight:700, marginBottom:10 }}>Connecte Strava</h2>
        <a href={getStravaAuthUrl()} className="btn btn-primary" style={{ padding:'12px 28px', justifyContent:'center' }}>
          <Activity size={16}/> Connecter Strava
        </a>
      </div>
    </div>
  )

  return (
    <div className="fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:34, letterSpacing:1 }}>DASHBOARD</h1>
          <p style={{ color:'var(--text2)', marginTop:3, fontSize:13 }}>
            {stravaData?.athlete?.firstname} · {activeGoal ? `J-${Math.ceil((new Date(activeGoal.race_date)-new Date())/86400000)} avant ${activeGoal.name}` : 'Aucun objectif actif'}
          </p>
        </div>
        <button onClick={refetch} disabled={loading} className="btn btn-ghost" style={{ fontSize:13 }}>
          <RefreshCw size={13} style={{ animation:loading?'spin 1s linear infinite':'none' }}/> Actualiser
        </button>
      </div>

      {/* ── 3 cartes charge ── */}
      <div className="section-header"><span className="section-title">📅 7 derniers jours</span></div>
      <div className="grid-3" style={{ marginBottom:24 }}>
        <KpiCard icon={TrendingUp} label="Volume 7j" value={stats?.charge7d?.km} unit="km" color="var(--accent)" sub={`Moy. hebdo: ${Math.round(stats?.avgWeeklyKm||0)} km/sem`}/>
        <KpiCard icon={Mountain} label="Dénivelé 7j" value={stats?.charge7d?.elevation} unit="m D+" color="var(--long)" sub={`Total: ${(stats?.totalElevation/1000||0).toFixed(0)} km D+`}/>
        <KpiCard icon={Activity} label="Sorties 7j" value={stats?.charge7d?.runs} unit="runs" color="var(--frac)" sub={`Total: ${stats?.totalRuns||0} sorties`}/>
      </div>

      {/* ── Graphique principal ── */}
      {stats?.weeklyTrend?.length>0 && (
        <div className="card" style={{ marginBottom:20 }}>
          <div className="section-header" style={{ marginBottom:14 }}>
            <span className="section-title">Volume 8 semaines (km)</span>
            <span style={{ fontSize:11, color:'var(--text3)' }}>lundi au dimanche</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={stats.weeklyTrend}>
              <defs>
                <linearGradient id="kmGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff5500" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#ff5500" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="week" tick={{ fill:'var(--text3)', fontSize:10 }}/>
              <YAxis tick={{ fill:'var(--text3)', fontSize:10 }}/>
              <Tooltip content={<ChartTip/>}/>
              <Area type="monotone" dataKey="km" name="km" stroke="var(--accent)" strokeWidth={2.5} fill="url(#kmGrad)" dot={{ fill:'var(--accent)', r:3, strokeWidth:0 }}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Stats ce mois ── */}
      <div className="section-header"><span className="section-title">📆 {monthLabel} — ce mois</span></div>
      <div className="grid-4" style={{ marginBottom:24 }}>
        <KpiCard icon={Activity} label="Sorties" value={stats?.monthStats?.runs} unit="runs" color="var(--accent)"/>
        <KpiCard icon={TrendingUp} label="Distance" value={stats?.monthStats?.km} unit="km" color="var(--long)"/>
        <KpiCard icon={Mountain} label="Dénivelé" value={stats?.monthStats?.elevation} unit="m D+" color="var(--ef)"/>
        <KpiCard icon={Heart} label="Temps" value={formatDuration(stats?.monthStats?.time)} unit="" color="#e53e3e"/>
      </div>

      {/* ── Progression & Records ── */}
      <div className="grid-2" style={{ marginBottom:24 }}>
        <div className="card">
          <div className="section-header" style={{ marginBottom:14 }}><span className="section-title">Progression</span></div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[
              { label:'Allure EF réelle', value:stats?.efPaceFormatted||'--', unit:'/km', color:'var(--ef)', desc:'Allure confortable habituelle' },
              { label:'Meilleure allure', value:stats?.bestPaceFormatted||'--', unit:'/km', color:'var(--frac)', desc:'Sur tes 30 dernières sorties' },
              { label:'VO2max estimé', value:stats?.vo2max?`~${stats.vo2max}`:'--', unit:'', color:'var(--long)', desc:'Estimation Jack Daniels' },
              { label:'FC moyenne', value:stats?.avgHR||'--', unit:'bpm', color:'#e53e3e', desc:stats?.maxHR?`FC max: ${stats.maxHR}bpm`:'' },
            ].map((item,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:'var(--bg3)', borderRadius:10 }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.label}</p>
                  {item.desc && <p style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{item.desc}</p>}
                </div>
                <p style={{ fontSize:16, fontWeight:800, color:item.color }}>
                  {item.value}<span style={{ fontSize:11, fontWeight:500, marginLeft:2 }}>{item.unit}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-header" style={{ marginBottom:14 }}><span className="section-title">Régularité</span></div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ padding:'14px 16px', background:'var(--ef-light)', borderRadius:12, border:'1px solid #bbf7d0' }}>
              <p style={{ fontSize:24, fontWeight:800, color:'var(--ef)' }}>{stats?.streakWeeks||0} sem.</p>
              <p style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>Série consécutive avec au moins 1 sortie</p>
            </div>
            <div style={{ padding:'12px 14px', background:'var(--bg3)', borderRadius:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:13, color:'var(--text2)' }}>Semaines actives (8 sem)</span>
                <span style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>{stats?.regularWeeks||0}/8</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width:`${((stats?.regularWeeks||0)/8)*100}%`, background:(stats?.regularWeeks||0)>=6?'var(--ef)':'var(--accent)' }}/>
              </div>
            </div>
            {stats?.weeklyTrend && (
              <div style={{ padding:'12px 14px', background:'var(--bg3)', borderRadius:12 }}>
                <p style={{ fontSize:12, color:'var(--text2)', marginBottom:8 }}>Tendance dénivelé 8 sem.</p>
                <ResponsiveContainer width="100%" height={60}>
                  <BarChart data={stats.weeklyTrend}>
                    <Bar dataKey="elevation" name="D+" fill="var(--long)" radius={[3,3,0,0]}/>
                    <Tooltip content={<ChartTip/>}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Insights IA ── */}
      <div className="section-header"><span className="section-title">💡 À retenir cette semaine</span></div>
      {loadingInsights ? (
        <div className="skeleton" style={{ height:80, marginBottom:8 }}/>
      ) : insights?.length > 0 ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
          {insights.map((ins,i) => (
            <div key={i} style={{ padding:'12px 16px', borderRadius:12, background:'var(--bg2)', border:'1px solid var(--border)', display:'flex', gap:12, alignItems:'flex-start' }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{ins.icon}</span>
              <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.5 }}>{ins.text}</p>
            </div>
          ))}
        </div>
      ) : stats && (
        <div style={{ padding:'14px 16px', borderRadius:12, background:'var(--bg3)', marginBottom:24 }}>
          <p style={{ fontSize:13, color:'var(--text2)' }}>Continue à t'entraîner pour voir tes insights personnalisés 💪</p>
        </div>
      )}

      {/* ── Dernières sorties ── */}
      <div className="section-header"><span className="section-title">Dernières sorties</span></div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {(stats?.recentRuns||[]).slice(0,8).map(run => {
          const paceSec = run.average_speed>0 ? 1000/run.average_speed : null
          const paceStr = paceSec ? `${Math.floor(paceSec/60)}'${String(Math.round(paceSec%60)).padStart(2,'0')}"` : '--'
          const isTrail = run.type==='TrailRun'||run.sport_type==='TrailRun'
          return (
            <div key={run.id} className="card" style={{ padding:'12px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:600, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{run.name}</p>
                  <p style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{format(new Date(run.start_date),'dd MMM yyyy',{locale:fr})}</p>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, background:isTrail?'var(--cotes-light)':'var(--ef-light)', color:isTrail?'var(--cotes)':'var(--ef)', flexShrink:0, marginLeft:8 }}>
                  {isTrail?'TRAIL':'ROUTE'}
                </span>
              </div>
              <div style={{ display:'flex', gap:14, marginTop:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, fontWeight:700 }}>{(run.distance/1000).toFixed(1)} km</span>
                <span style={{ fontSize:12, color:'var(--text2)' }}>{formatDuration(run.moving_time)}</span>
                <span style={{ fontSize:12, color:'var(--long)', fontWeight:600 }}>{paceStr}/km</span>
                {run.total_elevation_gain>0 && <span style={{ fontSize:12, color:'var(--text2)' }}>↑{Math.round(run.total_elevation_gain)}m</span>}
                {run.average_heartrate>0 && <span style={{ fontSize:12, color:'#e53e3e' }}>♥ {Math.round(run.average_heartrate)}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
