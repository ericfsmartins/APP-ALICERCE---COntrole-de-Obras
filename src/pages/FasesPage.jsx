import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import { propagarFase } from '@/lib/propagation'
import { Plus, Loader2, ChevronDown, ChevronUp, Pencil, Play, CheckCheck, Layers } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { cn, formatCurrency, formatPercent, getStatusColor, getStatusLabel } from '@/lib/utils'

const STATUS_TABS = ['todas', 'planejamento', 'em_andamento', 'concluida', 'pausada']
const STATUS_LABEL = { todas: 'Todas', planejamento: 'Planejamento', em_andamento: 'Em Andamento', concluida: 'Concluídas', pausada: 'Pausadas' }

export default function FasesPage() {
  const { obraAtiva } = useObra()
  const [fases, setFases]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [filtro, setFiltro]     = useState('todas')
  const [expandido, setExpandido] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [addModal, setAddModal]  = useState(false)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { if (obraAtiva) load() }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('fases').select('*').eq('obra_id', obraAtiva.id).order('numero')
    setFases(data || [])
    setLoading(false)
  }

  async function iniciarFase(faseId) {
    await supabase.from('fases').update({
      status: 'em_andamento',
      data_inicio_real: new Date().toISOString().split('T')[0],
    }).eq('id', faseId)
    await load()
  }

  async function concluirFase(faseId) {
    await supabase.from('fases').update({
      status: 'concluida',
      percentual_concluido: 100,
      data_fim_real: new Date().toISOString().split('T')[0],
    }).eq('id', faseId)
    await propagarFase({ obraId: obraAtiva.id, faseId })
    await load()
  }

  async function salvarFase(dados, id) {
    setSaving(true)
    if (id) {
      await supabase.from('fases').update(dados).eq('id', id)
      await propagarFase({ obraId: obraAtiva.id, faseId: id })
    } else {
      const proximoNumero = (fases[fases.length - 1]?.numero || 0) + 1
      await supabase.from('fases').insert({ ...dados, obra_id: obraAtiva.id, numero: proximoNumero })
    }
    setSaving(false)
    setEditModal(null)
    setAddModal(false)
    await load()
  }

  const counts = {
    todas: fases.length,
    planejamento: fases.filter(f => f.status === 'planejamento').length,
    em_andamento: fases.filter(f => f.status === 'em_andamento').length,
    concluida: fases.filter(f => f.status === 'concluida').length,
    pausada: fases.filter(f => f.status === 'pausada').length,
  }

  const fasesFiltradas = filtro === 'todas' ? fases : fases.filter(f => f.status === filtro)

  if (!obraAtiva) return (
    <div className="text-center py-20 text-brand-muted">
      <Layers size={40} className="mx-auto mb-3 opacity-40" />
      <p>Selecione uma obra para ver as fases.</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Fases da Obra</h1>
          <p className="text-sm text-brand-muted">{fases.length} fase{fases.length !== 1 ? 's' : ''} cadastradas</p>
        </div>
        <Button onClick={() => setAddModal(true)}>
          <Plus size={14} /> Nova Fase
        </Button>
      </div>

      {/* Tabs de status */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-colors border',
              filtro === s
                ? 'bg-brand-dark text-white border-brand-dark'
                : 'bg-white text-brand-muted border-brand-border hover:border-brand-dark/30'
            )}
          >
            {STATUS_LABEL[s]} ({counts[s]})
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin text-brand-accent" />
        </div>
      ) : fasesFiltradas.length === 0 ? (
        <div className="text-center py-16 text-brand-muted">
          <Layers size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma fase encontrada.</p>
          <p className="text-sm mt-1">Crie fases manualmente ou use o seed em Configurações.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {fasesFiltradas.map(fase => (
            <FaseCard
              key={fase.id}
              fase={fase}
              expandido={expandido === fase.id}
              onToggle={() => setExpandido(expandido === fase.id ? null : fase.id)}
              onIniciar={() => iniciarFase(fase.id)}
              onConcluir={() => concluirFase(fase.id)}
              onEditar={() => setEditModal(fase)}
            />
          ))}
        </div>
      )}

      {/* Modal editar */}
      {editModal && (
        <ModalFase
          fase={editModal}
          onSave={d => salvarFase(d, editModal.id)}
          onClose={() => setEditModal(null)}
          saving={saving}
        />
      )}

      {/* Modal nova fase */}
      {addModal && (
        <ModalFase
          fase={null}
          onSave={d => salvarFase(d, null)}
          onClose={() => setAddModal(false)}
          saving={saving}
        />
      )}
    </div>
  )
}

