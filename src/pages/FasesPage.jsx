import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import { propagarFase } from '@/lib/propagation'
import { List, LayoutGrid, Plus, Loader2, Play, CheckCheck } from 'lucide-react'
import FaseRow from '@/components/FaseRow'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import { cn, formatCurrency, getStatusColor, getStatusLabel } from '@/lib/utils'

const STATUS_KANBAN = ['planejamento', 'em_andamento', 'pausada', 'concluida']

export default function FasesPage() {
  const { obraAtiva } = useObra()
  const [fases, setFases] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('lista')
  const [expandido, setExpandido] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (obraAtiva) load() }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('fases').select('*').eq('obra_id', obraAtiva.id).order('numero')
    setFases(data || [])
    setLoading(false)
  }

  async function atualizarProgresso(faseId, pct) {
    await supabase.from('fases').update({ percentual_concluido: pct }).eq('id', faseId)
    await propagarFase({ obraId: obraAtiva.id, faseId })
    await load()
  }

  async function iniciarFase(faseId) {
    await supabase.from('fases').update({
      status: 'em_andamento',
      data_inicio_real: new Date().toISOString().split('T')[0]
    }).eq('id', faseId)
    await load()
  }

  async function concluirFase(faseId) {
    await supabase.from('fases').update({
      status: 'concluida',
      percentual_concluido: 100,
      data_fim_real: new Date().toISOString().split('T')[0]
    }).eq('id', faseId)
    await propagarFase({ obraId: obraAtiva.id, faseId })
    await load()
  }

  async function salvarFase(dados, id) {
    setSaving(true)
    if (id) {
      await supabase.from('fases').update(dados).eq('id', id)
    } else {
      await supabase.from('fases').insert({ ...dados, obra_id: obraAtiva.id })
    }
    setSaving(false)
    setEditModal(null)
    setAddModal(false)
    await load()
  }

  if (!obraAtiva) return <p className="text-brand-muted text-center py-20">Selecione uma obra.</p>
  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-brand-accent" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Fases da Obra</h1>
          <p className="text-sm text-brand-muted">{fases.length} fases cadastradas</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle view */}
          <div className="flex bg-brand-bg rounded-xl p-1 border border-brand-border">
            <button onClick={() => setView('lista')} className={cn("p-1.5 rounded-lg", view === 'lista' ? "bg-white shadow-sm" : "text-brand-muted")}>
              <List size={16} />
            </button>
            <button onClick={() => setView('kanban')} className={cn("p-1.5 rounded-lg", view === 'kanban' ? "bg-white shadow-sm" : "text-brand-muted")}>
              <LayoutGrid size={16} />
            </button>
          </div>
          <Button size="sm" onClick={() => setAddModal(true)}><Plus size={14} /> Nova Fase</Button>
        </div>
      </div>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total estimado', value: formatCurrency(fases.reduce((s, f) => s + (f.total_estimado || 0), 0)), color: 'text-brand-dark' },
          { label: 'Total realizado', value: formatCurrency(fases.reduce((s, f) => s + (f.total_realizado || 0), 0)), color: 'text-brand-accent' },
          { label: 'Fases em andamento', value: fases.filter(f => f.status === 'em_andamento').length, color: 'text-blue-600' },
          { label: 'Fases concluídas', value: fases.filter(f => f.status === 'concluida').length, color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card-base p-4">
            <div className="gradient-bar" />
            <p className="text-xs text-brand-muted">{label}</p>
            <p className={cn("text-lg font-display font-bold mt-1", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      {view === 'lista' && (
        <div>
          {fases.map(fase => (
            <FaseRow
              key={fase.id}
              fase={fase}
              expanded={expandido === fase.id}
              onClick={() => setExpandido(expandido === fase.id ? null : fase.id)}
            >
              {/* Conteúdo expandido */}
              <div className="pt-4 space-y-4">
                {/* Slider de progresso */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-brand-dark">Progresso físico</label>
                    <span className="text-xs font-bold text-brand-accent">{Math.round(fase.percentual_concluido || 0)}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" step="5"
                    value={fase.percentual_concluido || 0}
                    onChange={e => atualizarProgresso(fase.id, Number(e.target.value))}
                    className="w-full accent-brand-accent"
                  />
                </div>

                {/* Botões de ação */}
                <div className="flex gap-2 flex-wrap">
                  {fase.status !== 'em_andamento' && fase.status !== 'concluida' && (
                    <Button size="sm" onClick={() => iniciarFase(fase.id)}>
                      <Play size={12} /> Iniciar fase
                    </Button>
                  )}
                  {fase.status !== 'concluida' && (
                    <Button size="sm" variant="secondary" onClick={() => concluirFase(fase.id)}>
                      <CheckCheck size={12} /> Concluir fase
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditModal(fase)}>
                    Editar
                  </Button>
                </div>

                {/* Valores */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: 'Estimado', value: formatCurrency(fase.total_estimado) },
                    { label: 'Realizado', value: formatCurrency(fase.total_realizado) },
                    { label: 'MO estimada', value: formatCurrency(fase.mao_obra_estimada) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-brand-bg rounded-xl p-2">
                      <p className="text-[10px] text-brand-muted">{label}</p>
                      <p className="text-sm font-bold text-brand-dark">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FaseRow>
          ))}
        </div>
      )}

      {/* Kanban */}
      {view === 'kanban' && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 overflow-x-auto">
          {STATUS_KANBAN.map(status => {
            const fasesStatus = fases.filter(f => f.status === status)
            return (
              <div key={status} className="bg-brand-bg rounded-xl p-3 min-w-[220px]">
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn("w-2 h-2 rounded-full",
                    status === 'planejamento' ? "bg-slate-400" :
                    status === 'em_andamento' ? "bg-blue-400" :
                    status === 'concluida'    ? "bg-green-400" : "bg-amber-400"
                  )} />
                  <span className="text-xs font-medium text-brand-dark">{getStatusLabel(status)}</span>
                  <span className="ml-auto text-xs text-brand-muted">{fasesStatus.length}</span>
                </div>
                <div className="space-y-2">
                  {fasesStatus.map(fase => (
                    <div key={fase.id} className="card-base p-3 cursor-pointer" onClick={() => setEditModal(fase)}>
                      <div className="gradient-bar" />
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">{fase.numero}</div>
                        <span className="text-xs font-medium text-brand-dark truncate">{fase.nome}</span>
                      </div>
                      <div className="h-1 bg-brand-border rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-brand-dark to-brand-accent" style={{ width: `${fase.percentual_concluido || 0}%` }} />
                      </div>
                      <p className="text-[10px] text-brand-muted mt-1">{formatCurrency(fase.total_estimado)}</p>
                    </div>
                  ))}
                  {fasesStatus.length === 0 && (
                    <p className="text-xs text-brand-muted text-center py-4">Nenhuma</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal editar/adicionar fase */}
      {(editModal || addModal) && (
        <ModalFase
          fase={editModal}
          onSave={salvarFase}
          onClose={() => { setEditModal(null); setAddModal(false) }}
          saving={saving}
          nextNumero={editModal ? undefined : Math.max(...fases.map(f => f.numero), 0) + 1}
        />
      )}
    </div>
  )
}

function ModalFase({ fase, onSave, onClose, saving, nextNumero }) {
  const [form, setForm] = useState({
    numero: fase?.numero || nextNumero || 1,
    nome: fase?.nome || '',
    descricao: fase?.descricao || '',
    proporcao: fase?.proporcao || '',
    status: fase?.status || 'planejamento',
    data_inicio_prevista: fase?.data_inicio_prevista || '',
    data_fim_prevista: fase?.data_fim_prevista || '',
    responsavel: fase?.responsavel || '',
  })

  return (
    <Modal open onClose={onClose} title={fase ? 'Editar Fase' : 'Nova Fase'} size="lg">
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Número" type="number" value={form.numero} onChange={e => setForm(p => ({...p, numero: Number(e.target.value)}))} />
        <div className="md:col-span-1">
          <Select label="Status" value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))}>
            <option value="planejamento">Planejamento</option>
            <option value="em_andamento">Em andamento</option>
            <option value="pausada">Pausada</option>
            <option value="concluida">Concluída</option>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Input label="Nome da fase *" value={form.nome} onChange={e => setForm(p => ({...p, nome: e.target.value}))} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-brand-dark">Descrição</label>
          <textarea className="mt-1 w-full rounded-xl border border-brand-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30" rows={3}
            value={form.descricao} onChange={e => setForm(p => ({...p, descricao: e.target.value}))} />
        </div>
        <Input label="Proporção do orçamento (%)" type="number" step="0.1" value={form.proporcao}
          onChange={e => setForm(p => ({...p, proporcao: e.target.value}))} />
        <Input label="Responsável" value={form.responsavel} onChange={e => setForm(p => ({...p, responsavel: e.target.value}))} />
        <Input label="Início previsto" type="date" value={form.data_inicio_prevista}
          onChange={e => setForm(p => ({...p, data_inicio_prevista: e.target.value}))} />
        <Input label="Fim previsto" type="date" value={form.data_fim_prevista}
          onChange={e => setForm(p => ({...p, data_fim_prevista: e.target.value}))} />
        <div className="md:col-span-2 flex justify-end gap-3 pt-2 border-t border-brand-border">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={() => form.nome && onSave(form, fase?.id)}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}
