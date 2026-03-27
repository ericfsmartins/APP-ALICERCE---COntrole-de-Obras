import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useObra } from './ObraContext'

const AlertsContext = createContext({ alerts: [], count: 0 })

export function AlertsProvider({ children }) {
  const { obraAtiva } = useObra()
  const [alerts, setAlerts] = useState([])

  const verificarAlertas = useCallback(async () => {
    if (!obraAtiva) return
    const lista = []
    const obraId = obraAtiva.id
    const hoje = new Date()
    const hojeStr = hoje.toISOString().split('T')[0]

    try {
      const em7dias  = new Date(hoje); em7dias.setDate(hoje.getDate() + 7)
      const em30dias = new Date(hoje); em30dias.setDate(hoje.getDate() + 30)
      const em7str   = em7dias.toISOString().split('T')[0]
      const em30str  = em30dias.toISOString().split('T')[0]

      const [
        { data: fases },
        { data: despesas },
        { data: docs },
        { data: ultimaDiarioArr },
        { data: momentosBloqueados },
        { data: conta },
        { data: parcelasVencendo },
        { data: insumos },
      ] = await Promise.all([
        supabase.from('fases').select('id,nome,data_fim_prevista,status').eq('obra_id', obraId)
          .neq('status','concluida').lt('data_fim_prevista', hojeStr),
        supabase.from('despesas').select('valor').eq('obra_id', obraId),
        supabase.from('documentos').select('id,nome,validade').eq('obra_id', obraId)
          .not('validade','is',null).lte('validade', em30str).gte('validade', hojeStr),
        supabase.from('diario_obra').select('data').eq('obra_id', obraId)
          .order('data',{ascending:false}).limit(1),
        supabase.from('momentos').select('id,nome,updated_at').eq('obra_id', obraId).eq('status','bloqueado'),
        supabase.from('conta_obra').select('saldo_atual,limite_alerta').eq('obra_id', obraId).single(),
        supabase.from('parcelas_financiamento').select('id,numero_parcela,valor,data_prevista,financiamento_id')
          .eq('obra_id', obraId).eq('status','aguardando')
          .lte('data_prevista', em7str).gte('data_prevista', hojeStr),
        supabase.from('insumos').select('id,nome,quantidade,saldo').eq('obra_id', obraId),
      ])

      // 1. Fases atrasadas
      fases?.forEach(f => {
        const dias = Math.floor((hoje - new Date(f.data_fim_prevista + 'T12:00:00')) / 86400000)
        lista.push({
          id: `fase-atrasada-${f.id}`,
          tipo: 'erro',
          titulo: 'Fase atrasada',
          mensagem: `"${f.nome}" está ${dias} dia(s) atrasada.`,
          link: '/fases'
        })
      })

      // 2. Orçamento acima de 80%
      if (obraAtiva.orcamento_total > 0) {
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
      docs?.forEach(d => {
        const dias = Math.ceil((new Date(d.validade + 'T12:00:00') - hoje) / 86400000)
        lista.push({
          id: `doc-vencendo-${d.id}`,
          tipo: 'aviso',
          titulo: 'Documento vencendo',
          mensagem: `"${d.nome}" vence em ${dias} dia(s).`,
          link: '/documentos'
        })
      })

      // 4. Diário desatualizado (> 3 dias)
      const ultimaDiario = ultimaDiarioArr?.[0]
      if (ultimaDiario) {
        const diffDias = Math.floor((hoje - new Date(ultimaDiario.data + 'T12:00:00')) / 86400000)
        if (diffDias > 3) lista.push({
          id: 'diario-atrasado',
          tipo: 'aviso',
          titulo: 'Diário desatualizado',
          mensagem: `Última entrada no diário foi há ${diffDias} dias.`,
          link: '/diario'
        })
      }

      // 5. Momentos bloqueados > 7 dias
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

      // 6. Saldo crítico
      if (conta?.saldo_atual !== undefined && conta.saldo_atual < (conta.limite_alerta ?? 10000)) {
        const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
        lista.push({
          id: 'saldo-critico',
          tipo: 'erro',
          titulo: 'Saldo crítico',
          mensagem: `Saldo da obra (${fmt.format(conta.saldo_atual)}) abaixo do limite de alerta.`,
          link: '/financeiro'
        })
      }

      // 7. Parcelas de financiamento vencendo em 7 dias
      parcelasVencendo?.forEach(p => {
        const dias = Math.ceil((new Date(p.data_prevista + 'T12:00:00') - hoje) / 86400000)
        const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
        lista.push({
          id: `parcela-vencendo-${p.id}`,
          tipo: 'aviso',
          titulo: 'Parcela vencendo',
          mensagem: `Parcela #${p.numero_parcela} (${fmt.format(p.valor)}) vence em ${dias} dia(s).`,
          link: '/financeiro'
        })
      })

      // 8. Insumo com estoque crítico (saldo < 20% da quantidade planejada)
      insumos?.forEach(i => {
        if (i.quantidade > 0 && (i.saldo ?? i.quantidade) < i.quantidade * 0.2) {
          lista.push({
            id: `estoque-critico-${i.id}`,
            tipo: 'aviso',
            titulo: 'Estoque crítico',
            mensagem: `Insumo "${i.nome}" com estoque abaixo de 20% do planejado.`,
            link: '/insumos'
          })
        }
      })

    } catch (err) {
      console.error('verificarAlertas error:', err)
    }

    setAlerts(lista)
  }, [obraAtiva])

  useEffect(() => {
    if (obraAtiva) {
      verificarAlertas()
      const interval = setInterval(verificarAlertas, 30 * 60 * 1000) // 30 min
      return () => clearInterval(interval)
    }
  }, [obraAtiva?.id])

  return (
    <AlertsContext.Provider value={{ alerts, count: alerts.length, refresh: verificarAlertas }}>
      {children}
    </AlertsContext.Provider>
  )
}

export const useAlerts = () => useContext(AlertsContext)