function FaseCard({ fase, expandido, onToggle, onIniciar, onConcluir, onEditar }) {
  const pct = fase.percentual_concluido || 0
  const orcado = fase.total_estimado || 0
  const realizado = fase.total_realizado || 0
  const desvio = orcado > 0 ? ((realizado - orcado) / orcado) * 100 : 0
  const isVariavel = fase.is_variavel

  return (
    <div className="card-base overflow-hidden">
      <div className="gradient-bar" />

      {/* Linha principal */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={onToggle}
      >
        {/* Número */}
        <div className="w-9 h-9 rounded-full bg-brand-dark text-white flex items-center justify-center text-sm font-display font-bold flex-shrink-0">
          {fase.numero}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-brand-dark text-sm">{fase.nome}</span>
            {isVariavel && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Variável</span>
            )}
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', getStatusColor(fase.status))}>
              {getStatusLabel(fase.status)}
            </span>
          </div>
          {fase.descricao && (
            <p className="text-xs text-brand-muted truncate">{fase.descricao}</p>
          )}
          {/* Barra de progresso */}
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-brand-bg rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-status-green' : pct > 0 ? 'bg-brand-accent' : 'bg-brand-border')}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className="text-xs text-brand-muted whitespace-nowrap">{pct.toFixed(0)}% concluído</span>
          </div>
        </div>

        {/* Valor / desvio (só se não variável e tem orçado) */}
        <div className="text-right flex-shrink-0 hidden sm:block">
          {isVariavel ? (
            <span className="text-sm font-medium text-brand-muted">Variável</span>
          ) : orcado > 0 ? (
            <>
              <p className={cn('text-sm font-display font-bold', desvio > 0 ? 'text-status-red' : 'text-brand-dark')}>
                {formatCurrency(orcado)}
              </p>
              <p className={cn('text-xs', desvio > 0 ? 'text-status-red' : desvio < 0 ? 'text-status-green' : 'text-brand-muted')}>
                {desvio !== 0 ? (desvio > 0 ? '+' : '') + formatPercent(desvio) : '—'}
              </p>
            </>
          ) : null}
        </div>

        {/* Chevron */}
        <div className="text-brand-muted flex-shrink-0">
          {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Painel expandido */}
      {expandido && (
        <div className="border-t border-brand-border">
          {/* Aviso descricao */}
          {fase.descricao && (
            <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-800">
              <span>ℹ</span>
              <span>{fase.descricao}</span>
            </div>
          )}

          {/* Cards de valores */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4">
            {[
              { label: 'Total Estimado',   value: formatCurrency(orcado) },
              { label: 'Mão de Obra',      value: formatCurrency(fase.mao_obra_estimada || 0) },
              { label: 'Materiais',        value: formatCurrency(fase.materiais_estimados || 0) },
              { label: 'Total Realizado',  value: formatCurrency(realizado) },
              { label: '% Concluído',      value: `${pct.toFixed(0)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-brand-bg rounded-lg p-3">
                <p className="text-[10px] text-brand-muted mb-1">{label}</p>
                <p className="text-sm font-display font-semibold text-brand-dark">{value}</p>
              </div>
            ))}
          </div>

          {/* Proporção */}
          {!isVariavel && fase.proporcao && (
            <p className="px-4 pb-2 text-xs text-brand-muted">
              Proporção: {fase.proporcao}% do orçamento total
            </p>
          )}

          {/* Datas */}
          {(fase.data_inicio_prevista || fase.data_fim_prevista) && (
            <div className="px-4 pb-3 flex gap-4 text-xs text-brand-muted">
              {fase.data_inicio_prevista && <span>Início previsto: {fase.data_inicio_prevista}</span>}
              {fase.data_fim_prevista && <span>Fim previsto: {fase.data_fim_prevista}</span>}
              {fase.data_inicio_real && <span>Início real: {fase.data_inicio_real}</span>}
              {fase.data_fim_real && <span>Fim real: {fase.data_fim_real}</span>}
            </div>
          )}

          {/* Ações */}
          <div className="px-4 pb-4 flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onEditar}>
              <Pencil size={13} /> Editar
            </Button>
            {fase.status === 'planejamento' && (
              <Button variant="outline" size="sm" onClick={onIniciar}>
                <Play size={13} /> Iniciar fase
              </Button>
            )}
            {fase.status === 'em_andamento' && (
              <Button variant="outline" size="sm" onClick={onConcluir}>
                <CheckCheck size={13} /> Concluir fase
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModalFase({ fase, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    nome:                fase?.nome                || '',
    descricao:           fase?.descricao           || '',
    proporcao:           fase?.proporcao           || '',
    is_variavel:         fase?.is_variavel         || false,
    total_estimado:      fase?.total_estimado      || '',
    mao_obra_estimada:   fase?.mao_obra_estimada   || '',
    materiais_estimados: fase?.materiais_estimados || '',
    responsavel:         fase?.responsavel         || '',
    data_inicio_prevista:fase?.data_inicio_prevista|| '',
    data_fim_prevista:   fase?.data_fim_prevista   || '',
    status:              fase?.status              || 'planejamento',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <Modal open onClose={onClose} title={fase ? `Editar: ${fase.nome}` : 'Nova Fase'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Input label="Nome da fase *" value={form.nome} onChange={e => set('nome', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-brand-muted mb-1">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              rows={2}
              className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 resize-none"
            />
          </div>
          <Input label="Total estimado (R$)" type="number" value={form.total_estimado} onChange={e => set('total_estimado', e.target.value)} />
          <Input label="Mão de Obra (R$)" type="number" value={form.mao_obra_estimada} onChange={e => set('mao_obra_estimada', e.target.value)} />
          <Input label="Materiais (R$)" type="number" value={form.materiais_estimados} onChange={e => set('materiais_estimados', e.target.value)} />
          <Input label="Proporção (%)" type="number" value={form.proporcao} onChange={e => set('proporcao', e.target.value)} placeholder="Ex: 15" />
          <Input label="Início previsto" type="date" value={form.data_inicio_prevista} onChange={e => set('data_inicio_prevista', e.target.value)} />
          <Input label="Fim previsto" type="date" value={form.data_fim_prevista} onChange={e => set('data_fim_prevista', e.target.value)} />
          <Input label="Responsável" value={form.responsavel} onChange={e => set('responsavel', e.target.value)} />
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30">
              <option value="planejamento">Planejamento</option>
              <option value="em_andamento">Em andamento</option>
              <option value="pausada">Pausada</option>
              <option value="concluida">Concluída</option>
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="variavel" checked={form.is_variavel} onChange={e => set('is_variavel', e.target.checked)}
              className="w-4 h-4 accent-brand-accent" />
            <label htmlFor="variavel" className="text-sm text-brand-dark">Fase variável (custo não predefinido)</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-brand-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={saving || !form.nome} onClick={() => onSave(form)}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
