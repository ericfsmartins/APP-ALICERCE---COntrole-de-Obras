import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useObra } from './ObraContext'

const AlertsContext = createContext({ alerts: [], count: 0 })

export function AlertsProvider({ children }) {
  const { obraAtiva } = useObra()
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    if (obraAtiva) verificarAlertas()
  }, [obraAtiva?.id])

  async function verificarAlertas() {
    const lista = []
    const obraId = obraAtiva.id
    const hoje = new Date()

    try {
      // 1. Fases vencidas
      const { data: fases } = await supabase
        .from('fases')
        .select('id, nome, data_fim_prevista, status')
        .eq('obra_id', obraId)
        .neq('status', 'concluida')
        .lt('data_fim_prevista', hoje.toISOString().split('T')[0])

      fases?.forEach(f => lista.push({
        id: `fase-vencida-${f.id}`,
        tipo: 'erro',
        titulo: 'Fase vencida',
        mensagem: `Fase "${f.nome}" passou do prazo sem ser concluída.`,
        link: '/fases'
      }))

      // 2. Consumo orçamento > 80%
      if (obraAtiva.orcamento_total > 0) {
        const { data: despesas } = await supabase
          .from('despesas')
          .select('valor')
          .eq('obra_id', obraId)

        const totalGasto = (despesas || []).reduce((s, d) => s + (d.valor || 0), 0)
        const pct = (totalGasto / obraAtiva.orcamento_total) * 100
        if (pct > 80) lista.push({
          id: 'orcamento-80',
          tipo: 'aviso',
          titulo: 'Orçamento acima de 80%',
          mensagem: `${pct.toFixed(1)}% do orçamento já foi consumido.`,
          link: '/despesas'
        })
      }

      // 3. Documentos vencendo em 30 dias
      const em30dias = new Date(hoje)
      em30dias.setDate(em30dias.getDate() + 30)
      const { data: docs } = await supabase
        .from('documentos')
        .select('id, nome, validade')
        .eq('obra_id', obraId)
        .not('validade', 'is', null)
        .lte('validade', em30dias.toISOString().split('T')[0])
        .gte('validade', hoje.toISOString().split('T')[0])

      docs?.forEach(d => lista.push({
        id: `doc-vencendo-${d.id}`,
        tipo: 'aviso',
        titulo: 'Documento vencendo',
        mensagem: `"${d.nome}" vence em breve.`,
        link: '/documentos'
      }))

      // 4. Sem entrada no diário há 3 dias úteis
      const { data: ultimaDiario } = await supabase
        .from('diario_obra')
        .select('data')
        .eq('obra_id', obraId)
        .order('data', { ascending: false })
        .limit(1)
        .single()

      if (ultimaDiario) {
        const ultima = new Date(ultimaDiario.data + 'T12:00:00')
        const diffDias = Math.floor((hoje - ultima) / 86400000)
        if (diffDias > 3) lista.push({
          id: 'diario-atrasado',
          tipo: 'aviso',
          titulo: 'Diário desatualizado',
          mensagem: `Última entrada no diário foi há ${diffDias} dias.`,
          link: '/diario'
        })
      }

      // 5. Momento bloqueado há mais de 7 dias
      const { data: momentosBloqueados } = await supabase
        .from('momentos')
        .select('id, nome, updated_at')
        .eq('obra_id', obraId)
        .eq('status', 'bloqueado')

      momentosBloqueados?.forEach(m => {
        const diff = Math.floor((hoje - new Date(m.updated_at || hoje)) / 86400000)
        if (diff > 7) lista.push({
          id: `momento-bloqueado-${m.id}`,
          tipo: 'info',
          titulo: 'Momento bloqueado',
          mensagem: `"${m.nome}" está bloqueado há ${diff} dias.`,
          link: '/momentos'
        })
      })

    } catch (err) {
      console.error('verificarAlertas error:', err)
    }

    setAlerts(lista)
  }

  return (
    <AlertsContext.Provider value={{ alerts, count: alerts.length, refresh: verificarAlertas }}>
      {children}
    </AlertsContext.Provider>
  )
}

export const useAlerts = () => useContext(AlertsContext)
