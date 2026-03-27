import { useEffect, useState, useMemo } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import {
  Wallet, Plus, Download, Loader2, TrendingUp, TrendingDown,
  Calendar, CheckCircle2, Clock, AlertTriangle, ChevronRight, X
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { formatCurrency, formatDate, cn } from '@/lib/utils'

/* ─── helpers ───────────────────────────────────────────── */
function parseFlt(v) { return parseFloat(String(v || 0).replace(',', '.')) || 0 }

function addMonths(date, n) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function diasAte(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr + 'T12:00:00') - new Date()
  return Math.ceil(diff / 86400000)
}

const CAT_ENTRADA = ['aporte_proprio', 'parcela_financiamento', 'medicao_recebida', 'outro']
const CAT_LABELS  = {
  aporte_proprio: 'Aporte Próprio', parcela_financiamento: 'Parcela Financiamento',
  medicao_recebida: 'Medição Recebida', outro: 'Outro',
  mao_obra: 'Mão de Obra', material: 'Material', servico: 'Serviço',
  equipamento: 'Equipamento',
}
const STATUS_PARCELA = {
  aguardando: { label: 'Aguardando', cls: 'bg-slate-100 text-slate-600' },
  liberada:   { label: 'Liberada',   cls: 'bg-blue-100 text-blue-700'  },
  recebida:   { label: 'Recebida',   cls: 'bg-emerald-100 text-emerald-700' },
  atrasada:   { label: 'Atrasada',   cls: 'bg-red-100 text-red-700'    },
}

