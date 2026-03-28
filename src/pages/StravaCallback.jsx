import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { exchangeToken } from '../lib/strava'
import { useStrava } from '../hooks/useStrava'
import { CheckCircle, XCircle, Zap } from 'lucide-react'

export default function StravaCallback() {
  const navigate = useNavigate()
  const { saveTokens } = useStrava()
  const [status, setStatus] = useState('loading')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')

    console.log('CALLBACK - code:', code, 'error:', error)

    if (error || !code) {
      setStatus('error')
      setMsg(error === 'access_denied' ? 'Accès refusé.' : 'Code manquant.')
      return
    }

    exchangeToken(code)
      .then(async (data) => {
        console.log('TOKEN DATA:', JSON.stringify(data))
        await saveTokens(data)
        setStatus('success')
        setTimeout(() => navigate('/'), 2000)
      })
      .catch(e => {
        console.log('ERROR:', e.message)
        setStatus('error')
        setMsg(e.message)
      })
  }, []) // eslint-disable-line

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ textAlign: 'center', padding: 48, maxWidth: 360, width: '100%' }}>
        {status === 'loading' && (
          <>
            <div style={{ width: 44, height: 44, border: '3px solid var(--border)', borderTopColor: '#FC4C02', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Connexion Strava…</h2>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 6 }}>Échange du token en cours</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={44} color="var(--accent3)" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Strava connecté !</h2>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 6 }}>Redirection…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={44} color="#e53e3e" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Erreur</h2>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>{msg}</p>
            <button onClick={() => navigate('/')} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              <Zap size={14} /> Retour
            </button>
          </>
        )}
      </div>
    </div>
  )
}
