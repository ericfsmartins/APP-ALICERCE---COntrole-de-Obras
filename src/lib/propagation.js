/**
 * Motor de propagação entre os 3 controles:
 * Fases SINAPI ↔ Insumos/Despesas ↔ Momentos
 */
import { supabase } from './supabase'

/**
 * Calcula percentual de progresso de uma fase pelo critério financeiro:
 * - realizado <= orçado: realizado / orçado (progresso conservador)
 * - realizado >  orçado: orçado / realizado (penaliza estouro, evita >100%)
 */
function calcPctFase(realizado, orcado) {
  if (!orcado || orcado === 0) return realizado > 0 ? 100 : 0
  if (realizado <= orcado) return Math.min(100, (realizado / orcado) * 100)
  return (orcado / realizado) * 100
}

/**
 * Recalcula total_realizado e percentual_concluido de uma fase
 * somando todas as despesas vinculadas a ela.
 */
async function recalcularFase(faseId, obraId) {
  const [{ data: despesas }, { data: fase }] = await Promise.all([
    supabase.from('despesas').select('valor').eq('obra_id', obraId).eq('fase_id', faseId),
    supabase.from('fases').select('total_estimado').eq('id', faseId).single(),
  ])
  const totalRealizado = (despesas || []).reduce((s, d) => s + Number(d.valor || 0), 0)
  const orcado = fase?.total_estimado || 0
  const pct = calcPctFase(totalRealizado, orcado)
  const novoStatus = pct >= 100 ? 'concluida' : totalRealizado > 0 ? 'em_andamento' : 'planejamento'

  await supabase.from('fases').update({
    total_realizado: totalRealizado,
    percentual_concluido: Number(pct.toFixed(1)),
    status: novoStatus,
  }).eq('id', faseId)
}

/**
 * Recalcula custo_realizado de um momento
 * somando todas as despesas vinculadas a ele.
 */
async function recalcularCustoMomento(momentoId, obraId) {
  const { data: despesas } = await supabase
    .from('despesas').select('valor').eq('obra_id', obraId).eq('momento_id', momentoId)
  const custoRealizado = (despesas || []).reduce((s, d) => s + Number(d.valor || 0), 0)
  await supabase.from('momentos').update({ custo_realizado: custoRealizado }).eq('id', momentoId)
}

/**
 * Ao lançar/editar/excluir uma despesa com insumo_id:
 * Resolve a fase e o momento do insumo e propaga automaticamente.
 */
export async function propagarDespesaViaInsumo({ obraId, insumoId }) {
  if (!insumoId) return
  const { data: insumo } = await supabase
    .from('insumos').select('fase_id,momento_id').eq('id', insumoId).single()
  if (!insumo) return

  const updates = []
  if (insumo.fase_id)    updates.push(recalcularFase(insumo.fase_id, obraId))
  if (insumo.momento_id) updates.push(recalcularCustoMomento(insumo.momento_id, obraId))
  await Promise.all(updates)
}

/**
 * Ao lançar uma despesa com fase_id/momento_id explícitos:
 * Atualiza total_realizado da fase e custo do momento.
 */
export async function propagarDespesa({ obraId, faseId, momentoId }) {
  const updates = []
  if (faseId)    updates.push(recalcularFase(faseId, obraId))
  if (momentoId) updates.push(recalcularCustoMomento(momentoId, obraId))
  await Promise.all(updates)
}

/**
 * Ao mudar status do insumo para 'comprado' ou 'entregue':
 * Marca tarefa do momento correspondente como concluída/em andamento.
 */
export async function propagarInsumo({ obraId, insumoId, faseId, novoStatus }) {
  if (!['comprado', 'entregue'].includes(novoStatus)) return
  if (!faseId) return

  const { data: tarefas } = await supabase
    .from('tarefas_momento')
    .select('id, momento_id, status')
    .eq('obra_id', obraId)
    .eq('tipo', 'aquisicao_critica')
    .contains('fase_ids', [faseId])

  if (!tarefas?.length) return

  for (const tarefa of tarefas) {
    const novoStatusTarefa = novoStatus === 'entregue' ? 'concluida' : 'em_andamento'
    await supabase.from('tarefas_momento').update({
      status: novoStatusTarefa,
      percentual_concluido: novoStatus === 'entregue' ? 100 : 50,
    }).eq('id', tarefa.id)
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
    const { data: todasTarefas } = await supabase
      .from('tarefas_momento')
      .select('status')
      .eq('obra_id', obraId)
      .contains('fase_ids', [faseId])

    if (!todasTarefas?.length) continue
    const concluidas = todasTarefas.filter(t => t.status === 'concluida').length
    const pct = Math.round((concluidas / todasTarefas.length) * 100)
    await supabase.from('fases').update({ percentual_concluido: pct }).eq('id', faseId).eq('obra_id', obraId)
  }

  await recalcularMomento(momentoId, obraId)
}

/**
 * Recalcula percentual_concluido de um Momento com base nas tarefas.
 */
export async function recalcularMomento(momentoId, obraId) {
  const { data: tarefas } = await supabase
    .from('tarefas_momento').select('status').eq('momento_id', momentoId).eq('obra_id', obraId)

  if (!tarefas?.length) return

  const concluidas = tarefas.filter(t => t.status === 'concluida').length
  const pct = Math.round((concluidas / tarefas.length) * 100)
  const novoStatus = pct === 100 ? 'concluido' : pct > 0 ? 'em_andamento' : 'nao_iniciado'

  await supabase.from('momentos').update({ percentual_concluido: pct, status: novoStatus }).eq('id', momentoId)

  if (novoStatus === 'concluido') await verificarDesbloqueio(momentoId, obraId)
}

/**
 * Verifica e desbloqueia momentos que tinham este como prerequisito.
 */
async function verificarDesbloqueio(momentoConcluidoId, obraId) {
  const { data: momentos } = await supabase
    .from('momentos').select('id, prerequisito_ids, status').eq('obra_id', obraId).eq('status', 'bloqueado')
  if (!momentos?.length) return

  for (const momento of momentos) {
    const prereqs = momento.prerequisito_ids || []
    if (!prereqs.includes(momentoConcluidoId)) continue
    const { data: concluidos } = await supabase
      .from('momentos').select('id').in('id', prereqs).eq('status', 'concluido')
    if (concluidos?.length === prereqs.length) {
      await supabase.from('momentos').update({ status: 'nao_iniciado' }).eq('id', momento.id)
    }
  }
}

/**
 * Ao atualizar percentual_concluido de uma Fase:
 * Recalcula momentos que contêm tarefas vinculadas a esta fase.
 */
export async function propagarFase({ obraId, faseId }) {
  const { data: tarefas } = await supabase
    .from('tarefas_momento').select('momento_id').eq('obra_id', obraId).contains('fase_ids', [faseId])
  if (!tarefas?.length) return

  const momentoIds = [...new Set(tarefas.map(t => t.momento_id))]
  for (const momentoId of momentoIds) await recalcularMomento(momentoId, obraId)
}
