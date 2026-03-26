import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import { propagarInsumo } from '@/lib/propagation'
import { Plus, Search, Loader2, Package } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import { formatCurrency, formatPercent, calcDesvio, classifyABC, cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const STATUS_INSUMO = ['nao_cotado','cotado','aprovado','comprado','entregue']
const STATUS_LABELS = { nao_cotado:'Não cotado', cotado:'Cotado', aprovado:'Aprovado', comprado:'Comprado', entregue:'Entregue' }

export default function InsumosPage() {
  const { obraAtiva } = useObra()
  const [insumos, setInsumos] = useState([])
  const [fases, setFases]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filtros, setFiltros] = useState({ classe: '', status: '' })
  const [modal, setModal]     = useState(null)
  const [saving, setSaving]   = useState(false)

  useEffect(() => { if (obraAtiva) load() }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    const [{ data: ins }, { data: fas }] = await Promise.all([
      supabase.from('insumos').select('*').eq('obra_id', obraAtiva.id).order('ranking'),
      supabase.from('fases').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero'),
    ])
    setInsumos(classifyABC(ins || []))
    setFases(fas || [])
    setLoading(false)
  }

  async function atualizarStatus(insumo, novoStatus) {
    await supabase.from('insumos').update({ status: novoStatus }).eq('id', insumo.id)
    await propagarInsumo({ obraId: obraAtiva.id, insumoId: insumo.id, faseId: insumo.fase_id, novoStatus })
    await load()
  }

  async function salvarInsumo(dados, id) {
    setSaving(true)
    if (id) {
      await supabase.from('insumos').update(dados).eq('id', id)
    } else {
      await supabase.from('insumos').insert({ ...dados, obra_id: obraAtiva.id })
    }
    setSaving(false)
    setModal(null)
    await load()
  }

  const filtrados = insumos.filter(i => {
    if (filtros.classe && i.classe !== filtros.classe) return false
    if (filtros.status && i.status !== filtros.status) return false
    if (search && !i.nome.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalOrcado   = insumos.reduce((s, i) => s + (i.valor_orcado || 0), 0)
  const totalRealizado = insumos.reduce((s, i) => s + (i.valor_realizado || 0), 0)
  const desvio = calcDesvio(totalRealizado, totalOrcado)

  // ABC chart (top 20)
  const abcData = [...insumos].slice(0, 20).map(i => ({
    nome: i.nome.slice(0, 16),
    valor: i.valor_orcado || 0,
    classe: i.classe,
  }))

  if (!obraAtiva) return <p className="text-brand-muted text-center py-20">Selecione uma obra.</p>
  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-brand-accent" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Insumos</h1>
          <p className="text-sm text-brand-muted">Classificação ABC · {insumos.length} itens</p>
        </div>
        <Button size="sm" onClick={() => setModal({})}><Plus size={14} /> Novo Insumo</Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total orçado',   value: formatCurrency(totalOrcado),    color: 'text-brand-dark' },
          { label: 'Total realizado', value: formatCurrency(totalRealizado), color: 'text-brand-accent' },
          { label: 'Variação R$', value: formatCurrency(totalRealizado - totalOrcado), color: desvio > 0 ? 'text-status-red' : 'text-status-green' },
          { label: 'Variação %',  value: formatPercent(desvio), color: desvio > 0 ? 'text-status-red' : 'text-status-green' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card-base p-4"><div className="gradient-bar" />
            <p className="text-xs text-brand-muted">{label}</p>
            <p className={cn("text-lg font-display font-bold mt-1", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Curva ABC */}
      {abcData.length > 0 && (
        <div className="card-base p-5 mb-6">
          <div className="gradient-bar" />
          <h3 className="font-display font-bold text-brand-dark mb-4">Curva ABC (top 20)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={abcData} layout="vertical">
              <XAxis type="number" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9aa3b5' }} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 9, fill: '#9aa3b5' }} width={100} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="valor" radius={[0,4,4,0]}>
                {abcData.map((d, i) => <Cell key={i} fill={d.classe === 'A' ? '#EF4444' : d.classe === 'B' ? '#EAB308' : '#3b82f6'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            placeholder="Buscar insumo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 w-full rounded-xl border border-brand-border pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
          />
        </div>
        <Select value={filtros.classe} onChange={e => setFiltros(p => ({...p, classe: e.target.value}))} className="w-28">
          <option value="">Classe</option>
          <option value="A">Classe A</option>
          <option value="B">Classe B</option>
          <option value="C">Classe C</option>
        </Select>
        <Select value={filtros.status} onChange={e => setFiltros(p => ({...p, status: e.target.value}))} className="w-36">
          <option value="">Status</option>
          {STATUS_INSUMO.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </Select>
      </div>

      {/* Tabela */}
      <div className="card-base overflow-hidden">
        <div className="gradient-bar" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg">
                {['#','Classe','Nome','Categoria','Orçado','Realizado','Desvio','Status',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-brand-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-brand-muted text-sm">
                  <Package size={32} className="mx-auto mb-2 opacity-40" />
                  Nenhum insumo encontrado.
                </td></tr>
              ) : filtrados.map(ins => {
                const desvioIns = calcDesvio(ins.valor_realizado || 0, ins.valor_orcado || 0)
                return (
                  <tr key={ins.id} className="border-b border-brand-border hover:bg-brand-bg transition-colors">
                    <td className="px-4 py-3 text-brand-muted">{ins.ranking}</td>
                    <td className="px-4 py-3">
                      <Badge variant={ins.classe}>{ins.classe}</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-brand-dark">{ins.nome}</td>
                    <td className="px-4 py-3 text-brand-muted">{ins.categoria}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(ins.valor_orcado)}</td>
                    <td className="px-4 py-3">{formatCurrency(ins.valor_realizado || 0)}</td>
                    <td className={cn("px-4 py-3 font-medium text-xs", desvioIns > 0 ? "text-status-red" : "text-status-green")}>
                      {desvioIns !== 0 ? (desvioIns > 0 ? '+' : '') + formatPercent(desvioIns) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Select value={ins.status} onChange={e => atualizarStatus(ins, e.target.value)} className="w-32 h-7 text-xs">
                        {STATUS_INSUMO.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" onClick={() => setModal(ins)}>Editar</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal !== null && (
        <ModalInsumo
          insumo={modal.id ? modal : null}
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
    nome: insumo?.nome || '', categoria: insumo?.categoria || '',
    valor_orcado: insumo?.valor_orcado || '', unidade: insumo?.unidade || '',
    quantidade: insumo?.quantidade || '', preco_unitario: insumo?.preco_unitario || '',
    fornecedor: insumo?.fornecedor || '', fase_id: insumo?.fase_id || '',
    status: insumo?.status || 'nao_cotado',
  })
  return (
    <Modal open onClose={onClose} title={insumo ? 'Editar Insumo' : 'Novo Insumo'} size="lg">
      <div className="p-6 grid grid-cols-2 gap-4">
        <div className="col-span-2"><Input label="Nome *" value={form.nome} onChange={e => setForm(p=>({...p,nome:e.target.value}))} /></div>
        <Input label="Categoria" value={form.categoria} onChange={e => setForm(p=>({...p,categoria:e.target.value}))} />
        <Input label="Valor orçado (R$)" type="number" value={form.valor_orcado} onChange={e => setForm(p=>({...p,valor_orcado:e.target.value}))} />
        <Input label="Unidade" value={form.unidade} onChange={e => setForm(p=>({...p,unidade:e.target.value}))} placeholder="m², kg, un..." />
        <Input label="Quantidade" type="number" value={form.quantidade} onChange={e => setForm(p=>({...p,quantidade:e.target.value}))} />
        <Input label="Preço unitário" type="number" value={form.preco_unitario} onChange={e => setForm(p=>({...p,preco_unitario:e.target.value}))} />
        <Input label="Fornecedor" value={form.fornecedor} onChange={e => setForm(p=>({...p,fornecedor:e.target.value}))} />
        <Select label="Fase" value={form.fase_id} onChange={e => setForm(p=>({...p,fase_id:e.target.value}))}>
          <option value="">Nenhuma</option>
          {fases.map(f => <option key={f.id} value={f.id}>{f.numero}. {f.nome.slice(0,30)}</option>)}
        </Select>
        <Select label="Status" value={form.status} onChange={e => setForm(p=>({...p,status:e.target.value}))}>
          {STATUS_INSUMO.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </Select>
        <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-brand-border">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={() => form.nome && onSave(form, insumo?.id)}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}
