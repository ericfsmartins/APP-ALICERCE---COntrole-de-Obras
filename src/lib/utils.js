import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value) {
  if (value == null || isNaN(value)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(dateStr, fmt = 'dd/MM/yyyy') {
  if (!dateStr) return '—'
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr + 'T12:00:00') : dateStr
    return isValid(date) ? format(date, fmt, { locale: ptBR }) : '—'
  } catch {
    return '—'
  }
}

export function formatPercent(value, decimals = 1) {
  if (value == null || isNaN(value)) return '0%'
  return `${Number(value).toFixed(decimals)}%`
}

export function calcDesvio(realizado, estimado) {
  if (!estimado || estimado === 0) return 0
  return ((realizado - estimado) / estimado) * 100
}

export function calcDiasRestantes(dataFim) {
  if (!dataFim) return null
  const fim = new Date(dataFim + 'T12:00:00')
  const hoje = new Date()
  return Math.ceil((fim - hoje) / 86400000)
}

export function calcPctTempo(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return 0
  const inicio = new Date(dataInicio + 'T12:00:00')
  const fim = new Date(dataFim + 'T12:00:00')
  const hoje = new Date()
  const total = fim - inicio
  const decorrido = hoje - inicio
  if (total <= 0) return 100
  return Math.min(100, Math.max(0, (decorrido / total) * 100))
}

export function getStatusColor(status) {
  const map = {
    planejamento:  'bg-slate-100 text-slate-700',
    em_andamento:  'bg-blue-100 text-blue-700',
    concluida:     'bg-green-100 text-green-700',
    concluido:     'bg-green-100 text-green-700',
    pausada:       'bg-amber-100 text-amber-700',
    pausado:       'bg-amber-100 text-amber-700',
    bloqueado:     'bg-red-100 text-red-700',
    nao_iniciado:  'bg-slate-100 text-slate-500',
  }
  return map[status] || 'bg-slate-100 text-slate-600'
}

export function getStatusLabel(status) {
  const map = {
    planejamento:  'Planejamento',
    em_andamento:  'Em andamento',
    concluida:     'Concluída',
    concluido:     'Concluído',
    pausada:       'Pausada',
    pausado:       'Pausado',
    bloqueado:     'Bloqueado',
    nao_iniciado:  'Não iniciado',
    pendente:      'Pendente',
    pago:          'Pago',
    vencido:       'Vencido',
    nao_cotado:    'Não cotado',
    cotado:        'Cotado',
    aprovado:      'Aprovado',
    comprado:      'Comprado',
    entregue:      'Entregue',
  }
  return map[status] || status
}

export function classifyABC(insumos) {
  if (!insumos?.length) return []
  const sorted = [...insumos].sort((a, b) => (b.valor_orcado || 0) - (a.valor_orcado || 0))
  const total = sorted.reduce((sum, i) => sum + (i.valor_orcado || 0), 0)
  let cumulative = 0
  return sorted.map((ins, idx) => {
    cumulative += (ins.valor_orcado || 0)
    const pct = total > 0 ? (cumulative / total) * 100 : 0
    const classe = pct <= 70 ? 'A' : pct <= 90 ? 'B' : 'C'
    return { ...ins, ranking: idx + 1, classe, peso_percentual: total > 0 ? ((ins.valor_orcado || 0) / total) * 100 : 0 }
  })
}
