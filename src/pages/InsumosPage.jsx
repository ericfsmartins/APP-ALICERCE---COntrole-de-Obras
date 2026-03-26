import { useEffect, useState, useMemo } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import { Plus, Search, Loader2, Package, RefreshCw, Download, Pencil, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { formatCurrency, formatPercent, cn } from '@/lib/utils'
import { INSUMOS_PADRAO } from '@/lib/seedData'

const STATUS_INSUMO  = ['nao_cotado','cotado','aprovado','comprado','entregue']
const STATUS_LABELS  = { nao_cotado:'Não cotado', cotado:'Cotado', aprovado:'Aprovado', comprado:'Comprado', entregue:'Entregue' }
const STATUS_COLORS  = {
  nao_cotado: 'bg-slate-100 text-slate-600',
  cotado:     'bg-blue-100 text-blue-700',
  aprovado:   'bg-amber-100 text-amber-700',
  comprado:   'bg-purple-100 text-purple-700',
  entregue:   'bg-green-100 text-green-700',
}
const CLASSE_COLORS = { A: 'bg-red-100 text-red-700', B: 'bg-amber-100 text-amber-700', C: 'bg-blue-100 text-blue-700' }

// Calcula progresso com a regra: min/max para evitar >100% em caso de estouro
function calcProgresso(realizado, orcado) {
  if (!orcado || orcado === 0) return 0
  if (realizado <= orcado) return (realizado / orcado) * 100
  return (orcado / realizado) * 100 // estouro: penaliza mostrando < 100%
}

export default function InsumosPage() {
  const { obraAtiva } = useObra()
  const [insumos, setInsumos]         = useState([])
  const [fases, setFases]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filtroClasse, setFiltroClasse] = useState('Todos')
  const [modal, setModal]             = useState(null)   // null | {} | insumo-obj
  const [saving, setSaving]           = useState(false)
  const [seeding, setSeeding]         = useState(false)
  // Redistribuição
  const [editandoTotal, setEditandoTotal] = useState(false)
  const [novoTotal, setNovoTotal]     = useState('')
  const [redistribuindo, setRedistribuindo] = useState(false)

  useEffect(() => { if (obraAtiva) load() }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    const [{ data: ins }, { data: fas }, { data: desp }] = await Promise.all([
      supabase.from('insumos').select('*').eq('obra_id', obraAtiva.id).order('ranking'),
      supabase.from('fases').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero'),
      supabase.from('despesas').select('insumo_id,valor').eq('obra_id', obraAtiva.id).not('insumo_id', 'is', null),
    ])
    // Agrupa despesas por insumo_id
    const realizadoMap = {}
    ;(desp || []).forEach(d => {
      realizadoMap[d.insumo_id] = (realizadoMap[d.insumo_id] || 0) + Number(d.valor)
    })
    const insComRealizado = (ins || []).map(i => ({
      ...i,
      valor_realizado: realizadoMap[i.id] || i.valor_realizado || 0,
    }))
    setInsumos(insComRealizado)
    setFases(fas || [])
    setLoading(false)
  }

  async function seedInsumos() {
    if (!confirm(`Isso vai inserir os ${INSUMOS_PADRAO.length} insumos padrão com mapeamento automático de fases e momentos. Continuar?`)) return
    setSeeding(true)
    const totalMateriais = (obraAtiva.orcamento_total || 0) * ((obraAtiva.percentual_materiais || 70.91) / 100)

    // Carrega fases e momentos da obra para resolver os números → IDs
    const [{ data: fasesObra }, { data: momentosObra }] = await Promise.all([
      supabase.from('fases').select('id,numero,nome').eq('obra_id', obraAtiva.id),
      supabase.from('momentos').select('id,numero,nome').eq('obra_id', obraAtiva.id),
    ])
    const faseByNumero    = Object.fromEntries((fasesObra    || []).map(f => [f.numero, f]))
    const momentoByNumero = Object.fromEntries((momentosObra || []).map(m => [m.numero, m]))

    const payload = INSUMOS_PADRAO.map(i => {
      const fase    = i.fase_numero    != null ? faseByNumero[i.fase_numero]       : null
      const momento = i.momento_numero != null ? momentoByNumero[i.momento_numero] : null
      return {
        ranking:         i.ranking,
        classe:          i.classe,
        nome:            i.nome,
        categoria:       i.categoria,
        peso_percentual: i.peso_percentual,
        valor_orcado:    Number(((totalMateriais * i.peso_percentual) / 100).toFixed(2)),
        valor_realizado: 0,
        status:          'nao_cotado',
        obra_id:         obraAtiva.id,
        fase_id:         fase?.id    || null,
        fase_nome:       fase?.nome  || null,
        momento_id:      momento?.id   || null,
        momento_nome:    momento?.nome || null,
      }
    })
    await supabase.from('insumos').insert(payload)
    setSeeding(false)
    await load()
  }

  async function redistribuir() {
    const total = parseFloat(novoTotal.replace(',', '.'))
    if (!total || isNaN(total) || total <= 0) return
    setRedistribuindo(true)
    const updates = insumos.map(i => ({
      id: i.id,
      valor_orcado: Number(((total * (i.peso_percentual || 0)) / 100).toFixed(2)),
    }))
    // Atualiza em lote
    await Promise.all(updates.map(u =>
      supabase.from('insumos').update({ valor_orcado: u.valor_orcado }).eq('id', u.id)
    ))
    setEditandoTotal(false)
    setNovoTotal('')
    setRedistribuindo(false)
    await load()
  }

  async function salvarInsumo(dados, id) {
    setSaving(true)
    const fase = fases.find(f => f.id === dados.fase_id)
    const payload = { ...dados, fase_nome: fase?.nome || '' }
    if (id) {
      await supabase.from('insumos').update(payload).eq('id', id)
    } else {
      await supabase.from('insumos').insert({ ...payload, obra_id: obraAtiva.id })
    }
    setSaving(false)
    setModal(null)
    await load()
  }

  async function excluir(id) {
    if (!confirm('Excluir este insumo?')) return
    await supabase.from('insumos').delete().eq('id', id)
    await load()
  }

  async function atualizarStatus(insumo, novoStatus) {
    await supabase.from('insumos').update({ status: novoStatus }).eq('id', insumo.id)
    setInsumos(prev => prev.map(i => i.id === insumo.id ? { ...i, status: novoStatus } : i))
  }

  // Totais
  const totalOrcado    = useMemo(() => insumos.reduce((s, i) => s + (i.valor_orcado || 0), 0), [insumos])
  const totalRealizado = useMemo(() => insumos.reduce((s, i) => s + (i.valor_realizado || 0), 0), [insumos])
  const saldo          = totalOrcado - totalRealizado
  const totalMOConfig  = (obraAtiva?.orcamento_total || 0) * ((obraAtiva?.percentual_mao_obra || 29.09) / 100)
  const totalMatConfig = (obraAtiva?.orcamento_total || 0) * ((obraAtiva?.percentual_materiais || 70.91) / 100)

  // Totais por classe
  const totalA = insumos.filter(i => i.classe === 'A').reduce((s, i) => s + (i.valor_orcado || 0), 0)
  const totalB = insumos.filter(i => i.classe === 'B').reduce((s, i) => s + (i.valor_orcado || 0), 0)
  const totalC = insumos.filter(i => i.classe === 'C').reduce((s, i) => s + (i.valor_orcado || 0), 0)
  const itensA = insumos.filter(i => i.classe === 'A').length
  const itensB = insumos.filter(i => i.classe === 'B').length
  const itensC = insumos.filter(i => i.classe === 'C').length

  const filtrados = useMemo(() => {
    return insumos.filter(i => {
      if (filtroClasse !== 'Todos' && i.classe !== filtroClasse) return false
      if (search && !i.nome.toLowerCase().includes(search.toLowerCase()) &&
          !i.categoria?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [insumos, filtroClasse, search])

  if (!obraAtiva) return (
    <div className="text-center py-20 text-brand-muted">
      <Package size={40} className="mx-auto mb-3 opacity-40" />
      <p>Selecione uma obra para ver os insumos.</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Insumos — Curva ABC</h1>
          <p className="text-sm text-brand-muted">{insumos.length} insumos · Pesos % recalculados automaticamente</p>
        </div>
        <div className="flex gap-2">
          {insumos.length === 0 && (
            <Button variant="outline" onClick={seedInsumos} disabled={seeding}>
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Importar 86 Padrão
            </Button>
          )}
          <Button onClick={() => setModal({})}>
            <Plus size={14} /> Novo Insumo
          </Button>
        </div>
      </div>

      {/* Conciliação bidirecional */}
      <div className="card-base p-4">
        <div className="gradient-bar" />
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-brand-muted uppercase tracking-wide">
            Conciliação Bidirecional — Insumos ↔ Orçamento da Obra
          </p>
          <button
            className="text-xs text-brand-accent hover:underline"
            onClick={() => { setEditandoTotal(true); setNovoTotal(totalOrcado.toFixed(2)) }}
          >
            Editar "Materiais" para redistribuir entre insumos pelos pesos %
          </button>
        </div>

        {editandoTotal ? (
          <div className="flex items-end gap-3 p-3 bg-brand-bg rounded-lg border border-brand-accent/30">
            <div className="flex-1">
              <label className="block text-xs font-medium text-brand-muted mb-1">Novo total de materiais (R$)</label>
              <input
                type="number"
                value={novoTotal}
                onChange={e => setNovoTotal(e.target.value)}
                className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
                placeholder="Ex: 935000"
                autoFocus
              />
            </div>
            <Button onClick={redistribuir} disabled={redistribuindo}>
              {redistribuindo ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Redistribuir
            </Button>
            <Button variant="outline" onClick={() => setEditandoTotal(false)}>Cancelar</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Orç. Total (Config.)', value: formatCurrency(obraAtiva?.orcamento_total || 0), sub: `${obraAtiva?.area_total || 0} m²`, color: 'text-brand-dark' },
              { label: 'Materiais Config.', value: formatCurrency(totalMatConfig), sub: `${obraAtiva?.percentual_materiais || 70.91}% do orçamento`, color: 'text-brand-accent' },
              { label: 'Mão de Obra Config.', value: formatCurrency(totalMOConfig), sub: `${obraAtiva?.percentual_mao_obra || 29.09}% do orçamento`, color: 'text-brand-dark' },
              { label: 'Total Insumos Orç.', value: formatCurrency(totalOrcado), sub: totalOrcado > 0 ? `${((totalOrcado/Math.max(obraAtiva?.orcamento_total||1,1))*100).toFixed(1)}% vs config` : '—', color: 'text-brand-dark' },
              { label: 'Total Realizado', value: formatCurrency(totalRealizado), sub: `${calcProgresso(totalRealizado, totalOrcado).toFixed(1)}% executado`, color: totalRealizado > totalOrcado ? 'text-status-red' : 'text-brand-dark' },
              { label: 'Saldo Restante', value: formatCurrency(Math.abs(saldo)), sub: saldo >= 0 ? '100.0% disponível' : 'Estouro de orçamento', color: saldo >= 0 ? 'text-status-green' : 'text-status-red' },
            ].map(({ label, value, sub, color }) => (
              <div key={label}>
                <p className="text-[10px] text-brand-muted mb-0.5">{label}</p>
                <p className={cn('text-base font-display font-bold', color)}>{value}</p>
                <p className="text-[10px] text-brand-muted">{sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cards ABC */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { classe: 'A', total: totalA, itens: itensA, pct: totalOrcado > 0 ? (totalA/totalOrcado*100).toFixed(1) : 0, color: 'border-red-200 bg-red-50', badge: 'bg-red-100 text-red-700' },
          { classe: 'B', total: totalB, itens: itensB, pct: totalOrcado > 0 ? (totalB/totalOrcado*100).toFixed(1) : 0, color: 'border-amber-200 bg-amber-50', badge: 'bg-amber-100 text-amber-700' },
          { classe: 'C', total: totalC, itens: itensC, pct: totalOrcado > 0 ? (totalC/totalOrcado*100).toFixed(1) : 0, color: 'border-blue-200 bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
        ].map(({ classe, total, itens, pct, color, badge }) => (
          <div key={classe} className={cn('rounded-xl border p-4', color)}>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', badge)}>Classe {classe}</span>
            </div>
            <p className="text-lg font-display font-bold text-brand-dark">{formatCurrency(total)}</p>
            <p className="text-xs text-brand-muted">{itens} itens · {pct}%</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-brand-border rounded-lg overflow-hidden">
          {['Todos','A','B','C'].map(c => (
            <button
              key={c}
              onClick={() => setFiltroClasse(c)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                filtroClasse === c
                  ? 'bg-brand-accent text-white'
                  : 'bg-white text-brand-muted hover:bg-brand-bg'
              )}
            >
              {c === 'Todos' ? 'Todos' : `Classe ${c}`}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            placeholder="Buscar por nome ou fornecedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 w-full rounded-xl border border-brand-border pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
          />
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin text-brand-accent" />
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <div className="gradient-bar" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg">
                  <th className="px-4 py-3 text-left text-xs font-medium text-brand-muted w-10">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-brand-muted w-14">ABC</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-brand-muted">Insumo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-brand-muted hidden md:table-cell">Categoria</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-brand-muted hidden lg:table-cell">Fornecedor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-brand-muted">Peso %</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-brand-muted">Orçado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-brand-muted">Realizado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-brand-muted hidden md:table-cell">Var %</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-brand-muted">Status</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center text-brand-muted">
                      <Package size={36} className="mx-auto mb-3 opacity-30" />
                      <p className="font-medium">Nenhum insumo encontrado.</p>
                      {insumos.length === 0 && (
                        <p className="text-xs mt-1">Use "Importar 86 Padrão" para começar com a lista ABC completa.</p>
                      )}
                    </td>
                  </tr>
                ) : filtrados.map(ins => {
                  const varPct = ins.valor_orcado > 0
                    ? ((ins.valor_realizado - ins.valor_orcado) / ins.valor_orcado) * 100
                    : 0
                  return (
                    <tr key={ins.id} className="border-b border-brand-border hover:bg-brand-bg transition-colors">
                      <td className="px-4 py-3 text-brand-muted text-xs">{ins.ranking}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', CLASSE_COLORS[ins.classe])}>
                          {ins.classe}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-brand-dark max-w-[200px]">
                        <span className="line-clamp-1">{ins.nome}</span>
                      </td>
                      <td className="px-4 py-3 text-brand-muted hidden md:table-cell text-xs">{ins.categoria || '—'}</td>
                      <td className="px-4 py-3 text-brand-muted hidden lg:table-cell text-xs">{ins.fornecedor || '—'}</td>
                      <td className="px-4 py-3 text-right text-brand-accent font-medium text-xs">
                        {formatPercent(ins.peso_percentual, 1)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-xs">
                        {formatCurrency(ins.valor_orcado || 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {ins.valor_realizado > 0
                          ? <span className="font-medium">{formatCurrency(ins.valor_realizado)}</span>
                          : <span className="text-brand-muted">R$ 0,00</span>
                        }
                      </td>
                      <td className={cn('px-4 py-3 text-right text-xs font-medium hidden md:table-cell', varPct > 0 ? 'text-status-red' : varPct < 0 ? 'text-status-green' : 'text-brand-muted')}>
                        {varPct !== 0 ? (varPct > 0 ? '+' : '') + formatPercent(varPct) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={ins.status}
                          onChange={e => atualizarStatus(ins, e.target.value)}
                          className={cn(
                            'text-[11px] font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-accent/30',
                            STATUS_COLORS[ins.status]
                          )}
                        >
                          {STATUS_INSUMO.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setModal(ins)} className="text-brand-muted hover:text-brand-accent transition-colors p-1">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => excluir(ins.id)} className="text-brand-muted hover:text-status-red transition-colors p-1">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {filtrados.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-brand-border bg-brand-bg font-medium">
                    <td colSpan={5} className="px-4 py-3 text-xs text-brand-muted">
                      Total ({filtrados.length} itens)
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-brand-accent font-bold">
                      {formatPercent(filtrados.reduce((s,i) => s+(i.peso_percentual||0),0), 1)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-brand-dark">
                      {formatCurrency(filtrados.reduce((s,i) => s+(i.valor_orcado||0),0))}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-brand-dark">
                      {formatCurrency(filtrados.reduce((s,i) => s+(i.valor_realizado||0),0))}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <ModalInsumo
          insumo={modal?.id ? modal : null}
          fases={fases}
          onSave={salvarInsumo}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
    </div>
  )
}

function ModalInsumo({ insumo, fases, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    nome:           insumo?.nome           || '',
    categoria:      insumo?.categoria      || '',
    peso_percentual:insumo?.peso_percentual|| '',
    valor_orcado:   insumo?.valor_orcado   || '',
    unidade:        insumo?.unidade        || '',
    quantidade:     insumo?.quantidade     || '',
    preco_unitario: insumo?.preco_unitario || '',
    fornecedor:     insumo?.fornecedor     || '',
    fase_id:        insumo?.fase_id        || '',
    status:         insumo?.status         || 'nao_cotado',
    classe:         insumo?.classe         || 'C',
    ranking:        insumo?.ranking        || '',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <Modal open onClose={onClose} title={insumo ? 'Editar Insumo' : 'Novo Insumo'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Input label="Nome *" value={form.nome} onChange={e => set('nome', e.target.value)} />
          </div>
          <Input label="Categoria" value={form.categoria} onChange={e => set('categoria', e.target.value)} />
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1">Classe ABC</label>
            <select value={form.classe} onChange={e => set('classe', e.target.value)}
              className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30">
              <option value="A">A — Alta relevância</option>
              <option value="B">B — Média relevância</option>
              <option value="C">C — Baixa relevância</option>
            </select>
          </div>
          <Input label="Peso % (ex: 12.38)" type="number" value={form.peso_percentual} onChange={e => set('peso_percentual', e.target.value)} />
          <Input label="Valor orçado (R$)" type="number" value={form.valor_orcado} onChange={e => set('valor_orcado', e.target.value)} />
          <Input label="Unidade" value={form.unidade} onChange={e => set('unidade', e.target.value)} placeholder="m², kg, un..." />
          <Input label="Quantidade" type="number" value={form.quantidade} onChange={e => set('quantidade', e.target.value)} />
          <Input label="Preço unitário" type="number" value={form.preco_unitario} onChange={e => set('preco_unitario', e.target.value)} />
          <Input label="Fornecedor" value={form.fornecedor} onChange={e => set('fornecedor', e.target.value)} />
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1">Fase</label>
            <select value={form.fase_id} onChange={e => set('fase_id', e.target.value)}
              className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30">
              <option value="">Nenhuma</option>
              {fases.map(f => <option key={f.id} value={f.id}>{f.numero}. {f.nome.slice(0,30)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30">
              {STATUS_INSUMO.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-brand-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={saving || !form.nome} onClick={() => onSave(form, insumo?.id)}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
