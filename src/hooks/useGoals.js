import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useGoals() {
  const { user } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchGoals = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase.from('goals').select('*, training_plans(*)').eq('user_id', user.id).order('created_at', { ascending: false })
    setGoals(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchGoals() }, [fetchGoals])

  const createGoal = async (goalData) => {
    const { data, error } = await supabase.from('goals').insert([{ ...goalData, user_id: user.id }]).select('*, training_plans(*)').single()
    if (error) throw error
    setGoals(prev => [data, ...prev])
    return data
  }

  const deleteGoal = async (goalId) => {
    await supabase.from('goals').delete().eq('id', goalId).eq('user_id', user.id)
    setGoals(prev => prev.filter(g => g.id !== goalId))
  }

  const savePlan = async (goalId, planData) => {
    await supabase.from('training_plans').delete().eq('goal_id', goalId)
    const { data, error } = await supabase.from('training_plans').insert([{ goal_id: goalId, plan_data: planData, user_id: user.id }]).select().single()
    if (error) throw error
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, training_plans: [data] } : g))
    return data
  }

  const updateSession = async (planId, weekIdx, sessionIdx, updates) => {
    const goal = goals.find(g => g.training_plans?.some(p => p.id === planId))
    const plan = goal?.training_plans?.find(p => p.id === planId)
    if (!plan) return
    const updatedPlan = JSON.parse(JSON.stringify(plan.plan_data))
    const session = updatedPlan.weeks[weekIdx]?.sessions?.[sessionIdx]
    if (!session) return
    Object.assign(session, updates)
    const { data, error } = await supabase.from('training_plans').update({ plan_data: updatedPlan }).eq('id', planId).select().single()
    if (error) throw error
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, training_plans: g.training_plans.map(p => p.id === planId ? data : p) } : g))
  }

  return { goals, loading, createGoal, deleteGoal, savePlan, updateSession, refetch: fetchGoals }
}
