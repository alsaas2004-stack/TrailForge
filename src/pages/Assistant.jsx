import { useState, useRef, useEffect } from 'react'
import { useGoals } from '../hooks/useGoals'
import { useStrava } from '../hooks/useStrava'
import { chatWithCoach } from '../lib/grok'
import { Send, Loader, Zap, RotateCcw } from 'lucide-react'

const SUGGESTIONS = [
  "Quelle est mon allure EF aujourd'hui ?",
  "Comment bien récupérer après une sortie longue ?",
  "Quelle alimentation avant un trail ?",
  "Comment améliorer ma montée en côte ?",
  "J'ai mal aux genoux, que faire ?",
  "Comment progresser en endurance fondamentale ?",
]

export default function Assistant() {
  const { goals } = useGoals()
  const { stats } = useStrava()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const goal = goals.find(g => new Date(g.race_date) >= new Date())

  const ctx = {
    goalName: goal?.name, level: goal?.level, targetTime: goal?.target_time,
    weeklyKm: stats ? Math.round(stats.avgWeeklyKm) : goal?.current_weekly_km,
    efPace: stats?.efPaceFormatted,
    daysUntilRace: goal ? Math.ceil((new Date(goal.race_date)-new Date())/86400000) : null,
    monthKm: stats?.monthStats?.km, monthElevation: stats?.monthStats?.elevation
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, loading])

  const send = async (text) => {
    const content = text || input.trim()
    if (!content || loading) return
    setInput('')
    const userMsg = { role:'user', content }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    try {
      const history = [...messages, userMsg].map(m => ({ role:m.role, content:m.content }))
      const reply = await chatWithCoach(history, ctx)
      setMessages(prev => [...prev, { role:'assistant', content:reply }])
    } catch(e) {
      setMessages(prev => [...prev, { role:'assistant', content:`Erreur: ${e.message}` }])
    } finally { setLoading(false) }
  }

  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 80px)', maxHeight:760 }}>
      <div style={{ marginBottom:16 }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:34, letterSpacing:1 }}>COACH IA</h1>
        <p style={{ color:'var(--text2)', marginTop:4, fontSize:13 }}>
          {goal ? `${goal.name} · J-${Math.ceil((new Date(goal.race_date)-new Date())/86400000)}` : 'Ton assistant running personnel'}
        </p>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:16, background:'var(--bg3)', borderRadius:16, marginBottom:12, border:'1px solid var(--border)' }}>
        {messages.length===0 && (
          <div style={{ textAlign:'center', paddingTop:28 }}>
            <div style={{ width:52, height:52, borderRadius:16, background:'var(--accent)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:14, boxShadow:'0 8px 24px rgba(255,85,0,0.25)' }}>
              <Zap size={24} color="#fff" fill="#fff"/>
            </div>
            <h3 style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>TrailForge Coach</h3>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:22, lineHeight:1.5 }}>
              Pose-moi tes questions sur l'entraînement, la nutrition, la récupération ou la stratégie de course.
            </p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7, justifyContent:'center' }}>
              {SUGGESTIONS.map((s,i) => (
                <button key={i} onClick={()=>send(s)} style={{ padding:'7px 13px', borderRadius:100, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text2)', fontSize:12, fontFamily:'var(--font-body)', cursor:'pointer', transition:'all 0.15s', fontWeight:500 }}
                  onMouseEnter={e=>{e.target.style.borderColor='var(--accent)';e.target.style.color='var(--accent)'}}
                  onMouseLeave={e=>{e.target.style.borderColor='var(--border)';e.target.style.color='var(--text2)'}}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m,i) => (
          <div key={i} style={{ display:'flex', justifyContent:m.role==='user'?'flex-end':'flex-start', marginBottom:10 }}>
            {m.role==='assistant' && (
              <div style={{ width:28, height:28, borderRadius:9, background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginRight:8, alignSelf:'flex-end' }}>
                <Zap size={13} color="#fff" fill="#fff"/>
              </div>
            )}
            <div style={{ maxWidth:'78%', padding:'10px 14px', borderRadius:m.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px', background:m.role==='user'?'var(--accent)':'var(--bg2)', border:m.role==='user'?'none':'1px solid var(--border)', color:m.role==='user'?'#fff':'var(--text)', fontSize:14, lineHeight:1.6, boxShadow:m.role==='user'?'0 2px 8px rgba(255,85,0,0.2)':'var(--shadow-sm)' }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <div style={{ width:28, height:28, borderRadius:9, background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Zap size={13} color="#fff" fill="#fff"/>
            </div>
            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'16px 16px 16px 4px', padding:'12px 16px', display:'flex', gap:4, alignItems:'center' }}>
              {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--text3)', animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
        {messages.length>0 && (
          <button onClick={()=>setMessages([])} className="btn btn-ghost" style={{ padding:'10px', flexShrink:0 }} title="Nouvelle conversation">
            <RotateCcw size={14}/>
          </button>
        )}
        <div style={{ flex:1, position:'relative' }}>
          <textarea className="input textarea" value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
            placeholder="Pose ta question… (Entrée pour envoyer)" rows={1}
            style={{ resize:'none', paddingRight:48, minHeight:44, maxHeight:120, overflowY:'auto', lineHeight:1.5 }}/>
          <button onClick={()=>send()} disabled={!input.trim()||loading}
            style={{ position:'absolute', right:8, bottom:8, width:30, height:30, borderRadius:8, border:'none', background:input.trim()&&!loading?'var(--accent)':'var(--bg4)', color:input.trim()&&!loading?'#fff':'var(--text3)', display:'flex', alignItems:'center', justifyContent:'center', cursor:input.trim()&&!loading?'pointer':'not-allowed', transition:'all 0.15s' }}>
            {loading ? <Loader size={12} style={{ animation:'spin 0.8s linear infinite' }}/> : <Send size={12}/>}
          </button>
        </div>
      </div>
    </div>
  )
}
