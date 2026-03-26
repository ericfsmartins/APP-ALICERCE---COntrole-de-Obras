import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import {
  TrendingUp, FileDown, Loader2, Activity, BarChart2,
  Package, DollarSign, BookOpen, Layers
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn, formatCurrency, formatDate, formatPercent, calcDesvio } from '@/lib/utils'
// jsPDF carregado dinamicamente para evitar problema de pre-bundle do core-js
async function getPDF() {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  return { jsPDF, autoTable }
}

const TIPOS_RELATORIO = [
  { id: 'avanco',     icon: Activity,    label: 'Avanço Físico',        desc: 'Progresso de cada fase vs. previsto' },
  { id: 'medicao',    icon: BarChart2,   label: 'Boletim de Medição',   desc: 'Valores executados por período e fase' },
  { id: 'insumos',    icon: Package,     label: 'Relatório de Insumos', desc: 'Tabela ABC com variações orçamentárias' },
  { id: 'financeiro', icon: DollarSign,  label: 'Relatório Financeiro', desc: 'Orçado × executado com projeção de custo final' },
  { id: 'diario',     icon: BookOpen,    label: 'Diário de Obra',       desc: 'Todas as entradas do diário no período' },
]

export default function RelatoriosPage() {
  const { obraAtiva } = useObra()
  const [ativo, setAtivo]         = useState('avanco')
  const [loading, setLoading]     = useState(false)
  const [dados, setDados]         = useState(null)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim]     = useState('')
  const [faseSel, setFaseSel]     = useState('')
  const [fases, setFases]         = useState([])

  useEffect(() => {
    if (obraAtiva) {
      supabase.from('fases').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero')
        .then(({ data }) => setFases(data || []))
      carregarDados(ativo)
    }
  }, [obraAtiva?.id])

  async function carregarDados(tipo) {
    if (!obraAtiva) return
    setLoading(true)
    setAtivo(tipo)
    try {
      switch (tipo) {
        case 'avanco':    await loadAvanco();    break
        case 'medicao':   await loadMedicao();   break
        case 'insumos':   await loadInsumos();   break
        case 'financeiro':await loadFinanceiro(); break
        case 'diario':    await loadDiario();    break
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadAvanco() {
    const { data } = await supabase.from('fases').select('*').eq('obra_id', obraAtiva.id).order('numero')
    setDados({ fases: data || [] })
  }

  async function loadMedicao() {
    let q = supabase.from('despesas').select('*').eq('obra_id', obraAtiva.id)
    if (dataInicio) q = q.gte('data_lancamento', dataInicio)
    if (dataFim)    q = q.lte('data_lancamento', dataFim)
    if (faseSel)    q = q.eq('fase_id', faseSel)
    const { data: desp } = await q.order('data_lancamento', { ascending: false })
    const { data: fases } = await supabase.from('fases').select('*').eq('obra_id', obraAtiva.id).order('numero')
    const porFase = (fases || []).map(f => {
      const despFase = (desp || []).filter(d => d.fase_id === f.id)
      return { ...f, despesas_periodo: despFase.reduce((s, d) => s + d.valor, 0) }
    }).filter(f => f.despesas_periodo > 0)
    setDados({ despesas: desp || [], porFase, totalPeriodo: (desp || []).reduce((s,d) => s+d.valor, 0) })
  }

  async function loadInsumos() {
    const { data } = await supabase.from('insumos').select('*').eq('obra_id', obraAtiva.id).order('ranking')
    setDados({ insumos: data || [] })
  }

  async function loadFinanceiro() {
    const [{ data: fases }, { data: despesas }] = await Promise.all([
      supabase.from('fases').select('*').eq('obra_id', obraAtiva.id).order('numero'),
      supabase.from('despesas').select('valor,tipo,data_lancamento').eq('obra_id', obraAtiva.id),
    ])
    const totalOrcado = (fases || []).reduce((s, f) => s + (f.total_estimado || 0), 0)
    const totalGasto  = (despesas || []).reduce((s, d) => s + d.valor, 0)
    const pctGasto    = totalOrcado > 0 ? (totalGasto / totalOrcado) * 100 : 0
    const projecao    = pctGasto > 0 ? (totalGasto / (pctGasto / 100)) : totalOrcado
    setDados({ fases: fases || [], totalOrcado, totalGasto, pctGasto, projecao })
  }

  async function loadDiario() {
    let q = supabase.from('diario_obra').select('*').eq('obra_id', obraAtiva.id)
    if (dataInicio) q = q.gte('data', dataInicio)
    if (dataFim)    q = q.lte('data', dataFim)
    const { data } = await q.order('data', { ascending: false })
    setDados({ entradas: data || [] })
  }

  function exportarCSV() {
    if (!dados) return
    let rows = [], headers = []
    if (ativo === 'avanco' && dados.fases) {
      headers = ['Nº','Fase','Status','% Previsto','% Realizado','Desvio %']
      rows = dados.fases.map(f => [f.numero, f.nome, f.status, '100', f.percentual_concluido || 0, calcDesvio(f.total_realizado, f.total_estimado).toFixed(1)])
    } else if (ativo === 'insumos' && dados.insumos) {
      headers = ['Rank','Classe','Nome','Valor Orçado','Valor Realizado','Desvio %']
      rows = dados.insumos.map(i => [i.ranking, i.classe, i.nome, i.valor_orcado, i.valor_realizado || 0, calcDesvio(i.valor_realizado, i.valor_orcado).toFixed(1)])
    }
    if (!rows.length) return
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `alicerce_${ativo}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  async function exportarPDF() {
    if (!dados || !obraAtiva) return
    const { jsPDF, autoTable } = await getPDF()
    const doc = new jsPDF('l', 'mm', 'a4')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('ALICERCE', 14, 18)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text(obraAtiva.nome, 14, 26)
    doc.setFontSize(9)
    doc.setTextColor(150)
    doc.text(`Gerado em ${formatDate(new Date().toISOString())}`, 14, 32)
    doc.text(TIPOS_RELATORIO.find(t => t.id === ativo)?.label || '', 200, 32, { align: 'right' })

    if (ativo === 'avanco' && dados.fases) {
      autoTable(doc, {
        startY: 40,
        head: [['Nº','Fase','Status','% Concluído','Estimado','Realizado','Desvio %']],
        body: dados.fases.map(f => [
          f.numero, f.nome, f.status,
          `${f.percentual_concluido || 0}%`,
          formatCurrency(f.total_estimado),
          formatCurrency(f.total_realizado || 0),
          `${calcDesvio(f.total_realizado, f.total_estimado).toFixed(1)}%`,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [28, 31, 38] },
      })
    } else if (ativo === 'insumos' && dados.insumos) {
      autoTable(doc, {
        startY: 40,
        head: [['Rank','Classe','Nome','Orçado','Realizado','Desvio']],
        body: dados.insumos.map(i => [
          i.ranking, i.classe, i.nome,
          formatCurrency(i.valor_orcado),
          formatCurrency(i.valor_realizado || 0),
          `${calcDesvio(i.valor_realizado, i.valor_orcado).toFixed(1)}%`,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [28, 31, 38] },
      })
    } else if (ativo === 'financeiro' && dados.fases) {
      autoTable(doc, {
        startY: 40,
        head: [['Nº','Fase','Estimado','Realizado','Desvio R$','Desvio %']],
        body: dados.fases.map(f => [
          f.numero, f.nome,
          formatCurrency(f.total_estimado),
          formatCurrency(f.total_realizado || 0),
          formatCurrency((f.total_realizado || 0) - f.total_estimado),
          `${calcDesvio(f.total_realizado, f.total_estimado).toFixed(1)}%`,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [28, 31, 38] },
      })
    } else if (ativo === 'medicao' && dados.porFase) {
      autoTable(doc, {
        startY: 40,
        head: [['Fase','Executado no período']],
        body: dados.porFase.map(f => [f.nome, formatCurrency(f.despesas_periodo)]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [28, 31, 38] },
      })
    } else if (ativo === 'diario' && dados.entradas) {
      autoTable(doc, {
        startY: 40,
        head: [['Data','Fase','Responsável','Atividades','Ocorrências','Progresso','Funcionários']],
        body: dados.entradas.map(e => [
          formatDate(e.data), e.fase_nome || '—', e.responsavel || '—',
          e.atividades?.slice(0, 60) || '—',
          e.ocorrencias?.slice(0, 40) || '—',
          `${e.progresso_percentual || 0}%`,
          e.funcionarios_presentes || 0,
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [28, 31, 38] },
      })
    }

    doc.save(`alicerce_${ativo}_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  if (!obraAtiva) return (
    <div className="text-center py-20 text-brand-muted">
      <TrendingUp size={40} className="mx-auto mb-3 opacity-40" />
      <p>Selecione uma obra para gerar relatórios.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Relatórios</h1>
          <p className="text-sm text-brand-muted">{obraAtiva.nome}</p>
        </div>
        <div className="flex gap-2">
          {(ativo === 'avanco' || ativo === 'insumos') && (
            <Button variant="outline" onClick={exportarCSV}>
              <FileDown size={14} /> CSV
            </Button>
          )}
          <Button onClick={exportarPDF}>
            <FileDown size={14} /> PDF
          </Button>
        </div>
      </div>

      {/* Seletor de tipo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {TIPOS_RELATORIO.map(tipo => {
          const Icon = tipo.icon
          return (
            <button
              key={tipo.id}
              onClick={() => carregarDados(tipo.id)}
              className={cn(
                "card-base p-4 text-left transition-all",
                ativo === tipo.id
                  ? "ring-2 ring-brand-accent bg-brand-accent/5"
                  : "hover:shadow-md"
              )}
            >
              <div className="gradient-bar" />
              <Icon size={20} className={ativo === tipo.id ? "text-brand-accent" : "text-brand-muted"} />
              <p className="text-xs font-medium text-brand-dark mt-2 leading-tight">{tipo.label}</p>
              <p className="text-[10px] text-brand-muted mt-0.5 leading-tight">{tipo.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Filtros por data (Medição e Diário) */}
      {(ativo === 'medicao' || ativo === 'diario') && (
        <div className="card-base p-4">
          <div className="gradient-bar" />
          <p className="text-xs font-medium text-brand-muted mb-3">Filtrar período</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-brand-muted mb-1">De</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                className="text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-brand-muted mb-1">Até</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                className="text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none" />
            </div>
            {ativo === 'medicao' && (
              <div>
                <label className="block text-xs text-brand-muted mb-1">Fase</label>
                <select value={faseSel} onChange={e => setFaseSel(e.target.value)}
                  className="text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none">
                  <option value="">Todas</option>
                  {fases.map(f => <option key={f.id} value={f.id}>{f.numero}. {f.nome}</option>)}
                </select>
              </div>
            )}
            <Button onClick={() => carregarDados(ativo)} size="sm">Aplicar</Button>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={28} className="animate-spin text-brand-accent" />
        </div>
      ) : dados ? (
        <div className="card-base p-0 overflow-hidden">
          <div className="gradient-bar" />
          {ativo === 'avanco'     && <TabelaAvanco fases={dados.fases} />}
          {ativo === 'medicao'    && <TabelaMedicao dados={dados} />}
          {ativo === 'insumos'    && <TabelaInsumos insumos={dados.insumos} />}
          {ativo === 'financeiro' && <TabelaFinanceiro dados={dados} obra={obraAtiva} />}
          {ativo === 'diario'     && <TabelaDiario entradas={dados.entradas} />}
        </div>
      ) : null}
    </div>
  )
}

// ── Sub-tabelas ─────────────────────────────────────────────────────────────

function TabelaAvanco({ fases }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-brand-dark text-white">
          <tr>
            {['Nº','Fase','Status','% Conc.','Estimado','Realizado','Desvio'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fases.map((f, i) => {
            const desvio = calcDesvio(f.total_realizado, f.total_estimado)
            return (
              <tr key={f.id} className={cn("border-b border-brand-border", i % 2 === 0 ? "bg-white" : "bg-brand-bg")}>
                <td className="px-4 py-3 text-brand-muted">{f.numero}</td>
                <td className="px-4 py-3 font-medium text-brand-dark max-w-[200px]">
                  <p className="truncate">{f.nome}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={f.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-brand-border overflow-hidden">
                      <div className="h-full bg-brand-accent rounded-full" style={{ width: `${f.percentual_concluido || 0}%` }} />
                    </div>
                    <span className="text-xs">{f.percentual_concluido || 0}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-brand-dark">{formatCurrency(f.total_estimado)}</td>
                <td className="px-4 py-3 text-brand-dark">{formatCurrency(f.total_realizado || 0)}</td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs font-medium", desvio > 5 ? "text-status-red" : desvio < 0 ? "text-status-green" : "text-brand-muted")}>
                    {desvio > 0 ? '+' : ''}{desvio.toFixed(1)}%
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="bg-brand-bg">
          <tr>
            <td colSpan={4} className="px-4 py-3 font-bold text-brand-dark text-sm">Total</td>
            <td className="px-4 py-3 font-bold text-brand-dark">{formatCurrency(fases.reduce((s,f) => s+(f.total_estimado||0), 0))}</td>
            <td className="px-4 py-3 font-bold text-brand-accent">{formatCurrency(fases.reduce((s,f) => s+(f.total_realizado||0), 0))}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function TabelaMedicao({ dados }) {
  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="card-base p-4">
          <div className="gradient-bar" />
          <p className="text-xs text-brand-muted">Total no período</p>
          <p className="text-2xl font-display font-bold text-brand-accent">{formatCurrency(dados.totalPeriodo)}</p>
        </div>
        <div className="card-base p-4">
          <div className="gradient-bar" />
          <p className="text-xs text-brand-muted">Nº de lançamentos</p>
          <p className="text-2xl font-display font-bold text-brand-dark">{dados.despesas?.length || 0}</p>
        </div>
      </div>
      {dados.porFase.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-dark text-white">
              <tr>
                <th className="text-left px-4 py-3 text-xs">Fase</th>
                <th className="text-right px-4 py-3 text-xs">Executado no período</th>
              </tr>
            </thead>
            <tbody>
              {dados.porFase.map((f, i) => (
                <tr key={f.id} className={cn("border-b border-brand-border", i%2===0?"bg-white":"bg-brand-bg")}>
                  <td className="px-4 py-3 text-brand-dark">{f.nome}</td>
                  <td className="px-4 py-3 text-right font-medium text-brand-accent">{formatCurrency(f.despesas_periodo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TabelaInsumos({ insumos }) {
  const totOrcado   = insumos.reduce((s, i) => s+(i.valor_orcado||0), 0)
  const totRealizado= insumos.reduce((s, i) => s+(i.valor_realizado||0), 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-brand-dark text-white">
          <tr>
            {['Rank','Classe','Nome','Orçado','Realizado','Desvio R$','Desvio %','Status'].map(h => (
              <th key={h} className="text-left px-3 py-3 text-xs font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {insumos.map((ins, i) => {
            const desvio = calcDesvio(ins.valor_realizado, ins.valor_orcado)
            return (
              <tr key={ins.id} className={cn("border-b border-brand-border", i%2===0?"bg-white":"bg-brand-bg")}>
                <td className="px-3 py-2 text-brand-muted text-xs">{ins.ranking}</td>
                <td className="px-3 py-2">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                    ins.classe==='A'?"bg-red-100 text-red-700":ins.classe==='B'?"bg-amber-100 text-amber-700":"bg-green-100 text-green-700"
                  )}>{ins.classe}</span>
                </td>
                <td className="px-3 py-2 font-medium text-brand-dark max-w-[180px]"><p className="truncate">{ins.nome}</p></td>
                <td className="px-3 py-2 text-brand-dark">{formatCurrency(ins.valor_orcado)}</td>
                <td className="px-3 py-2 text-brand-dark">{formatCurrency(ins.valor_realizado || 0)}</td>
                <td className="px-3 py-2">
                  <span className={cn("text-xs", desvio > 0 ? "text-status-red" : "text-status-green")}>
                    {formatCurrency((ins.valor_realizado||0) - ins.valor_orcado)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={cn("text-xs font-medium", desvio > 5 ? "text-status-red" : desvio < 0 ? "text-status-green" : "text-brand-muted")}>
                    {desvio > 0 ? '+' : ''}{desvio.toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-2"><StatusBadge status={ins.status} /></td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="bg-brand-bg">
          <tr>
            <td colSpan={3} className="px-3 py-3 font-bold text-brand-dark">Total</td>
            <td className="px-3 py-3 font-bold text-brand-dark">{formatCurrency(totOrcado)}</td>
            <td className="px-3 py-3 font-bold text-brand-accent">{formatCurrency(totRealizado)}</td>
            <td className="px-3 py-3 font-bold">
              <span className={totRealizado > totOrcado ? "text-status-red" : "text-status-green"}>
                {formatCurrency(totRealizado - totOrcado)}
              </span>
            </td>
            <td /><td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function TabelaFinanceiro({ dados, obra }) {
  const alerta = dados.projecao > dados.totalOrcado
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Orçado',   value: formatCurrency(dados.totalOrcado),  color: 'text-brand-dark' },
          { label: 'Total Gasto',    value: formatCurrency(dados.totalGasto),    color: 'text-brand-accent' },
          { label: '% Consumido',    value: formatPercent(dados.pctGasto),       color: dados.pctGasto > 80 ? 'text-status-red' : 'text-brand-dark' },
          { label: 'Projeção Final', value: formatCurrency(dados.projecao),      color: alerta ? 'text-status-red' : 'text-status-green' },
        ].map(c => (
          <div key={c.label} className="card-base p-4">
            <div className="gradient-bar" />
            <p className="text-xs text-brand-muted">{c.label}</p>
            <p className={cn("text-xl font-display font-bold mt-1", c.color)}>{c.value}</p>
          </div>
        ))}
      </div>
      {alerta && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          ⚠️ A projeção de custo final ({formatCurrency(dados.projecao)}) está acima do orçamento ({formatCurrency(dados.totalOrcado)}). Revise os lançamentos.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-dark text-white">
            <tr>
              {['Nº','Fase','Estimado','Realizado','Desvio R$','Desvio %'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.fases.map((f, i) => {
              const desvio = calcDesvio(f.total_realizado, f.total_estimado)
              return (
                <tr key={f.id} className={cn("border-b border-brand-border", i%2===0?"bg-white":"bg-brand-bg")}>
                  <td className="px-4 py-2 text-brand-muted text-xs">{f.numero}</td>
                  <td className="px-4 py-2 text-brand-dark font-medium max-w-[200px]"><p className="truncate">{f.nome}</p></td>
                  <td className="px-4 py-2">{formatCurrency(f.total_estimado)}</td>
                  <td className="px-4 py-2 text-brand-accent">{formatCurrency(f.total_realizado || 0)}</td>
                  <td className="px-4 py-2">
                    <span className={desvio > 0 ? "text-status-red" : "text-status-green"}>
                      {formatCurrency((f.total_realizado||0) - f.total_estimado)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn("text-xs font-medium", desvio > 5 ? "text-status-red" : desvio < 0 ? "text-status-green" : "text-brand-muted")}>
                      {desvio > 0 ? '+' : ''}{desvio.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TabelaDiario({ entradas }) {
  const CLIMA_ICON = { sol: '☀️', nublado: '⛅', chuva: '🌧️', chuva_forte: '⛈️' }
  return entradas.length === 0 ? (
    <div className="text-center py-12 text-brand-muted">
      <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
      <p>Nenhuma entrada no período selecionado.</p>
    </div>
  ) : (
    <div className="divide-y divide-brand-border">
      {entradas.map(e => (
        <div key={e.id} className="p-5">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{CLIMA_ICON[e.clima] || '—'}</span>
              <span className="font-display font-bold text-brand-dark">{formatDate(e.data)}</span>
              {e.fase_nome && <span className="text-xs bg-brand-bg text-brand-muted px-2 py-0.5 rounded-full">{e.fase_nome}</span>}
            </div>
            <div className="flex items-center gap-3 text-xs text-brand-muted flex-shrink-0">
              {e.responsavel && <span>{e.responsavel}</span>}
              {e.funcionarios_presentes > 0 && <span>👷 {e.funcionarios_presentes}</span>}
              <span className="font-medium text-brand-accent">{e.progresso_percentual || 0}%</span>
            </div>
          </div>
          {e.atividades && <p className="text-sm text-brand-dark mb-1">{e.atividades}</p>}
          {e.ocorrencias && (
            <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
              ⚠️ {e.ocorrencias}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    planejamento: 'bg-slate-100 text-slate-600',
    em_andamento: 'bg-blue-100 text-blue-700',
    concluida:    'bg-green-100 text-green-700',
    pausada:      'bg-amber-100 text-amber-700',
    nao_cotado:   'bg-slate-100 text-slate-500',
    cotado:       'bg-blue-100 text-blue-700',
    aprovado:     'bg-green-100 text-green-700',
    comprado:     'bg-emerald-100 text-emerald-700',
    entregue:     'bg-teal-100 text-teal-700',
  }
  const labels = {
    planejamento: 'Planejamento', em_andamento: 'Em andamento',
    concluida: 'Concluída', pausada: 'Pausada',
    nao_cotado: 'Não cotado', cotado: 'Cotado',
    aprovado: 'Aprovado', comprado: 'Comprado', entregue: 'Entregue',
  }
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", map[status] || 'bg-slate-100 text-slate-600')}>
      {labels[status] || status}
    </span>
  )
}
