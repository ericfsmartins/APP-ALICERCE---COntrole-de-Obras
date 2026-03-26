/**
 * Motor de propagação entre os 3 controles:
 * Fases SINAPI ↔ Insumos/Despesas ↔ Momentos
 */
import { supabase } from './supabase'

/**
 * Ao lançar uma despesa: atualiza total_realizado da fase e custo do momento.
 */
export async function propagarDespesa({ obraId, faseId, momentoId, valor }) {
  const updates = []

  if (faseId) {
    // Recalcula total_realizado somando todas as despesas da fase
    const { data: despesas } = await supabase
      .from('despesas')
      .select('valor')
      .eq('obra_id', obraId)
      .eq('fase_id', faseId)

    const totalRealizado = (despesas || []).reduce((s, d) => s + (d.valor || 0), 0)

    updates.push(
      supabase.from('fases').update({ total_realizado: totalRealizado }).eq('id', faseId)
    )
  }

  if (momentoId) {
    // Recalcula custo_realizado do momento
    const { data: despesas } = await supabase
      .from('despesas')
      .select('valor')
      .eq('obra_id', obraId)
      .eq('momento_id', momentoId)

    const custoRealizado = (despesas || []).reduce((s, d) => s + (d.valor || 0), 0)

    updates.push(
      supabase.from('momentos').update({ custo_realizado: custoRealizado }).eq('id', momentoId)
    )
  }

  await Promise.all(updates)
}

/**
 * Ao mudar status do insumo para 'comprado' ou 'entregue':
 * Marca tarefa do momento correspondente como em_andamento/concluida.
 */
export async function propagarInsumo({ obraId, insumoId, faseId, novoStatus }) {
  if (!['comprado', 'entregue'].includes(novoStatus)) return

  // Busca momentos que têm tarefas do tipo aquisicao_critica vinculadas à fase
  const { data: tarefas } = await supabase
    .from('tarefas_momento')
    .select('id, momento_id, status')
    .eq('obra_id', obraId)
    .eq('tipo', 'aquisicao_critica')
    .contains('fase_ids', [faseId])

  if (!tarefas?.length) return

  for (const tarefa of tarefas) {
    const novoStatusTarefa = novoStatus === 'entregue' ? 'concluida' : 'em_andamento'
    await supabase
      .from('tarefas_momento')
      .update({ status: novoStatusTarefa, percentual_concluido: novoStatus === 'entregue' ? 100 : 50 })
      .eq('id', tarefa.id)

    // Recalcula percentual do momento
    await recalcularMomento(tarefa.momento_id, obraId)
  }
}

/**
 * Ao concluir uma tarefa de Momento:
 * Incrementa percentual_concluido da Fase SINAPI vinculada.
 */
export async function propagarTarefaMomento({ obraId, faseIds, momentoId }) {
  if (!faseIds?.length) return

  for (const faseId of faseIds) {
    // Conta quantas tarefas desta fase estão concluídas vs total
    const { data: todasTarefas } = await supabase
      .from('tarefas_momento')
      .select('status')
      .eq('obra_id', obraId)
      .contains('fase_ids', [faseId])

    if (!todasTarefas?.length) continue

    const concluidas = todasTarefas.filter(t => t.status === 'concluida').length
    const pct = Math.round((concluidas / todasTarefas.length) * 100)

    await supabase
      .from('fases')
      .update({ percentual_concluido: pct })
      .eq('id', faseId)
      .eq('obra_id', obraId)
  }

  await recalcularMomento(momentoId, obraId)
}

/**
 * Recalcula percentual_concluido de um Momento com base nas tarefas.
 * Se 100% → muda status para 'concluido' e desbloqueia próximo momento.
 */
export async function recalcularMomento(momentoId, obraId) {
  const { data: tarefas } = await supabase
    .from('tarefas_momento')
    .select('status')
    .eq('momento_id', momentoId)
    .eq('obra_id', obraId)

  if (!tarefas?.length) return

  const concluidas = tarefas.filter(t => t.status === 'concluida').length
  const pct = Math.round((concluidas / tarefas.length) * 100)
  const novoStatus = pct === 100 ? 'concluido' : pct > 0 ? 'em_andamento' : 'nao_iniciado'

  await supabase
    .from('momentos')
    .update({ percentual_concluido: pct, status: novoStatus })
    .eq('id', momentoId)

  // Se concluiu, verifica se pode desbloquear próximos momentos
  if (novoStatus === 'concluido') {
    await verificarDesbloqueio(momentoId, obraId)
  }
}

/**
 * Verifica e desbloqueia momentos que tinham este como prerequisito.
 */
async function verificarDesbloqueio(momentoConcluidoId, obraId) {
  const { data: momentos } = await supabase
    .from('momentos')
    .select('id, prerequisito_ids, status')
    .eq('obra_id', obraId)
    .eq('status', 'bloqueado')

  if (!momentos?.length) return

  for (const momento of momentos) {
    const prereqs = momento.prerequisito_ids || []
    if (!prereqs.includes(momentoConcluidoId)) continue

    // Verifica se todos os prerequisitos estão concluídos
    const { data: concluidos } = await supabase
      .from('momentos')
      .select('id')
      .in('id', prereqs)
      .eq('status', 'concluido')

    if (concluidos?.length === prereqs.length) {
      await supabase
        .from('momentos')
        .update({ status: 'nao_iniciado' })
        .eq('id', momento.id)
    }
  }
}

/**
 * Ao atualizar percentual_concluido de uma Fase:
 * Recalcula momentos que contêm tarefas vinculadas a esta fase.
 */
export async function propagarFase({ obraId, faseId }) {
  const { data: tarefas } = await supabase
    .from('tarefas_momento')
    .select('momento_id')
    .eq('obra_id', obraId)
    .contains('fase_ids', [faseId])

  if (!tarefas?.length) return

  const momentoIds = [...new Set(tarefas.map(t => t.momento_id))]
  for (const momentoId of momentoIds) {
    await recalcularMomento(momentoId, obraId)
  }
}
