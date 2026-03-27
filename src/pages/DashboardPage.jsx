import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import {
  DollarSign, TrendingUp, Layers, Clock,
  AlertTriangle, CheckCircle2, ArrowRight,
  Loader2, Building2, BarChart3, Zap,
  Wallet, Calendar, Receipt
} from 'lucide-react'
import TimelineObra from '@/components/TimelineObra'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { formatCurrency, formatDate, formatPercent, calcDesvio, calcDiasRestantes, getStatusColor, getStatusLabel, cn } from '@/lib/utils'

/* ─── Paleta ─────────────────────────────────────────────── */
const ACCENT  = '#D4A84B'
const DARK    = '#0F2044'
const MUTED   = '#7A8BA6'
const BORDER  = '#DDE3EE'
const BLUE    = '#3b82f6'
const GREEN   = '#22c55e'
const AMBER   = '#f59e0b'
const RED     = '#ef4444'
const COLORS  = [ACCENT, DARK, BLUE, GREEN, AMBER]

/* ─── Helpers inline ─────────────────────────────────────── */
function KpiCard({ title, value, sub, icon: Icon, accent, badge, badgeColor }) {
  return (
    <div className="card-base p-5 relative overflow-hidden">
      <div className={cn('absolute top-0 left-0 right-0 h-1 rounded-t-xl')} style={{ background: accent }} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-brand-muted mb-1">{title}</p>
          <p className="text-xl font-display font-bold text-brand-dark leading-tight truncate">{value}</p>
          {sub && <p className="text-[11px] text-brand-muted mt-1 leading-tight">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accent + '20' }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
      </div>
      {badge && (
        <div className={cn('mt-3 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full', badgeColor)}>
          {badge}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children, sub }) {
  return (
    <div className="mb-4">
      <h2 className="font-display font-bold text-brand-dark text-base">{children}</h2>
      {sub && <p className="text-[11px] text-brand-muted mt-0.5">{sub}</p>}
    </div>
  )
}

/* ─── Tooltip customizado ────────────────────────────────── */
function CurrencyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-brand-border rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-brand-dark mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
      ))}
    </div>
  )
}

function PctTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-brand-border rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-brand-dark mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {Number(p.value).toFixed(1)}%</p>
      ))}
    </div>
  )
}

