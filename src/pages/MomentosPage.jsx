import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import { propagarTarefaMomento, recalcularMomento } from '@/lib/propagation'
import {
  CheckCircle2, Circle, Clock, Lock, AlertTriangle,
  ShoppingCart, FileSignature, Wrench, ChevronDown, Plus,
  Edit2, Loader2, Target
} from 'lucide-react'
import ProgressRing from '@/components/ProgressRing'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { cn, getStatusColor, getStatusLabel, formatCurrency } from '@/lib/utils'

const TIPO_ICONS = {
  atividade:        Wrench,
  aquisicao_critica: ShoppingCart,
  contrato:         FileSignature,
}
const TIPO_LABELS = {
  atividade:        'Atividade',
  aquisicao_critica: 'Aquisição',
  contrato:         'Contrato',
}

export default function MomentosPage() {
  const { obraAtiva } = useObra()
  const [momentos, setMomentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState(null)
  const [editModal, setEditModal] = useState(null) // momento em edição
  const [addTarefaModal, setAddTarefaModal] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (obraAtiva) load()
  }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('momentos')
      .select('*, tarefas_momento(*)')
      .eq('obra_id', obraAtiva.id)
      .order('numero')
    setMomentos(data || [])
    setLoading(false)
    // Expande o momento atual automaticamente
    const ativo = data?.find(m => m.status === 'em_andamento') || data?.[0]
    if (ativo) setExpandido(ativo.id)
  }

  async function toggleTarefa(tarefa, momentoId) {
    const novoStatus = tarefa.status === 'concluida' ? 'pendente' : 'concluida'
    const novoPct    = novoStatus === 'concluida' ? 100 : 0

    await supabase
      .from('tarefas_momento')
      .update({ status: novoStatus, percentual_concluido: novoPct, data_conclusao: novoStatus === 'concluida' ? new Date().toISOString().split('T')[0] : null })
      .eq('id', tarefa.id)

    // Propagação
    await propagarTarefaMomento({
      obraId: obraAtiva.id,
      faseIds: tarefa.fase_ids || [],
      momentoId,
    })

    await load()
  }

  async function iniciarMomento(momento) {
    if (momento.status === 'bloqueado') return
    await supabase.from('momentos').update({
      status: 'em_andamento',
      data_inicio_real: new Date().toISOString().split('T')[0]
    }).eq('id', momento.id)
    await load()
  }

  async function salvarEdicao(dados) {
    setSaving(true)
    await supabase.from('momentos').update(dados).eq('id', editModal.id)
    setEditModal(null)
    setSaving(false)
    await load()
  }

  async function adicionarTarefa(dados) {
    setSaving(true)
    await supabase.from('tarefas_momento').insert({
      obra_id: obraAtiva.id,
      momento_id: addTarefaModal.id,
      ...dados,
      status: 'pendente',
    })
    await recalcularMomento(addTarefaModal.id, obraAtiva.id)
    setAddTarefaModal(null)
    setSaving(false)
    await load()
  }

  if (!obraAtiva) return <p className="text-brand-muted text-center py-20">Selecione uma obra.</p>
  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-brand-accent" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Momentos da Obra</h1>
          <p className="text-sm text-brand-muted">Acompanhamento por etapas do método Casas Incríveis</p>
        </div>
      </div>

      {/* Timeline horizontal (desktop) */}
      <div className="hidden lg:flex items-center gap-0 mb-8 overflow-x-auto pb-2 scrollbar-thin">
        {momentos.map((m, idx) => (
          <div key={m.id} className="flex items-center">
            <button
              onClick={() => setExpandido(expandido === m.id ? null : m.id)}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all",
                expandido === m.id ? "bg-brand-dark text-white" : "hover:bg-brand-bg text-brand-muted"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2",
                m.status === 'concluido'    ? "border-green-400 bg-green-50 text-green-700" :
                m.status === 'em_andamento' ? "border-brand-accent bg-amber-50 text-brand-accent" :
                m.status === 'bloqueado'    ? "border-red-300 bg-red-50 text-red-500" :
                "border-brand-border bg-white text-brand-muted"
              )}>
                {m.status === 'concluido' ? <CheckCircle2 size={14} className="text-green-600" /> :
                 m.status === 'bloqueado' ? <Lock size={12} /> : m.numero}
              </div>
              <span className="text-[10px] whitespace-nowrap max-w-[80px] text-center leading-tight">
                {m.nome.split('—')[0].trim().replace('Momento ', 'M')}
              </span>
            </button>
            {idx < momentos.length - 1 && (
              <div className={cn("w-8 h-0.5 flex-shrink-0",
                m.status === 'concluido' ? "bg-green-400" : "bg-brand-border"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Cards dos momentos */}
      <div className="space-y-4">
        {momentos.map(momento => {
          const tarefas = momento.tarefas_momento || []
          const concluidas = tarefas.filter(t => t.status === 'concluida').length
          const isBloqueado = momento.status === 'bloqueado'
          const isExpandido = expandido === momento.id

          return (
            <div key={momento.id} className={cn("card-base", isBloqueado && "opacity-75")}>
              <div className={cn("gradient-bar", isBloqueado && "opacity-40")} />

              {/* Header do momento */}
              <div
                className="p-5 flex items-start gap-4 cursor-pointer"
                onClick={() => setExpandido(isExpandido ? null : momento.id)}
              >
                <ProgressRing percent={momento.percentual_concluido || 0} size={64} strokeWidth={6} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", getStatusColor(momento.status))}>
                      {getStatusLabel(momento.status)}
                    </span>
                    {isBloqueado && (
                      <span className="text-[10px] text-status-red flex items-center gap-0.5">
                        <Lock size={10} /> Prerequisitos pendentes
                      </span>
                    )}
                    {momento.prazo_estimado_min && (
                      <span className="text-[10px] text-brand-muted flex items-center gap-0.5">
                        <Clock size={10} /> {momento.prazo_estimado_min}–{momento.prazo_estimado_max} meses
                      </span>
                    )}
                  </div>
                  <h3 className="font-display font-bold text-brand-dark">{momento.nome}</h3>
                  {momento.descricao && <p className="text-xs text-brand-muted mt-0.5">{momento.descricao}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-brand-muted">
                    <span>{concluidas}/{tarefas.length} tarefas</span>
                    {momento.custo_realizado > 0 && <span>{formatCurrency(momento.custo_realizado)} gastos</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isBloqueado && momento.status === 'nao_iniciado' && (
                    <Button size="sm" onClick={e => { e.stopPropagation(); iniciarMomento(momento) }}>
                      Iniciar
                    </Button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setEditModal(momento) }}
                    className="p-1.5 rounded-lg hover:bg-brand-bg text-brand-muted"
                  >
                    <Edit2 size={14} />
                  </button>
                  <ChevronDown size={16} className={cn("text-brand-muted transition-transform", isExpandido && "rotate-180")} />
                </div>
              </div>

              {/* Tarefas (expandido) */}
              {isExpandido && (
                <div className="px-5 pb-5 border-t border-brand-border pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-brand-dark">Tarefas</h4>
                    <Button size="sm" variant="secondary" onClick={() => setAddTarefaModal(momento)}>
                      <Plus size={12} /> Adicionar
                    </Button>
                  </div>

                  {tarefas.length === 0 ? (
                    <p className="text-xs text-brand-muted py-4 text-center">Nenhuma tarefa cadastrada.</p>
                  ) : (
                    <div className="space-y-2">
                      {tarefas.map(tarefa => {
                        const TipoIcon = TIPO_ICONS[tarefa.tipo] || Wrench
                        const concluida = tarefa.status === 'concluida'

                        return (
                          <div
                            key={tarefa.id}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-xl border transition-colors",
                              concluida
                                ? "bg-green-50 border-green-200"
                                : "bg-white border-brand-border hover:bg-brand-bg"
                            )}
                          >
                            <button
                              onClick={() => !isBloqueado && toggleTarefa(tarefa, momento.id)}
                              disabled={isBloqueado}
                              className="mt-0.5 flex-shrink-0"
                            >
                              {concluida
                                ? <CheckCircle2 size={18} className="text-status-green" />
                                : <Circle size={18} className="text-brand-muted" />
                              }
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn("text-sm", concluida ? "line-through text-brand-muted" : "text-brand-dark")}>
                                  {tarefa.nome}
                                </span>
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                                  tarefa.tipo === 'aquisicao_critica' ? "bg-amber-100 text-amber-700" :
                                  tarefa.tipo === 'contrato' ? "bg-blue-100 text-blue-700" :
                                  "bg-slate-100 text-slate-600"
                                )}>
                                  <TipoIcon size={9} />
                                  {TIPO_LABELS[tarefa.tipo]}
                                </span>
                              </div>
                              {tarefa.descricao && (
                                <p className="text-xs text-brand-muted mt-0.5">{tarefa.descricao}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal Editar Momento */}
      {editModal && (
        <ModalEditarMomento
          momento={editModal}
          onSave={salvarEdicao}
          onClose={() => setEditModal(null)}
          saving={saving}
        />
      )}

      {/* Modal Adicionar Tarefa */}
      {addTarefaModal && (
        <ModalAdicionarTarefa
          onSave={adicionarTarefa}
          onClose={() => setAddTarefaModal(null)}
          saving={saving}
          obraId={obraAtiva.id}
        />
      )}
    </div>
  )
}

function ModalEditarMomento({ momento, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    nome: momento.nome,
    descricao: momento.descricao || '',
    prazo_estimado_min: momento.prazo_estimado_min || '',
    prazo_estimado_max: momento.prazo_estimado_max || '',
  })

  return (
    <Modal open onClose={onClose} title="Editar Momento">
      <div className="p-6 space-y-4">
        <Input label="Nome" value={form.nome} onChange={e => setForm(p => ({...p, nome: e.target.value}))} />
        <div>
          <label className="text-xs font-medium text-brand-dark">Descrição</label>
          <textarea
            className="mt-1 w-full rounded-xl border border-brand-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30 min-h-[80px]"
            value={form.descricao}
            onChange={e => setForm(p => ({...p, descricao: e.target.value}))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Prazo mín. (meses)" type="number" step="0.5" value={form.prazo_estimado_min}
            onChange={e => setForm(p => ({...p, prazo_estimado_min: e.target.value}))} />
          <Input label="Prazo máx. (meses)" type="number" step="0.5" value={form.prazo_estimado_max}
            onChange={e => setForm(p => ({...p, prazo_estimado_max: e.target.value}))} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={() => onSave(form)}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}

function ModalAdicionarTarefa({ onSave, onClose, saving, obraId }) {
  const [form, setForm] = useState({ nome: '', descricao: '', tipo: 'atividade' })
  return (
    <Modal open onClose={onClose} title="Nova Tarefa">
      <div className="p-6 space-y-4">
        <Input label="Nome da tarefa *" value={form.nome} onChange={e => setForm(p => ({...p, nome: e.target.value}))} required />
        <div>
          <label className="text-xs font-medium text-brand-dark">Tipo</label>
          <div className="flex gap-2 mt-1">
            {['atividade','aquisicao_critica','contrato'].map(t => (
              <button
                key={t}
                onClick={() => setForm(p => ({...p, tipo: t}))}
                className={cn("flex-1 py-1.5 rounded-xl text-xs border transition-colors",
                  form.tipo === t ? "bg-brand-dark text-white border-brand-dark" : "border-brand-border text-brand-muted hover:border-brand-dark"
                )}
              >
                {TIPO_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-brand-dark">Observação</label>
          <textarea
            className="mt-1 w-full rounded-xl border border-brand-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
            rows={3}
            value={form.descricao}
            onChange={e => setForm(p => ({...p, descricao: e.target.value}))}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={() => form.nome && onSave(form)} disabled={!form.nome}>Adicionar</Button>
        </div>
      </div>
    </Modal>
  )
}
