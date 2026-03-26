import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'

const ObraContext = createContext({})

const OBRA_KEY = 'alicerce_obra_ativa'

export function ObraProvider({ children }) {
  const { user } = useAuth()
  const [obras, setObras]           = useState([])
  const [obraAtiva, setObraAtiva]   = useState(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    if (user) loadObras()
    else { setObras([]); setObraAtiva(null); setLoading(false) }
  }, [user])

  async function loadObras() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('obras')
        .select('*')
        .order('created_at', { ascending: false })

      setObras(data || [])

      // Restaura obra ativa do localStorage
      const salvoId = localStorage.getItem(OBRA_KEY)
      if (salvoId && data?.find(o => o.id === salvoId)) {
        setObraAtiva(data.find(o => o.id === salvoId))
      } else if (data?.length > 0) {
        setObraAtiva(data[0])
        localStorage.setItem(OBRA_KEY, data[0].id)
      }
    } catch (err) {
      console.error('loadObras error:', err)
    } finally {
      setLoading(false)
    }
  }

  function selecionarObra(obra) {
    setObraAtiva(obra)
    localStorage.setItem(OBRA_KEY, obra.id)
  }

  async function criarObra(dados) {
    const { data, error } = await supabase
      .from('obras')
      .insert({ ...dados, owner_id: user.id })
      .select()
      .single()

    if (error) return { error }

    setObras(prev => [data, ...prev])
    selecionarObra(data)
    return { data }
  }

  async function atualizarObra(id, updates) {
    const { data, error } = await supabase
      .from('obras')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (!error) {
      setObras(prev => prev.map(o => o.id === id ? data : o))
      if (obraAtiva?.id === id) setObraAtiva(data)
    }
    return { data, error }
  }

  const refreshObraAtiva = useCallback(async () => {
    if (!obraAtiva) return
    const { data } = await supabase
      .from('obras')
      .select('*')
      .eq('id', obraAtiva.id)
      .single()
    if (data) {
      setObraAtiva(data)
      setObras(prev => prev.map(o => o.id === data.id ? data : o))
    }
  }, [obraAtiva])

  return (
    <ObraContext.Provider value={{
      obras, obraAtiva, loading,
      selecionarObra, criarObra, atualizarObra,
      refreshObras: loadObras, refreshObraAtiva
    }}>
      {children}
    </ObraContext.Provider>
  )
}

export const useObra = () => useContext(ObraContext)
