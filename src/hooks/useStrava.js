import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { getActivities, getAthlete, computeStats, refreshToken } from '../lib/strava'

const KEY = 'trailforge_strava'
const getStored = () => { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } }
const store = (t) => localStorage.setItem(KEY, JSON.stringify(t))

export function useStrava() {
  const { user } = useAuth()
  const [stravaData, setStravaData] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)

  const getValidToken = useCallback(async () => {
    let tokens = getStored()
    if (!tokens?.access_token) return null
    const now = Math.floor(Date.now() / 1000)
    if (tokens.expires_at && now >= tokens.expires_at - 300) {
      try {
        const refreshed = await refreshToken(tokens.refresh_token)
        tokens = { ...tokens, ...refreshed }
        store(tokens)
        if (user) await supabase.from('strava_tokens').upsert({ user_id: user.id, access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at })
      } catch { localStorage.removeItem(KEY); return null }
    }
    return tokens.access_token
  }, [user])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getValidToken()
      if (!token) { setLoading(false); return }
      const [athlete, activities] = await Promise.all([getAthlete(token), getActivities(token, 1, 100)])
      setStravaData({ athlete, activities })
      setStats(computeStats(activities))
      setConnected(true)
    } catch (e) {
      if (e.message === 'TOKEN_EXPIRED') { localStorage.removeItem(KEY); setConnected(false) }
    } finally { setLoading(false) }
  }, [getValidToken])

  useEffect(() => {
    const init = async () => {
      let tokens = getStored()
      if (!tokens && user) {
        const { data } = await supabase.from('strava_tokens').select('*').eq('user_id', user.id).single()
        if (data) { tokens = data; store(data) }
      }
      if (tokens?.access_token) { setConnected(true); fetchData() }
    }
    if (user) init()
  }, [user, fetchData])

  const saveTokens = useCallback(async (tokenData) => {
    store(tokenData)
    if (user) await supabase.from('strava_tokens').upsert({ user_id: user.id, access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at: tokenData.expires_at, athlete_id: tokenData.athlete?.id })
    setConnected(true)
    fetchData()
  }, [user, fetchData])

  const disconnect = useCallback(() => {
    localStorage.removeItem(KEY)
    if (user) supabase.from('strava_tokens').delete().eq('user_id', user.id)
    setStravaData(null); setStats(null); setConnected(false)
  }, [user])

  return { stravaData, stats, loading, connected, refetch: fetchData, saveTokens, disconnect }
}
