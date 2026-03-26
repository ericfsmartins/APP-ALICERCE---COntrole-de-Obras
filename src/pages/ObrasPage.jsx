import { useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus, MapPin, Calendar, TrendingUp, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import ProgressRing from '@/components/ProgressRing'
import Badge from '@/components/ui/Badge'
import { formatCurrency, formatDate, getStatusColor, getStatusLabel, cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { FASES_PADRAO, MOMENTOS_PADRAO } from '@/lib/seedData'

export default function ObrasPage() {
  const { obras, criarObra, selecionarObra, loading } = useObra()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nome: '', endereco: '', area_total: '', custo_por_m2: '1375',
    data_inicio: '', data_fim_prevista: '', responsavel_tecnico: '',
    percentual_mao_obra: '29.09', percentual_materiais: '70.91',
    status: 'planejamento'
  })

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  async function handleCriar(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const { data, error } = await criarObra({
        nome: form.nome,
        endereco: form.endereco,
        area_total: parseFloat(form.area_total) || 0,
        custo_por_m2: parseFloat(form.custo_por_m2) || 1375,
        data_inicio: form.data_inicio || null,
        data_fim_prevista: form.data_fim_prevista || null,
        responsavel_tecnico: form.responsavel_tecnico,
        percentual_mao_obra: parseFloat(form.percentual_mao_obra) || 29.09,
        percentual_materiais: parseFloat(form.percentual_materiais) || 70.91,
        status: form.status,
      })

      if (error) { alert('Erro ao criar obra: ' + error.message); return }

      // Seed fases e momentos
      await seedObra(data.id, parseFloat(form.area_total) || 0, parseFloat(form.custo_por_m2) || 1375)

      setModalOpen(false)
      navigate('/dashboard')
    } finally {
      setSaving(false)
    }
  }

  async function seedObra(obraId, area, custoPorM2) {
    const orcamento = area * custoPorM2

    // Seed fases
    const fases = FASES_PADRAO.map(f => {
      const total = f.proporcao ? orcamento * (f.proporcao / 100) : 0
      return {
        obra_id: obraId,
        numero: f.numero,
        nome: f.nome,
        descricao: f.descricao,
        proporcao: f.proporcao,
        is_variavel: f.is_variavel,
        total_estimado: total,
        mao_obra_estimada: total * 0.2909,
        materiais_estimados: total * 0.7091,
        status: 'planejamento',
        percentual_concluido: 0,
      }
    })

    const { data: fasesCreated } = await supabase.from('fases').insert(fases).select('id, numero')
    const faseMap = {}
    fasesCreated?.forEach(f => { faseMap[f.numero] = f.id })

    // Seed momentos
    for (const m of MOMENTOS_PADRAO) {
      const { data: momento } = await supabase
        .from('momentos')
        .insert({
          obra_id: obraId,
          numero: m.numero,
          nome: m.nome,
          descricao: m.descricao,
          prazo_estimado_min: m.prazo_estimado_min,
          prazo_estimado_max: m.prazo_estimado_max,
          status: 'nao_iniciado',
          percentual_concluido: 0,
          ordem: m.numero,
        })
        .select()
        .single()

      if (!momento) continue

      // Seed tarefas do momento
      const tarefas = m.tarefas.map((t, idx) => ({
        obra_id: obraId,
        momento_id: momento.id,
        nome: t.nome,
        descricao: t.descricao || '',
        tipo: t.tipo,
        fase_ids: (t.fase_numeros || []).map(n => faseMap[n]).filter(Boolean),
        status: 'pendente',
        percentual_concluido: 0,
        ordem: idx,
      }))

      if (tarefas.length > 0) {
        await supabase.from('tarefas_momento').insert(tarefas)
      }
    }

    // Configura prerequisitos dos momentos (após todos criados)
    const { data: momentosCriados } = await supabase
      .from('momentos')
      .select('id, numero')
      .eq('obra_id', obraId)

    const momentoMap = {}
    momentosCriados?.forEach(m => { momentoMap[m.numero] = m.id })

    // Momento 2 requer Momento 1 concluído, etc.
    for (let i = 1; i <= 8; i++) {
      if (momentoMap[i] && momentoMap[i - 1]) {
        await supabase
          .from('momentos')
          .update({ prerequisito_ids: [momentoMap[i - 1]] })
          .eq('id', momentoMap[i])
      }
    }
  }

  function abrirObra(obra) {
    selecionarObra(obra)
    navigate('/dashboard')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={32} className="animate-spin text-brand-accent" />
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Minhas Obras</h1>
          <p className="text-sm text-brand-muted mt-0.5">{obras.length} obra{obras.length !== 1 ? 's' : ''} cadastrada{obras.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Nova Obra
        </Button>
      </div>

      {/* Grid */}
      {obras.length === 0 ? (
        <div className="card-base p-12 text-center">
          <div className="gradient-bar" />
          <Building2 size={48} className="text-brand-muted mx-auto mb-4" />
          <h3 className="font-display font-bold text-lg text-brand-dark mb-2">Nenhuma obra ainda</h3>
          <p className="text-sm text-brand-muted mb-4">Crie sua primeira obra para começar o controle.</p>
          <Button onClick={() => setModalOpen(true)}><Plus size={16} /> Criar primeira obra</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {obras.map(obra => {
            const pctGasto = obra.orcamento_total > 0
              ? Math.min(100, ((obra.total_gasto || 0) / obra.orcamento_total) * 100)
              : 0

            return (
              <button
                key={obra.id}
                onClick={() => abrirObra(obra)}
                className="card-base text-left hover:scale-[1.01] transition-transform duration-200"
              >
                <div className="gradient-bar" />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-brand-dark truncate">{obra.nome}</h3>
                      {obra.endereco && (
                        <p className="text-xs text-brand-muted flex items-center gap-1 mt-1 truncate">
                          <MapPin size={10} /> {obra.endereco}
                        </p>
                      )}
                    </div>
                    <Badge variant={
                      obra.status === 'em_andamento' ? 'blue' :
                      obra.status === 'concluida'    ? 'green' :
                      obra.status === 'pausada'      ? 'amber' : 'default'
                    }>
                      {getStatusLabel(obra.status)}
                    </Badge>
                  </div>

                  {/* Métricas */}
                  <div className="flex items-center gap-4">
                    <ProgressRing percent={obra.pct_fisico || 0} size={64} strokeWidth={6} />
                    <div className="flex-1 space-y-2">
                      <div>
                        <p className="text-xs text-brand-muted">Orçamento total</p>
                        <p className="text-sm font-bold font-display text-brand-dark">{formatCurrency(obra.orcamento_total)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-brand-muted">Área</p>
                        <p className="text-sm font-medium text-brand-dark">{obra.area_total ? `${obra.area_total} m²` : '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Datas */}
                  {(obra.data_inicio || obra.data_fim_prevista) && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-brand-border text-xs text-brand-muted">
                      <Calendar size={11} />
                      {formatDate(obra.data_inicio)} → {formatDate(obra.data_fim_prevista)}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Modal Nova Obra */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Obra" size="lg">
        <form onSubmit={handleCriar} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input label="Nome da obra *" placeholder="Ex: Residência Silva" value={form.nome}
              onChange={e => set('nome', e.target.value)} required />
          </div>
          <div className="md:col-span-2">
            <Input label="Endereço" placeholder="Rua, número, bairro" value={form.endereco}
              onChange={e => set('endereco', e.target.value)} />
          </div>
          <Input label="Área total (m²)" type="number" placeholder="250" value={form.area_total}
            onChange={e => set('area_total', e.target.value)} />
          <Input label="Custo por m² (R$)" type="number" placeholder="1375" value={form.custo_por_m2}
            onChange={e => set('custo_por_m2', e.target.value)} />
          <Input label="Data de início" type="date" value={form.data_inicio}
            onChange={e => set('data_inicio', e.target.value)} />
          <Input label="Previsão de conclusão" type="date" value={form.data_fim_prevista}
            onChange={e => set('data_fim_prevista', e.target.value)} />
          <Input label="Responsável técnico" placeholder="Eng. João Silva (CREA 12345)" value={form.responsavel_tecnico}
            onChange={e => set('responsavel_tecnico', e.target.value)} />
          <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="planejamento">Planejamento</option>
            <option value="em_andamento">Em andamento</option>
            <option value="pausada">Pausada</option>
            <option value="concluida">Concluída</option>
          </Select>

          {/* Preview orçamento */}
          {form.area_total && form.custo_por_m2 && (
            <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
              <TrendingUp size={16} className="text-brand-accent flex-shrink-0" />
              <div>
                <p className="text-xs text-brand-muted">Orçamento calculado</p>
                <p className="text-lg font-bold font-display text-brand-accent">
                  {formatCurrency(parseFloat(form.area_total) * parseFloat(form.custo_por_m2))}
                </p>
                <p className="text-[10px] text-brand-muted">
                  As 23 fases padrão e os 8 momentos serão criados automaticamente.
                </p>
              </div>
            </div>
          )}

          <div className="md:col-span-2 flex justify-end gap-3 pt-2 border-t border-brand-border">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving}>Criar obra</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
