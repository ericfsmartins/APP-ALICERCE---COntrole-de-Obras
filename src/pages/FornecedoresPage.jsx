import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import {
  Store, Plus, Loader2, Star, Phone, Mail, MapPin,
  Search, Trash2, Edit2, ChevronDown, ChevronUp
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

const TIPOS = [
  { value: 'material',    label: 'Material'    },
  { value: 'servico',     label: 'Serviço'     },
  { value: 'mao_obra',    label: 'Mão de Obra' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'misto',       label: 'Misto'       },
]

const TIPO_COLORS = {
  material:    'bg-amber-100 text-amber-700',
  servico:     'bg-blue-100 text-blue-700',
  mao_obra:    'bg-green-100 text-green-700',
  equipamento: 'bg-purple-100 text-purple-700',
  misto:       'bg-slate-100 text-slate-700',
}

const STATUS_COLORS = {
  ativo:     'bg-green-100 text-green-700',
  inativo:   'bg-slate-100 text-slate-500',
  suspenso:  'bg-red-100 text-red-700',
}

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          className={cn(
            "transition-colors",
            n <= (value || 0) ? "text-amber-400" : "text-slate-300 hover:text-amber-300"
          )}
        >
          <Star size={16} fill={n <= (value || 0) ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}

const FORM_INICIAL = {
  nome: '', tipo: 'servico', cnpj_cpf: '', contato_nome: '',
  telefone: '', email: '', endereco: '', avaliacao: 0,
  especialidades: '', observacoes: '', status: 'ativo'
}

export default function FornecedoresPage() {
  const { obraAtiva } = useObra()
  const [fornecedores, setFornecedores] = useState([])
  const [loading, setLoading]           = useState(true)
  const [modal, setModal]               = useState(false)
  const [editando, setEditando]         = useState(null)
  const [saving, setSaving]             = useState(false)
  const [busca, setBusca]               = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('')
  const [filtroStatus, setFiltroStatus] = useState('ativo')
  const [expandido, setExpandido]       = useState(null)
  const [despesasMap, setDespesasMap]   = useState({})
  const [form, setForm]                 = useState(FORM_INICIAL)

  useEffect(() => { if (obraAtiva) load() }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('fornecedores')
      .select('*')
      .eq('obra_id', obraAtiva.id)
      .order('nome')
    setFornecedores(data || [])
    setLoading(false)
  }

  async function loadDespesasFornecedor(fornId) {
    if (despesasMap[fornId]) return
    const { data } = await supabase
      .from('despesas')
      .select('id,descricao,valor,data_lancamento,tipo')
      .eq('obra_id', obraAtiva.id)
      .eq('fornecedor_id', fornId)
      .order('data_lancamento', { ascending: false })
      .limit(5)
    setDespesasMap(prev => ({ ...prev, [fornId]: data || [] }))
  }

  async function salvar() {
    if (!form.nome.trim()) return
    setSaving(true)
    const payload = {
      ...form,
      especialidades: form.especialidades
        ? form.especialidades.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      obra_id: obraAtiva.id,
    }
    let error
    if (editando) {
      ;({ error } = await supabase.from('fornecedores').update(payload).eq('id', editando.id))
    } else {
      ;({ error } = await supabase.from('fornecedores').insert(payload))
    }
    setSaving(false)
    if (!error) {
      setModal(false)
      setEditando(null)
      setForm(FORM_INICIAL)
      load()
    }
  }

  function abrirEditar(forn) {
    setEditando(forn)
    setForm({
      ...forn,
      especialidades: Array.isArray(forn.especialidades)
        ? forn.especialidades.join(', ')
        : (forn.especialidades || ''),
    })
    setModal(true)
  }

  async function excluir(id) {
    if (!confirm('Excluir este fornecedor?')) return
    await supabase.from('fornecedores').delete().eq('id', id)
    load()
  }

  async function toggleExpand(id) {
    if (expandido === id) {
      setExpandido(null)
    } else {
      setExpandido(id)
      loadDespesasFornecedor(id)
    }
  }

  const lista = fornecedores.filter(f => {
    if (filtroTipo && f.tipo !== filtroTipo) return false
    if (filtroStatus && f.status !== filtroStatus) return false
    if (busca && !f.nome.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  })

  if (!obraAtiva) return (
    <div className="text-center py-20 text-brand-muted">
      <Store size={40} className="mx-auto mb-3 opacity-40" />
      <p>Selecione uma obra para ver os fornecedores.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Fornecedores</h1>
          <p className="text-sm text-brand-muted">{fornecedores.length} fornecedor{fornecedores.length !== 1 ? 'es' : ''}</p>
        </div>
        <Button onClick={() => { setEditando(null); setForm(FORM_INICIAL); setModal(true) }}>
          <Plus size={16} /> Novo Fornecedor
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar fornecedor..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-brand-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
          />
        </div>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="text-sm border border-brand-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
        >
          <option value="">Todos os tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
          className="text-sm border border-brand-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
        >
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
          <option value="suspenso">Suspenso</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={28} className="animate-spin text-brand-accent" />
        </div>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 text-brand-muted">
          <Store size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum fornecedor encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {lista.map(forn => (
            <FornecedorCard
              key={forn.id}
              forn={forn}
              expanded={expandido === forn.id}
              despesas={despesasMap[forn.id]}
              onToggle={() => toggleExpand(forn.id)}
              onEdit={() => abrirEditar(forn)}
              onDelete={() => excluir(forn.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modal}
        onClose={() => { setModal(false); setEditando(null) }}
        title={editando ? 'Editar Fornecedor' : 'Novo Fornecedor'}
      >
        <div className="space-y-4">
          <Input
            label="Nome *"
            value={form.nome}
            onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
            placeholder="Razão social ou nome"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-muted mb-1">Tipo</label>
              <select
                value={form.tipo}
                onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
              >
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-muted mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="suspenso">Suspenso</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="CNPJ / CPF"
              value={form.cnpj_cpf}
              onChange={e => setForm(p => ({ ...p, cnpj_cpf: e.target.value }))}
              placeholder="00.000.000/0001-00"
            />
            <Input
              label="Contato"
              value={form.contato_nome}
              onChange={e => setForm(p => ({ ...p, contato_nome: e.target.value }))}
              placeholder="Nome do responsável"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Telefone"
              value={form.telefone}
              onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))}
              placeholder="(11) 99999-9999"
            />
            <Input
              label="E-mail"
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="email@empresa.com"
            />
          </div>
          <Input
            label="Endereço"
            value={form.endereco}
            onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))}
            placeholder="Rua, número, cidade"
          />
          <Input
            label="Especialidades (separadas por vírgula)"
            value={form.especialidades}
            onChange={e => setForm(p => ({ ...p, especialidades: e.target.value }))}
            placeholder="concreto, estruturas metálicas, fundações"
          />
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-2">Avaliação</label>
            <StarRating
              value={form.avaliacao}
              onChange={v => setForm(p => ({ ...p, avaliacao: v }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1">Observações</label>
            <textarea
              value={form.observacoes}
              onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
              rows={3}
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
    </div>
  )
}

function FornecedorCard({ forn, expanded, despesas, onToggle, onEdit, onDelete }) {
  const especialidades = Array.isArray(forn.especialidades)
    ? forn.especialidades
    : (forn.especialidades || '').split(',').map(s => s.trim()).filter(Boolean)

  return (
    <div className="card-base overflow-hidden">
      <div className="gradient-bar" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-bold text-brand-dark truncate">{forn.nome}</span>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", STATUS_COLORS[forn.status])}>
                {forn.status === 'ativo' ? 'Ativo' : forn.status === 'inativo' ? 'Inativo' : 'Suspenso'}
              </span>
            </div>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-1 inline-block", TIPO_COLORS[forn.tipo])}>
              {TIPOS.find(t => t.value === forn.tipo)?.label || forn.tipo}
            </span>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={onEdit} className="p-1.5 hover:bg-brand-bg rounded-lg text-brand-muted hover:text-brand-dark transition-colors">
              <Edit2 size={13} />
            </button>
            <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-brand-muted hover:text-status-red transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Avaliação */}
        <div className="flex items-center gap-1 mb-3">
          {[1,2,3,4,5].map(n => (
            <Star
              key={n}
              size={13}
              className={n <= (forn.avaliacao || 0) ? "text-amber-400" : "text-slate-200"}
              fill={n <= (forn.avaliacao || 0) ? 'currentColor' : 'none'}
            />
          ))}
          {forn.avaliacao > 0 && (
            <span className="text-xs text-brand-muted ml-1">{forn.avaliacao}/5</span>
          )}
        </div>

        {/* Contatos */}
        <div className="space-y-1.5 text-xs text-brand-muted">
          {forn.contato_nome && <p className="text-brand-dark font-medium">{forn.contato_nome}</p>}
          {forn.telefone && (
            <a href={`tel:${forn.telefone}`} className="flex items-center gap-1.5 hover:text-brand-accent">
              <Phone size={11} /> {forn.telefone}
            </a>
          )}
          {forn.email && (
            <a href={`mailto:${forn.email}`} className="flex items-center gap-1.5 hover:text-brand-accent truncate">
              <Mail size={11} /> {forn.email}
            </a>
          )}
          {forn.endereco && (
            <p className="flex items-start gap-1.5 truncate">
              <MapPin size={11} className="mt-0.5 flex-shrink-0" /> {forn.endereco}
            </p>
          )}
        </div>

        {/* Especialidades */}
        {especialidades.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {especialidades.map((e, i) => (
              <span key={i} className="text-[10px] bg-brand-bg text-brand-muted px-1.5 py-0.5 rounded-full border border-brand-border">
                {e}
              </span>
            ))}
          </div>
        )}

        {/* Expandir despesas */}
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs text-brand-muted hover:text-brand-accent mt-3 transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? 'Ocultar histórico' : 'Ver últimas despesas'}
        </button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-brand-border space-y-1.5">
            {!despesas ? (
              <div className="flex justify-center py-2">
                <Loader2 size={16} className="animate-spin text-brand-muted" />
              </div>
            ) : despesas.length === 0 ? (
              <p className="text-xs text-brand-muted text-center py-2">Nenhuma despesa vinculada.</p>
            ) : despesas.map(d => (
              <div key={d.id} className="flex items-center justify-between text-xs">
                <span className="text-brand-dark truncate flex-1 mr-2">{d.descricao}</span>
                <span className="text-brand-accent font-medium flex-shrink-0">{formatCurrency(d.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
