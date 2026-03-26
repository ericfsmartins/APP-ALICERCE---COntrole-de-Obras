import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import {
  FileText, Upload, Layers, Loader2, Plus, Download,
  AlertTriangle, Calendar, Trash2, ExternalLink, Search, Filter
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { cn, formatDate, calcDiasRestantes } from '@/lib/utils'

const TIPOS = [
  { value: 'projeto',      label: 'Projeto'       },
  { value: 'contrato',     label: 'Contrato'      },
  { value: 'nota_fiscal',  label: 'Nota Fiscal'   },
  { value: 'foto',         label: 'Foto'          },
  { value: 'alvara',       label: 'Alvará'        },
  { value: 'orcamento',    label: 'Orçamento'     },
  { value: 'outro',        label: 'Outro'         },
]

const TIPO_ICONS = {
  projeto:     '📐',
  contrato:    '📝',
  nota_fiscal: '🧾',
  foto:        '📷',
  alvara:      '🏛️',
  orcamento:   '💰',
  outro:       '📄',
}

const TIPO_COLORS = {
  projeto:     'bg-blue-100 text-blue-700',
  contrato:    'bg-purple-100 text-purple-700',
  nota_fiscal: 'bg-amber-100 text-amber-700',
  foto:        'bg-green-100 text-green-700',
  alvara:      'bg-red-100 text-red-700',
  orcamento:   'bg-cyan-100 text-cyan-700',
  outro:       'bg-slate-100 text-slate-700',
}

function ValidadeBadge({ validade }) {
  if (!validade) return null
  const dias = calcDiasRestantes(validade)
  if (dias === null) return null
  if (dias < 0)  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1"><AlertTriangle size={10} /> Vencido</span>
  if (dias <= 30) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1"><AlertTriangle size={10} /> Vence em {dias}d</span>
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Válido até {formatDate(validade)}</span>
}

export default function DocumentosPage() {
  const { obraAtiva } = useObra()
  const [docs, setDocs]       = useState([])
  const [fases, setFases]     = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroFase, setFiltroFase] = useState('')
  const [busca, setBusca]     = useState('')
  const [form, setForm]       = useState({
    nome: '', tipo: 'outro', fase_id: '', fase_nome: '',
    descricao: '', data_documento: '', validade: '', arquivo_url: ''
  })

  useEffect(() => { if (obraAtiva) load() }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    const [{ data: d }, { data: f }] = await Promise.all([
      supabase.from('documentos').select('*').eq('obra_id', obraAtiva.id).order('created_at', { ascending: false }),
      supabase.from('fases').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero'),
    ])
    setDocs(d || [])
    setFases(f || [])
    setLoading(false)
  }

  async function salvar() {
    if (!form.nome.trim()) return
    setSaving(true)
    const fase = fases.find(f => f.id === form.fase_id)
    const payload = {
      ...form,
      fase_nome: fase?.nome || '',
      obra_id: obraAtiva.id,
    }
    const { error } = await supabase.from('documentos').insert(payload)
    setSaving(false)
    if (!error) {
      setModal(false)
      resetForm()
      load()
    }
  }

  async function excluir(id) {
    if (!confirm('Excluir este documento?')) return
    await supabase.from('documentos').delete().eq('id', id)
    load()
  }

  function resetForm() {
    setForm({ nome: '', tipo: 'outro', fase_id: '', fase_nome: '', descricao: '', data_documento: '', validade: '', arquivo_url: '' })
  }

  const docsFiltrados = docs.filter(d => {
    if (filtroTipo && d.tipo !== filtroTipo) return false
    if (filtroFase && d.fase_id !== filtroFase) return false
    if (busca && !d.nome.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  })

  // Agrupa por tipo
  const grupos = TIPOS.map(t => ({
    ...t,
    items: docsFiltrados.filter(d => d.tipo === t.value)
  })).filter(g => g.items.length > 0)

  if (!obraAtiva) return (
    <div className="text-center py-20 text-brand-muted">
      <FileText size={40} className="mx-auto mb-3 opacity-40" />
      <p>Selecione uma obra para ver os documentos.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Documentos</h1>
          <p className="text-sm text-brand-muted">{docs.length} documento{docs.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => { resetForm(); setModal(true) }}>
          <Plus size={16} /> Novo Documento
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar documento..."
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
          value={filtroFase}
          onChange={e => setFiltroFase(e.target.value)}
          className="text-sm border border-brand-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
        >
          <option value="">Todas as fases</option>
          {fases.map(f => <option key={f.id} value={f.id}>{f.numero}. {f.nome}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={28} className="animate-spin text-brand-accent" />
        </div>
      ) : docsFiltrados.length === 0 ? (
        <div className="text-center py-16 text-brand-muted">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum documento encontrado.</p>
          <p className="text-sm mt-1">Adicione documentos usando o botão acima.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grupos.map(grupo => (
            <div key={grupo.value}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{TIPO_ICONS[grupo.value]}</span>
                <h2 className="font-display font-bold text-brand-dark">{grupo.label}</h2>
                <span className="text-xs text-brand-muted">({grupo.items.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {grupo.items.map(doc => (
                  <DocCard key={doc.id} doc={doc} onDelete={excluir} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal novo documento */}
      <Modal open={modal} onClose={() => setModal(false)} title="Novo Documento">
        <div className="space-y-4">
          <Input
            label="Nome do documento *"
            value={form.nome}
            onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
            placeholder="Ex: Projeto Arquitetônico Rev.3"
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
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Data do documento"
              type="date"
              value={form.data_documento}
              onChange={e => setForm(p => ({ ...p, data_documento: e.target.value }))}
            />
            <Input
              label="Validade (alvarás, ARTs...)"
              type="date"
              value={form.validade}
              onChange={e => setForm(p => ({ ...p, validade: e.target.value }))}
            />
          </div>
          <Input
            label="URL do arquivo (link externo)"
            value={form.arquivo_url}
            onChange={e => setForm(p => ({ ...p, arquivo_url: e.target.value }))}
            placeholder="https://drive.google.com/..."
          />
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
              rows={3}
              className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 resize-none"
              placeholder="Detalhes sobre o documento..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function DocCard({ doc, onDelete }) {
  return (
    <div className="card-base p-4 flex flex-col gap-3 relative">
      <div className="gradient-bar" />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{TIPO_ICONS[doc.tipo] || '📄'}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-dark truncate leading-tight">{doc.nome}</p>
            {doc.fase_nome && (
              <p className="text-[10px] text-brand-muted truncate">{doc.fase_nome}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => onDelete(doc.id)}
          className="text-brand-muted hover:text-status-red transition-colors flex-shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", TIPO_COLORS[doc.tipo])}>
          {TIPOS.find(t => t.value === doc.tipo)?.label || doc.tipo}
        </span>
        <ValidadeBadge validade={doc.validade} />
      </div>

      {doc.descricao && (
        <p className="text-xs text-brand-muted line-clamp-2">{doc.descricao}</p>
      )}

      <div className="flex items-center justify-between mt-auto pt-1">
        {doc.data_documento ? (
          <span className="flex items-center gap-1 text-[10px] text-brand-muted">
            <Calendar size={10} /> {formatDate(doc.data_documento)}
          </span>
        ) : <span />}
        {doc.arquivo_url && (
          <a
            href={doc.arquivo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-brand-accent hover:underline font-medium"
          >
            <ExternalLink size={10} /> Abrir
          </a>
        )}
      </div>
    </div>
  )
}
