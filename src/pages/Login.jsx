import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Zap, Mail, Lock, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(''); setSuccess('')
    try {
      if (mode === 'login') { const { error } = await signIn(email, password); if (error) throw error; navigate('/') }
      else { const { error } = await signUp(email, password); if (error) throw error; setSuccess('Compte créé ! Vérifie ton email.') }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: 'var(--accent)', borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: '0 8px 24px rgba(255,85,0,0.3)' }}>
            <Zap size={28} color="#fff" fill="#fff" />
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, letterSpacing: 2 }}>TRAILFORGE</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Ton coach running IA personnel</p>
        </div>
        <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 12, padding: 4, marginBottom: 22 }}>
          {['login', 'signup'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); setSuccess('') }}
              style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, background: mode === m ? 'var(--bg2)' : 'transparent', color: mode === m ? 'var(--text)' : 'var(--text2)', boxShadow: mode === m ? 'var(--shadow-sm)' : 'none', transition: 'all 0.15s' }}>
              {m === 'login' ? 'Connexion' : 'Inscription'}
            </button>
          ))}
        </div>
        <div className="card" style={{ padding: 24 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="label">Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@email.com" required style={{ paddingLeft: 36 }} />
              </div>
            </div>
            <div>
              <label className="label">Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
                <input className="input" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} style={{ paddingLeft: 36, paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {error && <div style={{ background: '#fff0f0', border: '1px solid #ffd0d0', borderRadius: 8, padding: '10px 12px', color: '#e53e3e', fontSize: 13 }}>{error}</div>}
            {success && <div style={{ background: 'var(--accent3-light)', border: '1px solid #b2f0e8', borderRadius: 8, padding: '10px 12px', color: 'var(--accent3)', fontSize: 13 }}>{success}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center', padding: '12px', fontSize: 15, marginTop: 4 }}>
              {loading ? 'Chargement…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