/* ─── Page ───────────────────────────────────────────────── */
export default function FinanceiroPage() {
  const { obraAtiva } = useObra()
  const [tab, setTab]   = useState('conta')
  const [conta, setConta]               = useState(null)
  const [movs, setMovs]                 = useState([])
  const [financiamentos, setFinanciamentos] = useState([])
  const [parcelas, setParcelas]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [modalDeposito, setModalDeposito] = useState(false)
  const [modalFinanc, setModalFinanc]   = useState(false)
  const [modalParcela, setModalParcela] = useState(null)
  const [saving, setSaving]             = useState(false)
  const [erro, setErro]                 = useState('')

  useEffect(() => { if (obraAtiva) load() }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    // Garante que conta existe
    let { data: c } = await supabase.from('conta_obra').select('*').eq('obra_id', obraAtiva.id).single()
    if (!c) {
      const { data: nova } = await supabase.from('conta_obra')
        .insert({ obra_id: obraAtiva.id, nome: 'Conta da Obra', saldo_atual: 0, saldo_inicial: 0, limite_alerta: 10000 })
        .select().single()
      c = nova
    }
    const [{ data: m }, { data: f }, { data: p }] = await Promise.all([
      supabase.from('movimentacoes_conta').select('*').eq('obra_id', obraAtiva.id).order('data_movimentacao', { ascending: false }),
      supabase.from('financiamentos').select('*').eq('obra_id', obraAtiva.id).order('created_at'),
      supabase.from('parcelas_financiamento').select('*').eq('obra_id', obraAtiva.id).order('data_prevista'),
    ])
    setConta(c)
    setMovs(m || [])
    setFinanciamentos(f || [])
    setParcelas(p || [])
    setLoading(false)
  }

  /* ── Depositar ── */
  async function depositar(form) {
    setSaving(true); setErro('')
    const valor = parseFlt(form.valor)
    if (!valor || valor <= 0) { setErro('Valor inválido'); setSaving(false); return }
    const novoSaldo = (conta?.saldo_atual || 0) + valor
    const { error } = await supabase.from('movimentacoes_conta').insert({
      conta_id: conta.id, obra_id: obraAtiva.id,
      tipo: 'entrada', categoria: form.categoria || 'aporte_proprio',
      descricao: form.descricao || 'Entrada manual',
      valor, saldo_apos: novoSaldo,
      data_movimentacao: form.data || new Date().toISOString().split('T')[0],
    })
    if (error) { setErro(error.message); setSaving(false); return }
    await supabase.from('conta_obra').update({ saldo_atual: novoSaldo, updated_at: new Date() }).eq('id', conta.id)
    setSaving(false); setModalDeposito(false); await load()
  }

  /* ── Novo Financiamento ── */
  async function criarFinanciamento(form) {
    setSaving(true); setErro('')
    const valorTotal   = parseFlt(form.valor_total)
    const totalParcelas = parseInt(form.total_parcelas) || 0
    if (!form.banco || !valorTotal || !totalParcelas || !form.data_inicio) {
      setErro('Preencha todos os campos obrigatórios'); setSaving(false); return
    }
    const { data: fin, error } = await supabase.from('financiamentos').insert({
      obra_id: obraAtiva.id, banco: form.banco,
      numero_contrato: form.numero_contrato || null,
      valor_total: valorTotal, total_parcelas: totalParcelas,
      data_inicio: form.data_inicio,
      taxa_juros: parseFlt(form.taxa_juros) || 0,
      observacoes: form.observacoes || null,
    }).select().single()
    if (error) { setErro(error.message); setSaving(false); return }

    // Gera parcelas automaticamente
    const valorParcela = parseFloat((valorTotal / totalParcelas).toFixed(2))
    const parcelasPayload = []
    for (let i = 0; i < totalParcelas; i++) {
      const dt = addMonths(new Date(form.data_inicio + 'T12:00:00'), i)
      parcelasPayload.push({
        financiamento_id: fin.id, obra_id: obraAtiva.id,
        numero_parcela: i + 1, valor: valorParcela,
        data_prevista: dt.toISOString().split('T')[0],
        status: 'aguardando',
      })
    }
    await supabase.from('parcelas_financiamento').insert(parcelasPayload)
    setSaving(false); setModalFinanc(false); await load()
  }

  /* ── Receber Parcela ── */
  async function receberParcela(parcela) {
    setSaving(true)
    const novoSaldo = (conta?.saldo_atual || 0) + parcela.valor
    await supabase.from('parcelas_financiamento').update({
      status: 'recebida',
      data_recebimento: new Date().toISOString().split('T')[0],
    }).eq('id', parcela.id)
    await supabase.from('movimentacoes_conta').insert({
      conta_id: conta.id, obra_id: obraAtiva.id,
      tipo: 'entrada', categoria: 'parcela_financiamento',
      descricao: `Parcela #${parcela.numero_parcela} — ${financiamentos.find(f => f.id === parcela.financiamento_id)?.banco || 'Financiamento'}`,
      valor: parcela.valor, saldo_apos: novoSaldo,
      data_movimentacao: new Date().toISOString().split('T')[0],
      parcela_id: parcela.id,
    })
    await supabase.from('conta_obra').update({ saldo_atual: novoSaldo, updated_at: new Date() }).eq('id', conta.id)
    setSaving(false); setModalParcela(null); await load()
  }

  /* ── CSV ── */
  function exportCSV() {
    const h = ['Data','Tipo','Categoria','Descrição','Valor','Saldo Após']
    const rows = movs.map(m => [
      formatDate(m.data_movimentacao),
      m.tipo === 'entrada' ? 'Entrada' : 'Saída',
      CAT_LABELS[m.categoria] || m.categoria,
      m.descricao,
      m.tipo === 'entrada' ? `+${m.valor}` : `-${m.valor}`,
      m.saldo_apos ?? '',
    ])
    const csv = [h, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'extrato.csv'; a.click()
  }

  /* ── Fluxo projetado ── */
  const fluxoData = useMemo(() => {
    if (!conta) return []
    const hoje = new Date()
    const fim  = obraAtiva.data_fim_prevista ? new Date(obraAtiva.data_fim_prevista + 'T12:00:00') : addMonths(hoje, 6)
    const semanas = []
    let saldoReal = conta.saldo_atual
    let cur = new Date(hoje)
    cur.setDate(cur.getDate() - cur.getDay()) // início da semana

    const parcelasAguardando = parcelas.filter(p => p.status === 'aguardando')

    while (cur <= fim) {
      const next = addMonths(cur, 0)
      next.setDate(next.getDate() + 7)
      const entrada = parcelasAguardando
        .filter(p => {
          const d = new Date(p.data_prevista + 'T12:00:00')
          return d >= cur && d < next
        })
        .reduce((s, p) => s + Number(p.valor), 0)
      saldoReal += entrada
      semanas.push({
        semana: cur.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        saldo: parseFloat(saldoReal.toFixed(2)),
        entrada: parseFloat(entrada.toFixed(2)),
      })
      cur = next
      if (semanas.length > 30) break
    }
    return semanas
  }, [conta, parcelas, obraAtiva])

  /* ── Totais ── */
  const totalEntradas = movs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + Number(m.valor), 0)
  const totalSaidas   = movs.filter(m => m.tipo === 'saida').reduce((s, m) => s + Number(m.valor), 0)
  const proximaParcela = parcelas
    .filter(p => p.status === 'aguardando')
    .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))[0]

  const saldoColor = !conta ? '' :
    conta.saldo_atual > (obraAtiva.orcamento_total || 0) * 0.2 ? 'text-emerald-600' :
    conta.saldo_atual > (obraAtiva.orcamento_total || 0) * 0.05 ? 'text-amber-600' : 'text-red-600'

  if (!obraAtiva) return <p className="text-brand-muted text-center py-20">Selecione uma obra.</p>
  if (loading)    return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-brand-accent" /></div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark flex items-center gap-2">
            <Wallet size={22} className="text-brand-accent" /> Financeiro
          </h1>
          <p className="text-sm text-brand-muted">Conta, financiamentos e fluxo de caixa da obra</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border border-brand-border rounded-xl overflow-hidden w-fit">
        {[
          { id: 'conta',          label: 'Conta' },
          { id: 'financiamento',  label: 'Financiamento' },
          { id: 'fluxo',          label: 'Fluxo de Caixa' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-5 py-2 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-brand-accent text-white' : 'bg-white text-brand-muted hover:bg-brand-bg'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB CONTA ─────────────────────────────────────── */}
      {tab === 'conta' && (
        <div className="space-y-5">
          {/* Saldo card */}
          <div className="card-base p-6">
            <div className="gradient-bar" />
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-brand-muted mb-1">Saldo disponível</p>
                <p className={cn('text-4xl font-display font-bold', saldoColor)}>
                  {formatCurrency(conta?.saldo_atual || 0)}
                </p>
                {conta?.limite_alerta && conta.saldo_atual < conta.limite_alerta && (
                  <p className="flex items-center gap-1 text-xs text-amber-600 mt-2">
                    <AlertTriangle size={12} /> Saldo abaixo do limite de alerta ({formatCurrency(conta.limite_alerta)})
                  </p>
                )}
                {proximaParcela && (
                  <p className="text-xs text-brand-muted mt-2">
                    Próxima entrada: <strong>{formatCurrency(proximaParcela.valor)}</strong> em {diasAte(proximaParcela.data_prevista)} dias
                  </p>
                )}
              </div>
              <Button onClick={() => setModalDeposito(true)}>
                <Plus size={14} /> Depositar / Registrar Entrada
              </Button>
            </div>
          </div>

          {/* Resumo cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total entradas', value: totalEntradas, color: 'text-emerald-600', icon: TrendingUp },
              { label: 'Total saídas',   value: totalSaidas,   color: 'text-red-500',     icon: TrendingDown },
              { label: 'Saldo inicial',  value: conta?.saldo_inicial || 0, color: 'text-brand-dark', icon: Wallet },
              { label: 'Movimentações',  value: movs.length, isCnt: true, color: 'text-brand-dark', icon: Calendar },
            ].map(({ label, value, color, icon: Icon, isCnt }) => (
              <div key={label} className="card-base p-4"><div className="gradient-bar" />
                <p className="text-[10px] text-brand-muted mb-1">{label}</p>
                <p className={cn('text-lg font-display font-bold', color)}>
                  {isCnt ? value : formatCurrency(value)}
                </p>
              </div>
            ))}
          </div>

          {/* Tabela movimentações */}
          <div className="card-base overflow-hidden">
            <div className="gradient-bar" />
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
              <p className="text-sm font-medium text-brand-dark">Extrato</p>
              <Button size="sm" variant="secondary" onClick={exportCSV}><Download size={13} /> CSV</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-bg">
                    {['Data','Tipo','Descrição','Valor','Saldo Após'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-brand-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movs.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-muted text-sm">Nenhuma movimentação registrada.</td></tr>
                  ) : movs.map(m => (
                    <tr key={m.id} className={cn('border-b border-brand-border', m.tipo === 'entrada' ? 'bg-emerald-50/30' : '')}>
                      <td className="px-4 py-2.5 text-xs text-brand-muted whitespace-nowrap">{fmtDate(m.data_movimentacao)}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full',
                          m.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                          {m.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-brand-dark max-w-[200px]">
                        <span className="block truncate">{m.descricao}</span>
                        <span className="text-[10px] text-brand-muted">{CAT_LABELS[m.categoria] || m.categoria}</span>
                      </td>
                      <td className={cn('px-4 py-2.5 text-sm font-bold whitespace-nowrap',
                        m.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-500')}>
                        {m.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Number(m.valor))}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-brand-muted whitespace-nowrap">
                        {m.saldo_apos != null ? formatCurrency(Number(m.saldo_apos)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB FINANCIAMENTO ─────────────────────────────── */}
      {tab === 'financiamento' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <Button onClick={() => { setErro(''); setModalFinanc(true) }}>
              <Plus size={14} /> Novo Financiamento
            </Button>
          </div>

          {financiamentos.length === 0 ? (
            <div className="text-center py-16 text-brand-muted">
              <Wallet size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum financiamento cadastrado.</p>
              <p className="text-sm mt-1">Adicione um contrato de financiamento para controlar as parcelas.</p>
            </div>
          ) : financiamentos.map(fin => {
            const parcFin = parcelas.filter(p => p.financiamento_id === fin.id)
            const recebidas = parcFin.filter(p => p.status === 'recebida').length
            const pct = parcFin.length > 0 ? (recebidas / parcFin.length) * 100 : 0
            return (
              <div key={fin.id} className="card-base p-5">
                <div className="gradient-bar" />
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-display font-bold text-brand-dark">{fin.banco}</h3>
                    {fin.numero_contrato && <p className="text-xs text-brand-muted">Contrato: {fin.numero_contrato}</p>}
                    <p className="text-xs text-brand-muted mt-0.5">
                      {formatCurrency(fin.valor_total)} · {fin.total_parcelas} parcelas · início {fmtDate(fin.data_inicio)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">{recebidas}/{fin.total_parcelas} recebidas</p>
                    <div className="w-24 h-1.5 bg-brand-bg rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>

                {/* Timeline de parcelas */}
                <div className="overflow-x-auto pb-1 scrollbar-thin">
                  <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
                    {parcFin.map(p => {
                      const dias = diasAte(p.data_prevista)
                      const isProxima = p.status === 'aguardando' && dias != null && dias >= 0 && dias <= 7
                      const s = STATUS_PARCELA[p.status] || STATUS_PARCELA.aguardando
                      return (
                        <button
                          key={p.id}
                          onClick={() => p.status !== 'recebida' ? setModalParcela(p) : null}
                          className={cn(
                            'flex flex-col items-center px-3 py-2 rounded-xl border text-xs transition-all',
                            s.cls,
                            p.status !== 'recebida' ? 'hover:scale-105 cursor-pointer' : 'cursor-default',
                            isProxima ? 'border-amber-400 animate-pulse ring-2 ring-amber-300' : 'border-transparent'
                          )}
                        >
                          <span className="font-bold">#{p.numero_parcela}</span>
                          <span className="font-medium mt-0.5">{formatCurrency(p.valor)}</span>
                          <span className="text-[10px] mt-0.5">{fmtDate(p.data_prevista)}</span>
                          <span className={cn('text-[9px] mt-1 font-medium', s.cls.split(' ')[1])}>
                            {p.status === 'recebida' ? '✓ Recebida' :
                             p.status === 'liberada'  ? 'Liberada'   :
                             isProxima                ? `${dias}d`   : s.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── TAB FLUXO DE CAIXA ────────────────────────────── */}
      {tab === 'fluxo' && (
        <div className="space-y-5">
          <div className="card-base p-5">
            <div className="gradient-bar" />
            <h2 className="font-display font-bold text-brand-dark mb-1">Fluxo de Caixa Projetado</h2>
            <p className="text-xs text-brand-muted mb-4">Saldo estimado semana a semana considerando parcelas futuras</p>
            {fluxoData.length === 0 ? (
              <p className="text-center text-brand-muted py-8 text-sm">Nenhuma projeção disponível.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={fluxoData} margin={{ right: 16 }}>
                    <defs>
                      <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#D4A84B" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#D4A84B" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#DDE3EE" />
                    <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#7A8BA6' }} />
                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#7A8BA6' }} />
                    <Tooltip formatter={v => formatCurrency(v)} labelFormatter={l => `Semana de ${l}`} />
                    <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'R$ 0', fill: '#ef4444', fontSize: 10 }} />
                    <Area type="monotone" dataKey="saldo" stroke="#D4A84B" strokeWidth={2}
                      fill="url(#gradSaldo)" name="Saldo projetado" />
                    <Area type="monotone" dataKey="entrada" stroke="#22c55e" strokeWidth={1.5}
                      fill="none" strokeDasharray="4 2" name="Entradas" />
                  </AreaChart>
                </ResponsiveContainer>

                {/* Alertas de saldo negativo */}
                {fluxoData.some(d => d.saldo < 0) && (
                  <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                    <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>Projeção indica <strong>saldo negativo</strong> em alguma semana. Verifique o cronograma de parcelas e despesas.</span>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-brand-bg rounded-xl p-3 text-center">
                    <p className="text-[10px] text-brand-muted">Saldo atual</p>
                    <p className="text-base font-bold text-brand-dark">{formatCurrency(conta?.saldo_atual || 0)}</p>
                  </div>
                  <div className="bg-brand-bg rounded-xl p-3 text-center">
                    <p className="text-[10px] text-brand-muted">Entradas futuras (parcelas)</p>
                    <p className="text-base font-bold text-emerald-600">
                      {formatCurrency(parcelas.filter(p => p.status === 'aguardando').reduce((s, p) => s + Number(p.valor), 0))}
                    </p>
                  </div>
                  <div className="bg-brand-bg rounded-xl p-3 text-center">
                    <p className="text-[10px] text-brand-muted">Saldo projetado final</p>
                    <p className={cn('text-base font-bold', fluxoData[fluxoData.length - 1]?.saldo >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {formatCurrency(fluxoData[fluxoData.length - 1]?.saldo || 0)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAIS ────────────────────────────────────────── */}
      <ModalDeposito open={modalDeposito} onClose={() => setModalDeposito(false)}
        onSave={depositar} saving={saving} erro={erro} />
      <ModalFinanciamento open={modalFinanc} onClose={() => setModalFinanc(false)}
        onSave={criarFinanciamento} saving={saving} erro={erro} />
      {modalParcela && (
        <Modal open onClose={() => setModalParcela(null)} title={`Parcela #${modalParcela.numero_parcela}`} size="sm">
          <div className="p-5 space-y-3">
            <div className="bg-brand-bg rounded-xl p-4 text-center">
              <p className="text-xs text-brand-muted">Valor</p>
              <p className="text-2xl font-display font-bold text-brand-dark">{formatCurrency(modalParcela.valor)}</p>
              <p className="text-xs text-brand-muted mt-1">Prevista para {fmtDate(modalParcela.data_prevista)}</p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setModalParcela(null)}>Cancelar</Button>
              <Button className="flex-1" loading={saving} onClick={() => receberParcela(modalParcela)}>
                <CheckCircle2 size={14} /> Marcar como Recebida
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ─── Modal Depositar ─────────────────────────────────────── */
function ModalDeposito({ open, onClose, onSave, saving, erro }) {
  const [form, setForm] = useState({ descricao: '', valor: '', categoria: 'aporte_proprio', data: new Date().toISOString().split('T')[0] })
  return (
    <Modal open={open} onClose={onClose} title="Registrar Entrada" size="sm">
      <div className="p-5 space-y-3">
        <Input label="Descrição" value={form.descricao} onChange={e => setForm(p => ({...p, descricao: e.target.value}))} placeholder="Ex: Aporte inicial" />
        <div>
          <label className="block text-xs font-medium text-brand-muted mb-1">Valor (R$) *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted text-sm">R$</span>
            <input type="text" placeholder="0,00" value={form.valor}
              onChange={e => setForm(p => ({...p, valor: e.target.value}))}
              className="h-9 w-full rounded-xl border border-brand-border pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-muted mb-1">Categoria</label>
          <select value={form.categoria} onChange={e => setForm(p => ({...p, categoria: e.target.value}))}
            className="h-9 w-full text-sm border border-brand-border rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-brand-accent/30">
            {CAT_ENTRADA.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
          </select>
        </div>
        <Input label="Data" type="date" value={form.data} onChange={e => setForm(p => ({...p, data: e.target.value}))} />
        {erro && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={saving} onClick={() => onSave(form)}>Confirmar</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Modal Novo Financiamento ─────────────────────────────── */
function ModalFinanciamento({ open, onClose, onSave, saving, erro }) {
  const [form, setForm] = useState({ banco: '', numero_contrato: '', valor_total: '', total_parcelas: '', data_inicio: '', taxa_juros: '', observacoes: '' })
  return (
    <Modal open={open} onClose={onClose} title="Novo Financiamento">
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Banco *" value={form.banco} onChange={e => setForm(p=>({...p,banco:e.target.value}))} placeholder="Ex: Caixa Econômica" />
          <Input label="Nº Contrato" value={form.numero_contrato} onChange={e => setForm(p=>({...p,numero_contrato:e.target.value}))} placeholder="Ex: 12345-6" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Valor Total (R$) *" value={form.valor_total} onChange={e => setForm(p=>({...p,valor_total:e.target.value}))} placeholder="Ex: 450000" />
          <Input label="Total de Parcelas *" type="number" value={form.total_parcelas} onChange={e => setForm(p=>({...p,total_parcelas:e.target.value}))} placeholder="Ex: 10" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Data 1ª Parcela *" type="date" value={form.data_inicio} onChange={e => setForm(p=>({...p,data_inicio:e.target.value}))} />
          <Input label="Taxa de Juros (% a.m.)" value={form.taxa_juros} onChange={e => setForm(p=>({...p,taxa_juros:e.target.value}))} placeholder="Ex: 0.5" />
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-muted mb-1">Observações</label>
          <textarea rows={2} value={form.observacoes} onChange={e => setForm(p=>({...p,observacoes:e.target.value}))}
            className="w-full rounded-xl border border-brand-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30 resize-none"
            placeholder="Detalhes do contrato..." />
        </div>
        {erro && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
        <p className="text-[10px] text-brand-muted">As parcelas serão geradas automaticamente (valor total ÷ nº parcelas), mensalmente.</p>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={saving} onClick={() => onSave(form)}>Criar Financiamento</Button>
        </div>
      </div>
    </Modal>
  )
}
