import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import {
  DollarSign, Activity, Clock, Layers,
  AlertCircle, Loader2
} from 'lucide-react'
import StatCard from '@/components/StatCard'
import ProgressRing from '@/components/ProgressRing'
import { formatCurrency, formatDate, formatPercent, calcDesvio, calcDiasRestantes, getStatusColor, getStatusLabel, cn } from '@/lib/utils'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

export default function DashboardPage() {
  const { obraAtiva } = useObra()
  const [data, setData] = useState(null)
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
        { data: ultimasDespesas },
        { data: proximasFases }
      ] = await Promise.all([
        supabase.from('fases').select('*').eq('obra_id', obraAtiva.id),
        supabase.from('despesas').select('valor,tipo,created_at').eq('obra_id', obraAtiva.id),
        supabase.from('momentos').select('*').eq('obra_id', obraAtiva.id).order('numero'),
        supabase.from('despesas').select('*').eq('obra_id', obraAtiva.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('fases').select('*').eq('obra_id', obraAtiva.id).in('status', ['planejamento','pausada']).order('numero').limit(3),
      ])

      const totalGasto = (despesas || []).reduce((s, d) => s + (d.valor || 0), 0)
      const totalEst = (fases || []).reduce((s, f) => s + (f.total_estimado || 0), 0)
      const pctFisico = fases?.length
        ? (fases || []).reduce((s, f) => s + (f.percentual_concluido || 0), 0) / fases.length
        : 0

      const fasesPorStatus = {
        planejamento: (fases || []).filter(f => f.status === 'planejamento').length,
        em_andamento: (fases || []).filter(f => f.status === 'em_andamento').length,
        concluida:    (fases || []).filter(f => f.status === 'concluida').length,
        pausada:      (fases || []).filter(f => f.status === 'pausada').length,
      }

      // Curva S — dados mensais simulados com base nas despesas reais
      const curvaS = gerarCurvaS(despesas || [], obraAtiva)

      // Custo por fase (top 8)
      const custoPorFase = (fases || [])
        .filter(f => f.total_estimado > 0)
        .sort((a, b) => b.total_estimado - a.total_estimado)
        .slice(0, 8)
        .map(f => ({
          nome: f.nome.split(':')[0].trim().slice(0, 20),
          estimado: f.total_estimado,
          realizado: f.total_realizado || 0,
        }))

      // Composição de custo
      const composicao = [
        { name: 'Mão de Obra', value: (despesas || []).filter(d => d.tipo === 'mao_obra').reduce((s, d) => s + d.valor, 0) },
        { name: 'Materiais',   value: (despesas || []).filter(d => d.tipo === 'material').reduce((s, d) => s + d.valor, 0) },
        { name: 'Serviços',    value: (despesas || []).filter(d => d.tipo === 'servico').reduce((s, d) => s + d.valor, 0) },
        { name: 'Outros',      value: (despesas || []).filter(d => !['mao_obra','material','servico'].includes(d.tipo)).reduce((s, d) => s + d.valor, 0) },
      ].filter(c => c.value > 0)

      // Momento atual em andamento
      const momentoAtual = (momentos || []).find(m => m.status === 'em_andamento')
        || (momentos || []).find(m => m.status === 'nao_iniciado')

      setData({
        totalGasto, totalEst, pctFisico, fasesPorStatus,
        curvaS, custoPorFase, composicao,
        ultimasDespesas: ultimasDespesas || [],
        proximasFases: proximasFases || [],
        momentoAtual, momentos: momentos || [],
      })
    } finally {
      setLoading(false)
    }
  }

  if (!obraAtiva) return (
    <div className="text-center py-20 text-brand-muted">
      <Layers size={40} className="mx-auto mb-3 opacity-40" />
      <p>Selecione uma obra para ver o dashboard.</p>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={32} className="animate-spin text-brand-accent" />
    </div>
  )

  const diasRestantes = calcDiasRestantes(obraAtiva.data_fim_prevista)
  const desvioGeral = calcDesvio(data.totalGasto, data.totalEst)
  const COLORS = ['#1C1F26', '#C87941', '#22C55E', '#9aa3b5']

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-dark">{obraAtiva.nome}</h1>
        <p className="text-sm text-brand-muted">{obraAtiva.endereco}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Gasto"
          value={formatCurrency(data.totalGasto)}
          subtitle={`de ${formatCurrency(obraAtiva.orcamento_total || 0)} orçado`}
          icon={DollarSign}
          color="gold"
          trend={desvioGeral}
        />
        <div className="card-base p-5 flex flex-col items-center justify-center">
          <div className="gradient-bar absolute top-0 left-0 right-0 h-1 rounded-t-xl" />
          <p className="text-xs text-brand-muted mb-2">Avanço Físico</p>
          <ProgressRing percent={data.pctFisico} size={90} strokeWidth={8} />
        </div>
        <StatCard
          title="Prazo"
          value={
            diasRestantes == null ? '—' :
            diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` :
            `${diasRestantes}d restantes`
          }
          subtitle={`Previsão: ${formatDate(obraAtiva.data_fim_prevista)}`}
          icon={Clock}
          color={diasRestantes == null ? 'navy' : diasRestantes < 0 ? 'red' : diasRestantes <= 30 ? 'gold' : 'navy'}
        />
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <p className="text-xs text-brand-muted mb-3">Fases por status</p>
          <div className="space-y-1.5">
            {[
              { label: 'Planejamento', count: data.fasesPorStatus.planejamento, color: 'bg-slate-200' },
              { label: 'Em andamento', count: data.fasesPorStatus.em_andamento, color: 'bg-blue-400'  },
              { label: 'Concluída',    count: data.fasesPorStatus.concluida,    color: 'bg-green-400' },
              { label: 'Pausada',      count: data.fasesPorStatus.pausada,      color: 'bg-amber-400' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <div className={cn("w-2 h-2 rounded-full flex-shrink-0", color)} />
                <span className="text-brand-muted flex-1">{label}</span>
                <span className="font-medium text-brand-dark">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Momento atual */}
      {data.momentoAtual && (
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <div className="flex items-start gap-4">
            <ProgressRing percent={data.momentoAtual.percentual_concluido || 0} size={72} strokeWidth={7} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", getStatusColor(data.momentoAtual.status))}>
                  {getStatusLabel(data.momentoAtual.status)}
                </span>
              </div>
              <h3 className="font-display font-bold text-brand-dark">{data.momentoAtual.nome}</h3>
              <p className="text-xs text-brand-muted mt-1">{data.momentoAtual.descricao}</p>
              {data.momentoAtual.prazo_estimado_min && (
                <p className="text-xs text-brand-muted mt-1">
                  Prazo estimado: {data.momentoAtual.prazo_estimado_min}–{data.momentoAtual.prazo_estimado_max} meses
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Curva S */}
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <h3 className="font-display font-bold text-brand-dark mb-4">Curva S — Previsto × Realizado</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.curvaS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4db" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9aa3b5' }} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#9aa3b5' }} />
              <Tooltip formatter={(v, n) => [`${v.toFixed(1)}%`, n]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="previsto"  stroke="#1C1F26" strokeWidth={2} dot={false} name="Previsto" />
              <Line type="monotone" dataKey="realizado" stroke="#C87941" strokeWidth={2} dot={false} name="Realizado" strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Custo por fase */}
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <h3 className="font-display font-bold text-brand-dark mb-4">Custo por Fase</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.custoPorFase} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4db" />
              <XAxis type="number" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9aa3b5' }} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: '#9aa3b5' }} width={90} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="estimado"  fill="#e8e4db" name="Estimado"  radius={[0,4,4,0]} />
              <Bar dataKey="realizado" fill="#C87941" name="Realizado" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Composição + Widgets */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Composição */}
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <h3 className="font-display font-bold text-brand-dark mb-4">Composição de Custo</h3>
          {data.composicao.length === 0 ? (
            <p className="text-sm text-brand-muted text-center py-8">Nenhuma despesa lançada.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.composicao} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {data.composicao.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Próximas Fases */}
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <h3 className="font-display font-bold text-brand-dark mb-3">Próximas Fases</h3>
          {data.proximasFases.length === 0 ? (
            <p className="text-sm text-brand-muted">Nenhuma fase pendente.</p>
          ) : data.proximasFases.map(fase => (
            <div key={fase.id} className="flex items-center gap-3 py-2 border-b border-brand-border last:border-0">
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">{fase.numero}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-brand-dark truncate">{fase.nome}</p>
                <p className="text-[10px] text-brand-muted">{formatCurrency(fase.total_estimado)}</p>
              </div>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", getStatusColor(fase.status))}>
                {getStatusLabel(fase.status)}
              </span>
            </div>
          ))}
        </div>

        {/* Últimas Despesas */}
        <div className="card-base p-5">
          <div className="gradient-bar" />
          <h3 className="font-display font-bold text-brand-dark mb-3">Últimas Despesas</h3>
          {data.ultimasDespesas.length === 0 ? (
            <p className="text-sm text-brand-muted">Nenhuma despesa lançada.</p>
          ) : data.ultimasDespesas.map(d => (
            <div key={d.id} className="flex items-center gap-2 py-2 border-b border-brand-border last:border-0">
              <div className={cn("w-1.5 h-8 rounded-full flex-shrink-0",
                d.tipo === 'mao_obra'  ? "bg-blue-400" :
                d.tipo === 'material'  ? "bg-amber-400" :
                d.tipo === 'servico'   ? "bg-green-400" : "bg-slate-300"
              )} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-brand-dark truncate">{d.descricao}</p>
                <p className="text-[10px] text-brand-muted">{formatDate(d.data_lancamento)}</p>
              </div>
              <span className="text-xs font-bold text-brand-accent">{formatCurrency(d.valor)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function gerarCurvaS(despesas, obra) {
  // Gera pontos mensais de jan até hoje
  const inicio = obra.data_inicio ? new Date(obra.data_inicio + 'T12:00:00') : new Date()
  const fim = obra.data_fim_prevista ? new Date(obra.data_fim_prevista + 'T12:00:00') : new Date()
  const hoje = new Date()
  const duracaoMeses = Math.max(1, Math.round((fim - inicio) / (1000 * 60 * 60 * 24 * 30)))

  const totalOrcado = obra.orcamento_total || 1
  const totalGasto = despesas.reduce((s, d) => s + (d.valor || 0), 0)

  const pontos = []
  for (let i = 0; i <= Math.min(duracaoMeses, 24); i++) {
    const mes = new Date(inicio)
    mes.setMonth(mes.getMonth() + i)
    const meses_str = mes.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    const pctTempo = i / duracaoMeses
    const previsto = Math.min(100, pctTempo * 100)
    const realizado = mes <= hoje
      ? Math.min(100, (totalGasto / totalOrcado) * 100 * (i / Math.max(1, Math.round((hoje - inicio) / (1000 * 60 * 60 * 24 * 30)))))
      : null
    pontos.push({ mes: meses_str, previsto: parseFloat(previsto.toFixed(1)), realizado: realizado != null ? parseFloat(realizado.toFixed(1)) : null })
  }
  return pontos
}
