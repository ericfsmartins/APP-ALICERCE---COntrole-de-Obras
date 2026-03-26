import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import {
  BarChart3, Plus, Loader2, ChevronRight, Trash2,
  Edit2, Calendar, DollarSign, X, Search
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

const STATUS_COLUNAS = [
  { value: 'rascunho',      label: 'Rascunho',      color: 'bg-slate-100 text-slate-600' },
  { value: 'cotado',        label: 'Cotado',         color: 'bg-blue-100 text-blue-700'  },
  { value: 'em_analise',    label: 'Em análise',     color: 'bg-indigo-100 text-indigo-700' },
  { value: 'em_negociacao', label: 'Negociação',     color: 'bg-amber-100 text-amber-700' },
  { value: 'aprovado',      label: 'Aprovado',       color: 'bg-green-100 text-green-700' },
  { value: 'reprovado',     label: 'Reprovado',      color: 'bg-red-100 text-red-700'    },
  { value: 'cancelado',     label: 'Cancelado',      color: 'bg-slate-100 text-slate-500' },
  { value: 'assinado',      label: 'Assinado',       color: 'bg-emerald-100 text-emerald-700' },
  { value: 'pago',          label: 'Pago',           color: 'bg-teal-100 text-teal-700'  },
]

const FORM_INICIAL = {
  titulo: '', fornecedor_id: '', fornecedor_nome: '', fase_id: '', fase_nome: '',
  valor_total: '', data_emissao: '', data_validade: '', data_entrega: '',
  status: 'rascunho', observacoes: '', itens: []
}

const ITEM_INICIAL = { descricao: '', quantidade: 1, unidade: 'un', valorUnit: 0, valorTotal: 0 }

export default function OrcamentosPage() {
  const { obraAtiva } = useObra()
  const [orcamentos, setOrcamentos]     = useState([])
  const [fases, setFases]               = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [loading, setLoading]           = useState(true)
  const [modal, setModal]               = useState(false)
  const [editando, setEditando]         = useState(null)
  const [saving, setSaving]             = useState(false)
  const [busca, setBusca]               = useState('')
  const [form, setForm]                 = useState(FORM_INICIAL)
  const [itens, setItens]               = useState([{ ...ITEM_INICIAL }])
  const [detModal, setDetModal]         = useState(null)
  const [dragOver, setDragOver]         = useState(null)

  useEffect(() => { if (obraAtiva) load() }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    const [{ data: o }, { data: f }, { data: forn }] = await Promise.all([
      supabase.from('orcamentos').select('*').eq('obra_id', obraAtiva.id).order('created_at', { ascending: false }),
      supabase.from('fases').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero'),
      supabase.from('fornecedores').select('id,nome').eq('obra_id', obraAtiva.id).order('nome'),
    ])
    setOrcamentos(o || [])
    setFases(f || [])
    setFornecedores(forn || [])
    setLoading(false)
  }

  async function salvar() {
    if (!form.titulo.trim()) return
    setSaving(true)
    const fase = fases.find(f => f.id === form.fase_id)
    const forn = fornecedores.find(f => f.id === form.fornecedor_id)
    const valorCalc = itens.reduce((s, i) => s + (parseFloat(i.valorTotal) || 0), 0)
    const payload = {
      ...form,
      fase_nome: fase?.nome || '',
      fornecedor_nome: forn?.nome || form.fornecedor_nome,
      valor_total: valorCalc || parseFloat(form.valor_total) || 0,
      itens,
      obra_id: obraAtiva.id,
    }
    let error
    if (editando) {
      ;({ error } = await supabase.from('orcamentos').update(payload).eq('id', editando.id))
    } else {
      ;({ error } = await supabase.from('orcamentos').insert(payload))
    }
    setSaving(false)
    if (!error) {
      setModal(false)
      setEditando(null)
      setForm(FORM_INICIAL)
      setItens([{ ...ITEM_INICIAL }])
      load()
    }
  }

  async function atualizarStatus(id, status) {
    await supabase.from('orcamentos').update({ status }).eq('id', id)
    setOrcamentos(prev => prev.map(o => o.id === id ? { ...o, status } : o))
  }

  async function excluir(id) {
    if (!confirm('Excluir este orçamento?')) return
    await supabase.from('orcamentos').delete().eq('id', id)
    load()
  }

  function abrirEditar(orc) {
    setEditando(orc)
    setForm({ ...orc })
    setItens(orc.itens?.length ? orc.itens : [{ ...ITEM_INICIAL }])
    setModal(true)
  }

  function atualizarItem(idx, field, value) {
    setItens(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      if (field === 'quantidade' || field === 'valorUnit') {
        const qty = parseFloat(field === 'quantidade' ? value : updated[idx].quantidade) || 0
        const vu  = parseFloat(field === 'valorUnit'  ? value : updated[idx].valorUnit)  || 0
        updated[idx].valorTotal = qty * vu
      }
      return updated
    })
  }

  const totalItens = itens.reduce((s, i) => s + (parseFloat(i.valorTotal) || 0), 0)

  const orcFiltrados = orcamentos.filter(o =>
    !busca ||
    o.titulo?.toLowerCase().includes(busca.toLowerCase()) ||
    o.fornecedor_nome?.toLowerCase().includes(busca.toLowerCase())
  )

  // Agrupados por status
  const grupos = STATUS_COLUNAS.map(col => ({
    ...col,
    items: orcFiltrados.filter(o => o.status === col.value)
  }))

  // Totais por status
  const totalAprovado = orcamentos
    .filter(o => ['aprovado','assinado','pago'].includes(o.status))
    .reduce((s, o) => s + (o.valor_total || 0), 0)

  if (!obraAtiva) return (
    <div className="text-center py-20 text-brand-muted">
      <BarChart3 size={40} className="mx-auto mb-3 opacity-40" />
      <p>Selecione uma obra para ver os orçamentos.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Orçamentos</h1>
          <p className="text-sm text-brand-muted">
            {orcamentos.length} orçamento{orcamentos.length !== 1 ? 's' : ''} · {formatCurrency(totalAprovado)} aprovados
          </p>
        </div>
        <Button onClick={() => { setEditando(null); setForm(FORM_INICIAL); setItens([{ ...ITEM_INICIAL }]); setModal(true) }}>
          <Plus size={16} /> Novo Orçamento
        </Button>
      </div>

      {/* Busca */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar orçamento..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-brand-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={28} className="animate-spin text-brand-accent" />
        </div>
      ) : (
        /* Kanban horizontal com scroll */
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4" style={{ minWidth: `${STATUS_COLUNAS.length * 220}px` }}>
            {grupos.map(col => (
              <KanbanColuna
                key={col.value}
                coluna={col}
                onEdit={abrirEditar}
                onDelete={excluir}
                onStatusChange={atualizarStatus}
                onDetail={setDetModal}
                allStatus={STATUS_COLUNAS}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal criar/editar */}
      <Modal
        open={modal}
        onClose={() => { setModal(false); setEditando(null) }}
        title={editando ? 'Editar Orçamento' : 'Novo Orçamento'}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            label="Título *"
            value={form.titulo}
            onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
            placeholder="Ex: Orçamento de esquadrias — alumínio"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-muted mb-1">Fornecedor</label>
              <select
                value={form.fornecedor_id}
                onChange={e => setForm(p => ({ ...p, fornecedor_id: e.target.value }))}
                className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
              >
                <option value="">— selecionar —</option>
                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-muted mb-1">Fase</label>
              <select
                value={form.fase_id}
                onChange={e => setForm(p => ({ ...p, fase_id: e.target.value }))}
                className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
              >
                <option value="">— sem fase —</option>
                {fases.map(f => <option key={f.id} value={f.id}>{f.numero}. {f.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Emissão" type="date" value={form.data_emissao} onChange={e => setForm(p => ({ ...p, data_emissao: e.target.value }))} />
            <Input label="Validade" type="date" value={form.data_validade} onChange={e => setForm(p => ({ ...p, data_validade: e.target.value }))} />
            <Input label="Entrega prevista" type="date" value={form.data_entrega} onChange={e => setForm(p => ({ ...p, data_entrega: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
            >
              {STATUS_COLUNAS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Itens */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-brand-muted">Itens do orçamento</label>
              <button
                onClick={() => setItens(p => [...p, { ...ITEM_INICIAL }])}
                className="text-xs text-brand-accent hover:underline"
              >+ Adicionar item</button>
            </div>
            <div className="space-y-2">
              {itens.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-start">
                  <input
                    value={item.descricao}
                    onChange={e => atualizarItem(idx, 'descricao', e.target.value)}
                    placeholder="Descrição"
                    className="col-span-4 text-xs border border-brand-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-accent/30"
                  />
                  <input
                    value={item.quantidade}
                    type="number"
                    onChange={e => atualizarItem(idx, 'quantidade', e.target.value)}
                    placeholder="Qtd"
                    className="col-span-2 text-xs border border-brand-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-accent/30"
                  />
                  <input
                    value={item.unidade}
                    onChange={e => atualizarItem(idx, 'unidade', e.target.value)}
                    placeholder="un"
                    className="col-span-1 text-xs border border-brand-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-accent/30"
                  />
                  <input
                    value={item.valorUnit}
                    type="number"
                    step="0.01"
                    onChange={e => atualizarItem(idx, 'valorUnit', e.target.value)}
                    placeholder="Valor unit."
                    className="col-span-2 text-xs border border-brand-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-accent/30"
                  />
                  <div className="col-span-2 text-xs font-medium text-brand-accent px-2 py-1.5">
                    {formatCurrency(item.valorTotal)}
                  </div>
                  <button
                    onClick={() => setItens(p => p.filter((_, i) => i !== idx))}
                    className="col-span-1 text-brand-muted hover:text-status-red p-1"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            {itens.length > 0 && (
              <div className="flex justify-end mt-2 text-sm font-bold text-brand-dark">
                Total: {formatCurrency(totalItens)}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1">Observações</label>
            <textarea
              value={form.observacoes}
              onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
              rows={2}
              className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setModal(false); setEditando(null) }}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {editando ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal detalhe */}
      {detModal && (
        <Modal open={!!detModal} onClose={() => setDetModal(null)} title={detModal.titulo}>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-brand-muted text-xs">Fornecedor</span><p className="font-medium">{detModal.fornecedor_nome || '—'}</p></div>
              <div><span className="text-brand-muted text-xs">Fase</span><p className="font-medium">{detModal.fase_nome || '—'}</p></div>
              <div><span className="text-brand-muted text-xs">Emissão</span><p>{formatDate(detModal.data_emissao)}</p></div>
              <div><span className="text-brand-muted text-xs">Validade</span><p>{formatDate(detModal.data_validade)}</p></div>
            </div>
            {detModal.itens?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-brand-muted mb-2">Itens</p>
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-brand-border">
                    <th className="text-left pb-1 text-brand-muted">Descrição</th>
                    <th className="text-right pb-1 text-brand-muted">Qtd</th>
                    <th className="text-right pb-1 text-brand-muted">Unit.</th>
                    <th className="text-right pb-1 text-brand-muted">Total</th>
                  </tr></thead>
                  <tbody>
                    {detModal.itens.map((item, i) => (
                      <tr key={i} className="border-b border-brand-border/50">
                        <td className="py-1">{item.descricao}</td>
                        <td className="text-right py-1">{item.quantidade} {item.unidade}</td>
                        <td className="text-right py-1">{formatCurrency(item.valorUnit)}</td>
                        <td className="text-right py-1 font-medium text-brand-accent">{formatCurrency(item.valorTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr>
                    <td colSpan={3} className="text-right pt-2 font-bold text-brand-dark">Total:</td>
                    <td className="text-right pt-2 font-bold text-brand-accent">{formatCurrency(detModal.valor_total)}</td>
                  </tr></tfoot>
                </table>
              </div>
            )}
            {detModal.observacoes && <p className="text-brand-muted text-xs">{detModal.observacoes}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}

function KanbanColuna({ coluna, onEdit, onDelete, onStatusChange, onDetail, allStatus }) {
  return (
    <div className="flex-shrink-0 w-52">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", coluna.color)}>
          {coluna.label}
        </span>
        <span className="text-xs text-brand-muted">{coluna.items.length}</span>
      </div>
      <div className="space-y-2 min-h-[80px]">
        {coluna.items.map(orc => (
          <OrcamentoCard
            key={orc.id}
            orc={orc}
            onEdit={onEdit}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
            onDetail={onDetail}
            allStatus={allStatus}
            currentStatus={coluna.value}
          />
        ))}
      </div>
    </div>
  )
}

function OrcamentoCard({ orc, onEdit, onDelete, onStatusChange, onDetail, allStatus, currentStatus }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const currentIdx = allStatus.findIndex(s => s.value === currentStatus)

  return (
    <div className="bg-white border border-brand-border rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="gradient-bar rounded-t-xl absolute top-0 left-0 right-0 h-0.5" />

      <p
        className="text-xs font-medium text-brand-dark mb-1 cursor-pointer hover:text-brand-accent line-clamp-2 leading-snug"
        onClick={() => onDetail(orc)}
      >
        {orc.titulo}
      </p>

      {orc.fornecedor_nome && (
        <p className="text-[10px] text-brand-muted truncate mb-1">{orc.fornecedor_nome}</p>
      )}

      {orc.fase_nome && (
        <p className="text-[10px] bg-brand-bg text-brand-muted px-1.5 py-0.5 rounded-full inline-block mb-2 truncate max-w-full">
          {orc.fase_nome}
        </p>
      )}

      <p className="text-sm font-bold text-brand-accent mb-2">{formatCurrency(orc.valor_total)}</p>

      {orc.data_validade && (
        <p className="text-[10px] text-brand-muted flex items-center gap-1 mb-2">
          <Calendar size={9} /> Val: {formatDate(orc.data_validade)}
        </p>
      )}

      <div className="flex items-center gap-1 justify-end">
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 hover:bg-brand-bg rounded text-brand-muted hover:text-brand-dark"
            title="Mover para..."
          >
            <ChevronRight size={12} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-50 bg-white border border-brand-border rounded-lg shadow-lg py-1 w-36">
              {allStatus.filter(s => s.value !== currentStatus).map(s => (
                <button
                  key={s.value}
                  onClick={() => { onStatusChange(orc.id, s.value); setMenuOpen(false) }}
                  className="block w-full text-left px-3 py-1.5 text-xs hover:bg-brand-bg text-brand-dark"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => onEdit(orc)} className="p-1 hover:bg-brand-bg rounded text-brand-muted hover:text-brand-dark">
          <Edit2 size={12} />
        </button>
        <button onClick={() => onDelete(orc.id)} className="p-1 hover:bg-red-50 rounded text-brand-muted hover:text-status-red">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
