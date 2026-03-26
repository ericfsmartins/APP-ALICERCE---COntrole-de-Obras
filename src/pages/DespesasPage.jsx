import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import { Plus, Search, Download, Loader2, Receipt } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import { formatCurrency, formatDate, getStatusColor, getStatusLabel, cn } from '@/lib/utils'
import { propagarDespesa } from '@/lib/propagation'

const TIPOS = { mao_obra:'Mão de Obra', material:'Material', servico:'Serviço', equipamento:'Equipamento', outro:'Outro' }
const TIPO_COLORS = { mao_obra:'blue', material:'amber', servico:'green', equipamento:'default', outro:'default' }
const PAGAMENTO_COLORS = { pendente:'amber', pago:'green', vencido:'red' }

export default function DespesasPage() {
  const { obraAtiva } = useObra()
  const [despesas, setDespesas] = useState([])
  const [fases, setFases]       = useState([])
  const [momentos, setMomentos] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filtros, setFiltros]   = useState({ tipo: '', status_pagamento: '', fase_id: '' })
  const [modal, setModal]       = useState(null)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { if (obraAtiva) load() }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    const [{ data: d }, { data: f }, { data: m }] = await Promise.all([
      supabase.from('despesas').select('*').eq('obra_id', obraAtiva.id).order('data_lancamento', { ascending: false }),
      supabase.from('fases').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero'),
      supabase.from('momentos').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero'),
    ])
    setDespesas(d || [])
    setFases(f || [])
    setMomentos(m || [])
    setLoading(false)
  }

  async function salvarDespesa(dados, id) {
    setSaving(true)
    if (id) {
      await supabase.from('despesas').update(dados).eq('id', id)
    } else {
      const { data } = await supabase.from('despesas').insert({ ...dados, obra_id: obraAtiva.id }).select().single()
      if (data) await propagarDespesa({ obraId: obraAtiva.id, faseId: dados.fase_id, momentoId: dados.momento_id, valor: dados.valor })
    }
    setSaving(false)
    setModal(null)
    await load()
  }

  async function exportarCSV() {
    const headers = ['Data','Descrição','Tipo','Fase','Momento','Fornecedor','Valor','Status Pagamento']
    const rows = despesas.map(d => [
      formatDate(d.data_lancamento), d.descricao, TIPOS[d.tipo] || d.tipo,
      d.fase_nome || '', d.momento_nome || '', d.fornecedor_nome || '',
      d.valor, d.status_pagamento
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'despesas.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const filtradas = despesas.filter(d => {
    if (filtros.tipo && d.tipo !== filtros.tipo) return false
    if (filtros.status_pagamento && d.status_pagamento !== filtros.status_pagamento) return false
    if (filtros.fase_id && d.fase_id !== filtros.fase_id) return false
    if (search && !d.descricao.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalPago     = despesas.filter(d => d.status_pagamento === 'pago').reduce((s, d) => s + d.valor, 0)
  const totalPendente = despesas.filter(d => d.status_pagamento === 'pendente').reduce((s, d) => s + d.valor, 0)
  const totalVencido  = despesas.filter(d => d.status_pagamento === 'vencido').reduce((s, d) => s + d.valor, 0)

  if (!obraAtiva) return <p className="text-brand-muted text-center py-20">Selecione uma obra.</p>
  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-brand-accent" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Despesas</h1>
          <p className="text-sm text-brand-muted">{despesas.length} despesas registradas</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={exportarCSV}><Download size={14} /> CSV</Button>
          <Button size="sm" onClick={() => setModal({})}><Plus size={14} /> Nova</Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total pago',     value: totalPago,     color: 'text-status-green' },
          { label: 'Total pendente', value: totalPendente, color: 'text-amber-600'    },
          { label: 'Total vencido',  value: totalVencido,  color: 'text-status-red'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="card-base p-4"><div className="gradient-bar" />
            <p className="text-xs text-brand-muted">{label}</p>
            <p className={cn("text-lg font-display font-bold mt-1", color)}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-9 w-full rounded-xl border border-brand-border pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30" />
        </div>
        <Select value={filtros.tipo} onChange={e => setFiltros(p => ({...p, tipo: e.target.value}))} className="w-36">
          <option value="">Tipo</option>
          {Object.entries(TIPOS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select value={filtros.status_pagamento} onChange={e => setFiltros(p => ({...p, status_pagamento: e.target.value}))} className="w-36">
          <option value="">Pagamento</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="vencido">Vencido</option>
        </Select>
        <Select value={filtros.fase_id} onChange={e => setFiltros(p => ({...p, fase_id: e.target.value}))} className="w-44">
          <option value="">Fase</option>
          {fases.map(f => <option key={f.id} value={f.id}>{f.numero}. {f.nome.slice(0,25)}</option>)}
        </Select>
      </div>

      {/* Tabela */}
      <div className="card-base overflow-hidden">
        <div className="gradient-bar" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg">
                {['Data','Descrição','Tipo','Fase','Valor','Pagamento',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-brand-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-brand-muted">
                  <Receipt size={32} className="mx-auto mb-2 opacity-40" />Nenhuma despesa.
                </td></tr>
              ) : filtradas.map(d => (
                <tr key={d.id} className="border-b border-brand-border hover:bg-brand-bg">
                  <td className="px-4 py-3 text-brand-muted whitespace-nowrap">{formatDate(d.data_lancamento)}</td>
                  <td className="px-4 py-3 font-medium text-brand-dark max-w-[200px] truncate">{d.descricao}</td>
                  <td className="px-4 py-3"><Badge variant={TIPO_COLORS[d.tipo]}>{TIPOS[d.tipo] || d.tipo}</Badge></td>
                  <td className="px-4 py-3 text-brand-muted text-xs max-w-[120px] truncate">{d.fase_nome || '—'}</td>
                  <td className="px-4 py-3 font-bold text-brand-accent">{formatCurrency(d.valor)}</td>
                  <td className="px-4 py-3"><Badge variant={PAGAMENTO_COLORS[d.status_pagamento]}>{getStatusLabel(d.status_pagamento)}</Badge></td>
                  <td className="px-4 py-3"><Button size="sm" variant="ghost" onClick={() => setModal(d)}>Editar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== null && (
        <ModalDespesa
          despesa={modal.id ? modal : null}
          fases={fases} momentos={momentos}
          onSave={salvarDespesa}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
    </div>
  )
}

function ModalDespesa({ despesa, fases, momentos, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    descricao: despesa?.descricao || '',
    valor: despesa?.valor || '',
    tipo: despesa?.tipo || 'material',
    fase_id: despesa?.fase_id || '',
    fase_nome: despesa?.fase_nome || '',
    momento_id: despesa?.momento_id || '',
    momento_nome: despesa?.momento_nome || '',
    fornecedor_nome: despesa?.fornecedor_nome || '',
    data_lancamento: despesa?.data_lancamento || new Date().toISOString().split('T')[0],
    data_vencimento: despesa?.data_vencimento || '',
    status_pagamento: despesa?.status_pagamento || 'pendente',
    forma_pagamento: despesa?.forma_pagamento || '',
    observacoes: despesa?.observacoes || '',
  })

  function handleFase(e) {
    const fase = fases.find(f => f.id === e.target.value)
    setForm(p => ({ ...p, fase_id: e.target.value, fase_nome: fase?.nome || '' }))
  }
  function handleMomento(e) {
    const m = momentos.find(m => m.id === e.target.value)
    setForm(p => ({ ...p, momento_id: e.target.value, momento_nome: m?.nome || '' }))
  }

  return (
    <Modal open onClose={onClose} title={despesa ? 'Editar Despesa' : 'Nova Despesa'} size="lg">
      <div className="p-6 grid grid-cols-2 gap-4">
        <div className="col-span-2"><Input label="Descrição *" value={form.descricao} onChange={e => setForm(p=>({...p,descricao:e.target.value}))} /></div>
        <Input label="Valor (R$) *" type="number" step="0.01" value={form.valor} onChange={e => setForm(p=>({...p,valor:e.target.value}))} />
        <Select label="Tipo" value={form.tipo} onChange={e => setForm(p=>({...p,tipo:e.target.value}))}>
          {Object.entries(TIPOS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select label="Fase" value={form.fase_id} onChange={handleFase}>
          <option value="">Nenhuma</option>
          {fases.map(f => <option key={f.id} value={f.id}>{f.numero}. {f.nome.slice(0,30)}</option>)}
        </Select>
        <Select label="Momento" value={form.momento_id} onChange={handleMomento}>
          <option value="">Nenhum</option>
          {momentos.map(m => <option key={m.id} value={m.id}>M{m.numero} - {m.nome.split('—')[0].trim().slice(0,20)}</option>)}
        </Select>
        <Input label="Fornecedor" value={form.fornecedor_nome} onChange={e => setForm(p=>({...p,fornecedor_nome:e.target.value}))} />
        <Select label="Forma de pagamento" value={form.forma_pagamento} onChange={e => setForm(p=>({...p,forma_pagamento:e.target.value}))}>
          <option value="">Selecione...</option>
          <option value="pix">PIX</option><option value="boleto">Boleto</option>
          <option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option>
          <option value="cartao">Cartão</option>
        </Select>
        <Input label="Data lançamento" type="date" value={form.data_lancamento} onChange={e => setForm(p=>({...p,data_lancamento:e.target.value}))} />
        <Input label="Vencimento" type="date" value={form.data_vencimento} onChange={e => setForm(p=>({...p,data_vencimento:e.target.value}))} />
        <Select label="Status pagamento" value={form.status_pagamento} onChange={e => setForm(p=>({...p,status_pagamento:e.target.value}))}>
          <option value="pendente">Pendente</option><option value="pago">Pago</option><option value="vencido">Vencido</option>
        </Select>
        <div className="col-span-2">
          <label className="text-xs font-medium text-brand-dark">Observações</label>
          <textarea className="mt-1 w-full rounded-xl border border-brand-border px-3 py-2 text-sm focus:outline-none" rows={2}
            value={form.observacoes} onChange={e => setForm(p=>({...p,observacoes:e.target.value}))} />
        </div>
        <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-brand-border">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={() => form.descricao && form.valor && onSave(form, despesa?.id)}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}