/* ─── Curva S ────────────────────────────────────────────── */
function gerarCurvaS(despesas, obra) {
  const inicio = obra.data_inicio ? new Date(obra.data_inicio + 'T12:00:00') : new Date()
  const fim    = obra.data_fim_prevista ? new Date(obra.data_fim_prevista + 'T12:00:00') : new Date()
  const hoje   = new Date()
  const duracaoMeses = Math.max(2, Math.round((fim - inicio) / (1000 * 60 * 60 * 24 * 30)))
  const totalOrcado  = obra.orcamento_total || 1

  // acumula gastos reais por mês
  const gastosMes = {}
  ;(despesas || []).forEach(d => {
    const dt = d.data_lancamento ? new Date(d.data_lancamento + 'T12:00:00') : new Date(d.created_at)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    gastosMes[key] = (gastosMes[key] || 0) + (d.valor || 0)
  })

  const pontos = []
  let acumReal = 0
  for (let i = 0; i <= Math.min(duracaoMeses, 30); i++) {
    const mes = new Date(inicio)
    mes.setMonth(mes.getMonth() + i)
    const label = mes.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    const key = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}`
    const previsto = parseFloat(Math.min(100, (i / duracaoMeses) * 100).toFixed(1))
    let realizado = null
    if (mes <= hoje) {
      acumReal += gastosMes[key] || 0
      realizado = parseFloat(Math.min(100, (acumReal / totalOrcado) * 100).toFixed(1))
    }
    pontos.push({ mes: label, previsto, realizado })
  }
  return pontos
}

/* ─── Page ───────────────────────────────────────────────── */
export default function DashboardPage() {
  const { obraAtiva } = useObra()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (obraAtiva) load()
  }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    try {
      const [
        { data: fases },
        { data: despesas },
        { data: momentos },
        { data: insumos },
        { data: ultimasDespesas },
        { data: contaRaw },
        { data: parcelasRaw },
      ] = await Promise.all([
        supabase.from('fases').select('*').eq('obra_id', obraAtiva.id).order('numero'),
        supabase.from('despesas').select('*').eq('obra_id', obraAtiva.id).order('data_lancamento', { ascending: false }),
        supabase.from('momentos').select('*').eq('obra_id', obraAtiva.id).order('numero'),
        supabase.from('insumos').select('*').eq('obra_id', obraAtiva.id).order('ranking'),
        supabase.from('despesas').select('*').eq('obra_id', obraAtiva.id).order('created_at', { ascending: false }).limit(6),
        supabase.from('conta_obra').select('*').eq('obra_id', obraAtiva.id).single(),
        supabase.from('parcelas_financiamento').select('*').eq('obra_id', obraAtiva.id).eq('status', 'aguardando').order('data_prevista').limit(1),
      ])

      const totalGasto   = (despesas || []).reduce((s, d) => s + Number(d.valor || 0), 0)
      const totalEstFase = (fases || []).reduce((s, f) => s + Number(f.total_estimado || 0), 0)
      const totalOrcado  = obraAtiva.orcamento_total || totalEstFase || 1
      const totalInsumos = (insumos || []).reduce((s, i) => s + Number(i.valor_orcado || 0), 0)

      const pctGasto = totalOrcado > 0 ? (totalGasto / totalOrcado) * 100 : 0
      const pctFisico = fases?.length
        ? (fases || []).reduce((s, f) => s + (f.percentual_concluido || 0), 0) / fases.length
        : 0

      const fasesPorStatus = {
        planejamento: (fases || []).filter(f => f.status === 'planejamento').length,
        em_andamento: (fases || []).filter(f => f.status === 'em_andamento').length,
        concluida:    (fases || []).filter(f => f.status === 'concluida').length,
        pausada:      (fases || []).filter(f => f.status === 'pausada').length,
      }

      // Fases em andamento (próximas = não concluídas com estimado)
      const proximasFases = (fases || [])
        .filter(f => f.status !== 'concluida')
        .slice(0, 5)

      // Top fases por orçamento
      const custoPorFase = (fases || [])
        .filter(f => (f.total_estimado || 0) > 0)
        .sort((a, b) => b.total_estimado - a.total_estimado)
        .slice(0, 8)
        .map(f => ({
          nome: f.nome.replace(/^\d+\.\s*/, '').split(':')[0].trim().slice(0, 22),
          estimado: Number(f.total_estimado || 0),
          realizado: Number(f.total_realizado || 0),
        }))

      // Distribuição de custo (despesas reais)
      const tipoMap = {
        mao_obra:    'Mão de Obra',
        material:    'Materiais',
        servico:     'Serviços',
        equipamento: 'Equip.',
        outro:       'Outros',
      }
      const composicao = Object.entries(
        (despesas || []).reduce((acc, d) => {
          const k = tipoMap[d.tipo] || 'Outros'
          acc[k] = (acc[k] || 0) + Number(d.valor || 0)
          return acc
        }, {})
      ).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))

      // Insumos Classe A
      const insumosA = (insumos || [])
        .filter(i => i.classe === 'A')
        .sort((a, b) => (b.peso_percentual || 0) - (a.peso_percentual || 0))
        .slice(0, 8)

      // Alertas
      const alertas = []
      const diasRestantes = calcDiasRestantes(obraAtiva.data_fim_prevista)
      if (diasRestantes !== null && diasRestantes < 0) {
        alertas.push({ tipo: 'danger', msg: `Obra com ${Math.abs(diasRestantes)} dias de atraso no prazo.` })
      } else if (diasRestantes !== null && diasRestantes <= 30) {
        alertas.push({ tipo: 'warning', msg: `Apenas ${diasRestantes} dias até o prazo final.` })
      }
      if (pctGasto > 90 && pctFisico < 70) {
        alertas.push({ tipo: 'danger', msg: `${formatPercent(pctGasto)} do orçamento consumido com apenas ${formatPercent(pctFisico)} de avanço físico.` })
      } else if (pctGasto > totalOrcado * 0.75 && pctFisico < 50) {
        alertas.push({ tipo: 'warning', msg: `Gasto acima de 75% do orçado com menos de 50% de avanço.` })
      }
      const fasesAtrasadas = (fases || []).filter(f => f.status === 'pausada')
      if (fasesAtrasadas.length > 0) {
        alertas.push({ tipo: 'warning', msg: `${fasesAtrasadas.length} fase(s) pausadas. Verifique impedimentos.` })
      }
      if (totalGasto > totalOrcado) {
        alertas.push({ tipo: 'danger', msg: `Estouro de orçamento: gasto ${formatCurrency(totalGasto - totalOrcado)} acima do orçado.` })
      }

      const curvaS = gerarCurvaS(despesas || [], obraAtiva)

      // Conta financeira
      const saldoDisponivel = contaRaw?.saldo_atual ?? null
      const proximaParcela  = parcelasRaw?.[0] ?? null

      // Comprometido: despesas pendentes
      const totalComprometido = (despesas || [])
        .filter(d => d.status_pagamento === 'pendente')
        .reduce((s, d) => s + Number(d.valor || 0), 0)

      setData({
        totalGasto, totalOrcado, totalEstFase, totalInsumos,
        pctGasto, pctFisico, fasesPorStatus,
        proximasFases: proximasFases || [],
        custoPorFase, composicao, insumosA,
        ultimasDespesas: ultimasDespesas || [],
        curvaS, alertas, diasRestantes,
        totalFases: (fases || []).length,
        momentos: momentos || [],
        fases: fases || [],
        saldoDisponivel, proximaParcela, totalComprometido,
        limiteAlerta: contaRaw?.limite_alerta ?? 10000,
      })
    } finally {
      setLoading(false)
    }
  }

  /* ── Empty / Loading ── */
  if (!obraAtiva) return (
    <div className="text-center py-24 text-brand-muted">
      <Building2 size={44} className="mx-auto mb-4 opacity-30" />
      <p className="font-medium">Selecione uma obra para ver o painel.</p>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={32} className="animate-spin text-brand-accent" />
    </div>
  )

  const { diasRestantes } = data
  const desvio = calcDesvio(data.totalGasto, data.totalOrcado)

  /* ── Badges KPI ── */
  const gastoBadge = desvio > 10
    ? { text: `+${desvio.toFixed(0)}% acima`, color: 'bg-red-50 text-red-600' }
    : desvio < -5
    ? { text: `${Math.abs(desvio).toFixed(0)}% abaixo`, color: 'bg-green-50 text-green-700' }
    : null

  const prazoBadge = diasRestantes == null ? null
    : diasRestantes < 0 ? { text: `${Math.abs(diasRestantes)}d atrasado`, color: 'bg-red-50 text-red-600' }
    : diasRestantes <= 30 ? { text: `${diasRestantes}d restantes`, color: 'bg-amber-50 text-amber-700' }
    : { text: `${diasRestantes}d restantes`, color: 'bg-green-50 text-green-700' }

  return (
    <div className="space-y-7 pb-8">

      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark leading-tight">{obraAtiva.nome}</h1>
          <p className="text-sm text-brand-muted mt-0.5">
            {obraAtiva.endereco || 'Endereço não informado'}
            {obraAtiva.area_construida ? ` · ${obraAtiva.area_construida} m²` : ''}
            {obraAtiva.area_construida && data.totalOrcado
              ? ` · ${formatCurrency(data.totalOrcado / obraAtiva.area_construida)}/m²`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-brand-muted flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Atualizado agora
        </div>
      </div>

      {/* ── Alertas ────────────────────────────── */}
      {data.alertas.length > 0 && (
        <div className="space-y-2">
          {data.alertas.map((a, i) => (
            <div key={i} className={cn(
              'flex items-start gap-3 rounded-xl px-4 py-3 text-sm border',
              a.tipo === 'danger'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            )}>
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* ── KPIs ───────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Orçamento Total"
          value={formatCurrency(data.totalOrcado)}
          sub={obraAtiva.area_construida ? `${formatCurrency(data.totalOrcado / obraAtiva.area_construida)}/m²` : 'Valor global da obra'}
          icon={DollarSign}
          accent={ACCENT}
        />
        <KpiCard
          title="Total Gasto"
          value={formatCurrency(data.totalGasto)}
          sub={`${formatPercent(data.pctGasto)} do orçado`}
          icon={BarChart3}
          accent={desvio > 10 ? RED : desvio > 0 ? AMBER : ACCENT}
          badge={gastoBadge?.text}
          badgeColor={gastoBadge?.color}
        />
        <KpiCard
          title="Fases"
          value={`${data.fasesPorStatus.concluida}/${data.totalFases}`}
          sub={`${data.fasesPorStatus.em_andamento} em andamento · ${data.fasesPorStatus.planejamento} pendentes`}
          icon={Layers}
          accent={BLUE}
        />
        <KpiCard
          title="Progresso Médio"
          value={formatPercent(data.pctFisico)}
          sub={`Avanço financeiro das fases`}
          icon={TrendingUp}
          accent={data.pctFisico >= 80 ? GREEN : data.pctFisico >= 40 ? ACCENT : MUTED}
          badge={prazoBadge?.text}
          badgeColor={prazoBadge?.color}
        />
      </div>

      {/* ── KPIs Financeiros ────────────────────── */}
      {data.saldoDisponivel !== null && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(() => {
            const orcado = data.totalOrcado || 1
            const saldo  = data.saldoDisponivel
            const saldoColor = saldo > orcado * 0.2 ? GREEN : saldo > orcado * 0.05 ? AMBER : RED
            const proxP  = data.proximaParcela
            const dias   = proxP ? Math.ceil((new Date(proxP.data_prevista + 'T12:00:00') - new Date()) / 86400000) : null
            const comprometido = data.totalComprometido
            const compColor = comprometido > saldo ? RED : comprometido > saldo * 0.7 ? AMBER : GREEN
            return (<>
              <KpiCard
                title="Saldo Disponível"
                value={formatCurrency(saldo)}
                sub="Conta da obra"
                icon={Wallet}
                accent={saldoColor}
                badge={saldo < data.limiteAlerta ? '⚠ Saldo baixo' : null}
                badgeColor="bg-red-50 text-red-600"
              />
              <KpiCard
                title="Próxima Parcela"
                value={proxP ? formatCurrency(proxP.valor) : '—'}
                sub={proxP && dias !== null ? `em ${dias} dias` : 'Nenhuma programada'}
                icon={Calendar}
                accent={dias !== null && dias <= 7 ? AMBER : BLUE}
                badge={dias !== null && dias <= 7 ? `Vence em ${dias}d` : null}
                badgeColor="bg-amber-50 text-amber-700"
              />
              <KpiCard
                title="Total Comprometido"
                value={formatCurrency(comprometido)}
                sub="Despesas pendentes"
                icon={Receipt}
                accent={compColor}
                badge={comprometido > saldo ? 'Acima do saldo' : null}
                badgeColor="bg-red-50 text-red-600"
              />
            </>)
          })()}
        </div>
      )}

      {/* ── Timeline da Obra ────────────────────── */}
      <TimelineObra fases={data.fases} config={obraAtiva} />

      {/* ── Conciliação Orçamentária ──────────── */}
      <div className="card-base p-5">
        <div className="gradient-bar" />
        <div className="flex items-center justify-between mb-4">
          <SectionTitle sub="Comparativo entre base orçada, insumos configurados e realizado">
            Conciliação Orçamentária
          </SectionTitle>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Base Orçada', value: data.totalOrcado, color: DARK, sub: '100%' },
            { label: 'Insumos Config.', value: data.totalInsumos, color: BLUE,
              sub: data.totalOrcado > 0 ? formatPercent((data.totalInsumos / data.totalOrcado) * 100) : '—' },
            { label: 'Total Realizado', value: data.totalGasto, color: ACCENT,
              sub: data.totalOrcado > 0 ? formatPercent((data.totalGasto / data.totalOrcado) * 100) : '—' },
            { label: 'Saldo Restante', value: data.totalOrcado - data.totalGasto, color: data.totalGasto > data.totalOrcado ? RED : GREEN,
              sub: data.totalOrcado > 0 ? formatPercent(Math.abs(((data.totalOrcado - data.totalGasto) / data.totalOrcado) * 100)) : '—' },
          ].map((item) => (
            <div key={item.label} className="bg-brand-bg rounded-xl p-4">
              <p className="text-[11px] text-brand-muted mb-1">{item.label}</p>
              <p className="text-base font-display font-bold" style={{ color: item.color }}>
                {formatCurrency(item.value)}
              </p>
              <p className="text-[11px] text-brand-muted mt-0.5">{item.sub}</p>
            </div>
          ))}
        </div>
        {/* barra de progresso */}
        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-brand-muted mb-1">
            <span>Realizado</span>
            <span>{formatPercent(data.pctGasto)} do orçamento</span>
          </div>
          <div className="h-2.5 bg-brand-bg rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, data.pctGasto)}%`,
                background: data.pctGasto > 100 ? RED : data.pctGasto > 75 ? AMBER : ACCENT,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Gráficos principais ───────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Orçamento por Fase — horizontal bar */}
        <div className="card-base p-5 xl:col-span-3">
          <div className="gradient-bar" />
          <SectionTitle sub="Top 8 fases por orçamento">Orçamento por Fase</SectionTitle>
          {data.custoPorFase.length === 0 ? (
            <p className="text-sm text-brand-muted text-center py-8">Nenhuma fase com orçamento definido.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.custoPorFase} layout="vertical" margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
                <XAxis type="number" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: MUTED }} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: MUTED }} width={110} />
                <Tooltip content={<CurrencyTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="estimado"  name="Estimado"  fill={BORDER} radius={[0,4,4,0]} />
                <Bar dataKey="realizado" name="Realizado" fill={ACCENT} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Distribuição de Custos donut */}
        <div className="card-base p-5 xl:col-span-2">
          <div className="gradient-bar" />
          <SectionTitle sub="Por tipo de despesa lançada">Composição de Custos</SectionTitle>
          {data.composicao.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-brand-muted">
              <Zap size={24} className="mb-2 opacity-40" />
              <p className="text-sm">Nenhuma despesa lançada.</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={data.composicao} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                    paddingAngle={2}>
                    {data.composicao.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {data.composicao.map((c, idx) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[idx % COLORS.length] }} />
                    <span className="text-brand-muted flex-1">{c.name}</span>
                    <span className="font-medium text-brand-dark">{formatCurrency(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Curva S ───────────────────────────── */}
      <div className="card-base p-5">
        <div className="gradient-bar" />
        <SectionTitle sub="Execução acumulada prevista × realizada">Curva S — Execução da Obra</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.curvaS} margin={{ right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: MUTED }} />
            <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: MUTED }} domain={[0, 100]} />
            <Tooltip content={<PctTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="previsto"  name="Previsto"  stroke={DARK}  strokeWidth={2} dot={false} strokeDasharray="5 3" />
            <Line type="monotone" dataKey="realizado" name="Realizado" stroke={ACCENT} strokeWidth={2.5} dot={false}
              connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Bottom row ────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Últimas Despesas */}
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <SectionTitle>Últimas Despesas</SectionTitle>
          {data.ultimasDespesas.length === 0 ? (
            <p className="text-sm text-brand-muted text-center py-6">Nenhuma despesa lançada.</p>
          ) : (
            <div className="space-y-0">
              {data.ultimasDespesas.map(d => (
                <div key={d.id} className="flex items-center gap-3 py-2.5 border-b border-brand-border last:border-0">
                  <div className={cn('w-1.5 h-9 rounded-full flex-shrink-0',
                    d.tipo === 'mao_obra'    ? 'bg-blue-400'   :
                    d.tipo === 'material'    ? 'bg-amber-400'  :
                    d.tipo === 'servico'     ? 'bg-green-400'  :
                    d.tipo === 'equipamento' ? 'bg-purple-400' : 'bg-slate-300'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-brand-dark truncate">{d.descricao}</p>
                    <p className="text-[10px] text-brand-muted">{formatDate(d.data_lancamento)} · {d.fornecedor_nome || 'Fornecedor n/i'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-brand-accent">{formatCurrency(d.valor)}</p>
                    <p className={cn('text-[10px]',
                      d.status_pagamento === 'pago' ? 'text-green-600' : 'text-amber-600'
                    )}>{d.status_pagamento === 'pago' ? 'Pago' : 'Pendente'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Próximas Fases */}
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <SectionTitle>Próximas Fases</SectionTitle>
          {data.proximasFases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-brand-muted">
              <CheckCircle2 size={24} className="mb-2 text-green-400" />
              <p className="text-sm">Todas as fases concluídas!</p>
            </div>
          ) : (
            <div className="space-y-0">
              {data.proximasFases.map(fase => (
                <div key={fase.id} className="flex items-center gap-3 py-2.5 border-b border-brand-border last:border-0">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0',
                    fase.status === 'em_andamento' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                  )}>{fase.numero}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-brand-dark truncate">
                      {fase.nome.replace(/^\d+\.\s*/, '').split(':')[0].trim()}
                    </p>
                    <p className="text-[10px] text-brand-muted">{formatCurrency(fase.total_estimado)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', getStatusColor(fase.status))}>
                      {getStatusLabel(fase.status)}
                    </span>
                    {(fase.percentual_concluido || 0) > 0 && (
                      <p className="text-[10px] text-brand-muted">{fase.percentual_concluido}%</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Progresso Geral */}
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <SectionTitle>Progresso Geral</SectionTitle>

          {/* Ring de progresso */}
          <div className="flex items-center gap-4 mb-5">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke={BORDER} strokeWidth="8" />
                <circle cx="40" cy="40" r="32" fill="none" stroke={ACCENT} strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 32}`}
                  strokeDashoffset={`${2 * Math.PI * 32 * (1 - data.pctFisico / 100)}`}
                  strokeLinecap="round" className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-brand-dark">{Math.round(data.pctFisico)}%</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-display font-bold text-brand-dark">Avanço Financeiro</p>
              <p className="text-[11px] text-brand-muted mt-0.5">Média de todas as fases</p>
            </div>
          </div>

          {/* Status breakdown */}
          <div className="space-y-2.5">
            {[
              { label: 'Concluídas',    count: data.fasesPorStatus.concluida,    color: 'bg-green-400', total: data.totalFases },
              { label: 'Em andamento',  count: data.fasesPorStatus.em_andamento, color: 'bg-blue-400',  total: data.totalFases },
              { label: 'Planejamento',  count: data.fasesPorStatus.planejamento, color: 'bg-slate-300', total: data.totalFases },
              { label: 'Pausadas',      count: data.fasesPorStatus.pausada,      color: 'bg-amber-400', total: data.totalFases },
            ].map(({ label, count, color, total }) => (
              <div key={label}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-brand-muted">{label}</span>
                  <span className="font-medium text-brand-dark">{count}/{total}</span>
                </div>
                <div className="h-1.5 bg-brand-bg rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', color)}
                    style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Insumos Críticos Classe A ──────────── */}
      {data.insumosA.length > 0 && (
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <div className="flex items-center justify-between mb-4">
            <SectionTitle sub="Insumos com maior impacto financeiro (70% do orçamento)">
              Insumos Críticos — Classe A
            </SectionTitle>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
              {data.insumosA.length} insumos
            </span>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {data.insumosA.map(ins => {
              const pct = ins.valor_orcado > 0 ? Math.min(100, ((ins.valor_realizado || 0) / ins.valor_orcado) * 100) : 0
              const statusColors = {
                nao_cotado: 'text-slate-500 bg-slate-50',
                cotado:     'text-blue-600 bg-blue-50',
                aprovado:   'text-indigo-600 bg-indigo-50',
                comprado:   'text-amber-600 bg-amber-50',
                entregue:   'text-green-600 bg-green-50',
              }
              return (
                <div key={ins.id} className="bg-brand-bg rounded-xl p-3 border border-brand-border">
                  <div className="flex items-start justify-between gap-1 mb-2">
                    <p className="text-[11px] font-medium text-brand-dark leading-tight line-clamp-2">{ins.nome}</p>
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0', statusColors[ins.status] || 'text-slate-500 bg-slate-50')}>
                      {getStatusLabel(ins.status)}
                    </span>
                  </div>
                  <div className="space-y-0.5 mb-2">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-brand-muted">Peso</span>
                      <span className="font-medium text-brand-dark">{(ins.peso_percentual || 0).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-brand-muted">Orçado</span>
                      <span className="font-medium text-brand-dark">{formatCurrency(ins.valor_orcado)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-brand-muted">Realizado</span>
                      <span className="font-medium text-brand-accent">{formatCurrency(ins.valor_realizado || 0)}</span>
                    </div>
                  </div>
                  <div className="h-1 bg-white rounded-full overflow-hidden border border-brand-border">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: pct > 100 ? RED : pct > 75 ? AMBER : ACCENT,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Momentos / Cronograma ─────────────── */}
      {data.momentos.length > 0 && (
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <SectionTitle sub="Status de cada etapa do cronograma">Etapas do Cronograma</SectionTitle>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {data.momentos.slice(0, 6).map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 bg-brand-bg rounded-xl border border-brand-border">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  m.status === 'concluido'    ? 'bg-green-100 text-green-700' :
                  m.status === 'em_andamento' ? 'bg-blue-100 text-blue-700'  :
                  m.status === 'bloqueado'    ? 'bg-red-100 text-red-700'    :
                  'bg-slate-100 text-slate-600'
                )}>
                  {m.status === 'concluido' ? <CheckCircle2 size={14} /> : `M${m.numero}`}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-brand-dark truncate">{m.nome.split('—')[0].trim()}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 bg-white rounded-full overflow-hidden border border-brand-border">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${m.percentual_concluido || 0}%`,
                          background: m.status === 'concluido' ? GREEN : ACCENT
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-brand-muted flex-shrink-0">{m.percentual_concluido || 0}%</span>
                  </div>
                </div>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0', getStatusColor(m.status))}>
                  {getStatusLabel(m.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
