import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { FASES_PADRAO } from '@/lib/seedData'
import {
  Settings, Loader2, Save, RefreshCw, User, Shield,
  Building2, Calculator, Calendar, AlertCircle, Check
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { cn, formatCurrency } from '@/lib/utils'

const ROLES = [
  { value: 'admin',      label: 'Admin'          },
  { value: 'engenheiro', label: 'Engenheiro'      },
  { value: 'mestre',     label: 'Mestre de Obra'  },
  { value: 'cliente',    label: 'Cliente'         },
  { value: 'fornecedor', label: 'Fornecedor'      },
]

const ABAS = [
  { id: 'obra',     label: 'Obra',     icon: Building2   },
  { id: 'orcamento',label: 'Orçamento',icon: Calculator  },
  { id: 'usuarios', label: 'Usuários', icon: User        },
  { id: 'fases',    label: 'Fases',    icon: RefreshCw   },
]

export default function ConfiguracoesPage() {
  const { obraAtiva, atualizarObra } = useObra()
  const { profile, isAdmin, updateProfile } = useAuth()
  const [aba, setAba]         = useState('obra')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [erroSave, setErroSave] = useState('')
  const [usuarios, setUsuarios] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [form, setForm]       = useState({})
  const [profileForm, setProfileForm] = useState({ nome: '', role: '' })
  const [seedLoading, setSeedLoading] = useState(false)
  const [seedDone, setSeedDone] = useState(false)

  useEffect(() => {
    if (obraAtiva) {
      setForm({
        nome:                  obraAtiva.nome || '',
        endereco:              obraAtiva.endereco || '',
        responsavel_tecnico:   obraAtiva.responsavel_tecnico || '',
        area_total:            obraAtiva.area_total || '',
        custo_por_m2:          obraAtiva.custo_por_m2 || '',
        data_inicio:           obraAtiva.data_inicio || '',
        data_fim_prevista:     obraAtiva.data_fim_prevista || '',
        status:                obraAtiva.status || 'planejamento',
        percentual_mao_obra:   obraAtiva.percentual_mao_obra ?? 29.09,
        percentual_materiais:  obraAtiva.percentual_materiais ?? 70.91,
      })
    }
  }, [obraAtiva?.id])

  useEffect(() => {
    if (profile) {
      setProfileForm({ nome: profile.nome || '', role: profile.role || 'admin' })
    }
  }, [profile])

  useEffect(() => {
    if (aba === 'usuarios') loadUsuarios()
  }, [aba])

  async function loadUsuarios() {
    setLoadingUsers(true)
    const { data } = await supabase.from('profiles').select('id,nome,email,role').order('nome')
    setUsuarios(data || [])
    setLoadingUsers(false)
  }

  const orcamentoCalculado = (parseFloat(form.area_total) || 0) * (parseFloat(form.custo_por_m2) || 0)

  async function salvarObra() {
    if (!obraAtiva) return
    setSaving(true)
    setErroSave('')
    const payload = {
      nome:                 form.nome,
      endereco:             form.endereco || null,
      responsavel_tecnico:  form.responsavel_tecnico || null,
      status:               form.status,
      area_total:           parseFloat(form.area_total)  || null,
      custo_por_m2:         parseFloat(form.custo_por_m2) || null,
      data_inicio:          form.data_inicio          || null,
      data_fim_prevista:    form.data_fim_prevista    || null,
      percentual_mao_obra:  parseFloat(form.percentual_mao_obra)  || 29.09,
      percentual_materiais: parseFloat(form.percentual_materiais) || 70.91,
    }
    const { error } = await atualizarObra(obraAtiva.id, payload)
    setSaving(false)
    if (error) {
      setErroSave('Erro ao salvar: ' + error.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  async function salvarPerfil() {
    setSaving(true)
    await updateProfile({ nome: profileForm.nome, role: profileForm.role })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function alterarRoleUsuario(uid, role) {
    await supabase.from('profiles').update({ role }).eq('id', uid)
    setUsuarios(prev => prev.map(u => u.id === uid ? { ...u, role } : u))
  }

  async function seedFases() {
    if (!obraAtiva) return
    if (!confirm(`Isso vai adicionar as 23 fases padrão à obra "${obraAtiva.nome}". Fases existentes não serão apagadas. Confirmar?`)) return
    setSeedLoading(true)
    const orcTotal = obraAtiva.orcamento_total || 0
    const pctMO = obraAtiva.percentual_mao_obra ?? 29.09
    const pctMat = obraAtiva.percentual_materiais ?? 70.91

    const payloads = FASES_PADRAO.map(f => ({
      obra_id:              obraAtiva.id,
      numero:               f.numero,
      nome:                 f.nome,
      descricao:            f.descricao || '',
      proporcao:            f.proporcao,
      is_variavel:          f.is_variavel,
      total_estimado:       f.is_variavel ? null : (orcTotal * (f.proporcao / 100)),
      mao_obra_estimada:    f.is_variavel ? null : (orcTotal * (f.proporcao / 100) * pctMO / 100),
      materiais_estimados:  f.is_variavel ? null : (orcTotal * (f.proporcao / 100) * pctMat / 100),
      total_realizado:      0,
      mao_obra_realizada:   0,
      materiais_realizados: 0,
      percentual_concluido: 0,
      status:               'planejamento',
    }))

    await supabase.from('fases').insert(payloads)
    setSeedLoading(false)
    setSeedDone(true)
    setTimeout(() => setSeedDone(false), 3000)
  }

  if (!obraAtiva) return (
    <div className="text-center py-20 text-brand-muted">
      <Settings size={40} className="mx-auto mb-3 opacity-40" />
      <p>Selecione uma obra para ver as configurações.</p>
    </div>
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-dark">Configurações</h1>
        <p className="text-sm text-brand-muted">{obraAtiva.nome}</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-brand-border">
        {ABAS.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px",
                aba === a.id
                  ? "border-brand-accent text-brand-accent font-medium"
                  : "border-transparent text-brand-muted hover:text-brand-dark"
              )}
            >
              <Icon size={14} /> {a.label}
            </button>
          )
        })}
      </div>

      {/* Aba: Obra */}
      {aba === 'obra' && (
        <div className="card-base p-6 space-y-4">
          <div className="gradient-bar" />
          <h2 className="font-display font-bold text-brand-dark">Dados da Obra</h2>
          <Input
            label="Nome da obra *"
            value={form.nome}
            onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
            placeholder="Ex: Residência Silva"
          />
          <Input
            label="Endereço"
            value={form.endereco}
            onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))}
            placeholder="Rua, número, bairro, cidade"
          />
          <Input
            label="Responsável técnico (engenheiro / arquiteto)"
            value={form.responsavel_tecnico}
            onChange={e => setForm(p => ({ ...p, responsavel_tecnico: e.target.value }))}
            placeholder="Nome + CREA/CAU"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data de início"
              type="date"
              value={form.data_inicio}
              onChange={e => setForm(p => ({ ...p, data_inicio: e.target.value }))}
            />
            <Input
              label="Previsão de término"
              type="date"
              value={form.data_fim_prevista}
              onChange={e => setForm(p => ({ ...p, data_fim_prevista: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1">Status da obra</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
            >
              <option value="planejamento">Planejamento</option>
              <option value="em_andamento">Em andamento</option>
              <option value="pausada">Pausada</option>
              <option value="concluida">Concluída</option>
            </select>
          </div>
          <SaveButton saving={saving} saved={saved} onClick={salvarObra} erro={erroSave} />
        </div>
      )}

      {/* Aba: Orçamento */}
      {aba === 'orcamento' && (
        <div className="space-y-4">
          <div className="card-base p-6 space-y-4">
            <div className="gradient-bar" />
            <h2 className="font-display font-bold text-brand-dark">Parâmetros de Custo</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Área total (m²)"
                type="number"
                step="0.01"
                value={form.area_total}
                onChange={e => setForm(p => ({ ...p, area_total: e.target.value }))}
                placeholder="Ex: 250"
              />
              <Input
                label="Custo por m² (R$)"
                type="number"
                step="0.01"
                value={form.custo_por_m2}
                onChange={e => setForm(p => ({ ...p, custo_por_m2: e.target.value }))}
                placeholder="Ex: 5500"
              />
            </div>

            {/* Orçamento calculado */}
            <div className="bg-brand-bg border border-brand-border rounded-xl p-4">
              <p className="text-xs text-brand-muted mb-1">Orçamento total calculado</p>
              <p className="text-3xl font-display font-bold text-brand-accent">{formatCurrency(orcamentoCalculado)}</p>
              <p className="text-xs text-brand-muted mt-1">= {form.area_total || 0} m² × {formatCurrency(parseFloat(form.custo_por_m2) || 0)}/m²</p>
            </div>

            <h3 className="font-medium text-brand-dark text-sm pt-2">Composição padrão SINAPI</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1">% Mão de Obra</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min="0" max="100" step="0.01"
                    value={form.percentual_mao_obra}
                    onChange={e => setForm(p => ({
                      ...p,
                      percentual_mao_obra: parseFloat(e.target.value),
                      percentual_materiais: parseFloat((100 - parseFloat(e.target.value)).toFixed(2))
                    }))}
                    className="flex-1"
                  />
                  <span className="text-sm font-bold text-brand-dark w-14 text-right">
                    {parseFloat(form.percentual_mao_obra).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1">% Materiais</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min="0" max="100" step="0.01"
                    value={form.percentual_materiais}
                    onChange={e => setForm(p => ({
                      ...p,
                      percentual_materiais: parseFloat(e.target.value),
                      percentual_mao_obra: parseFloat((100 - parseFloat(e.target.value)).toFixed(2))
                    }))}
                    className="flex-1"
                  />
                  <span className="text-sm font-bold text-brand-dark w-14 text-right">
                    {parseFloat(form.percentual_materiais).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs text-brand-muted">
              Padrão SINAPI: 29,09% MO / 70,91% Materiais.
              Total deve somar 100% ({(parseFloat(form.percentual_mao_obra) + parseFloat(form.percentual_materiais)).toFixed(2)}%).
            </p>
            <SaveButton saving={saving} saved={saved} onClick={salvarObra} erro={erroSave} />
          </div>
        </div>
      )}

      {/* Aba: Usuários */}
      {aba === 'usuarios' && (
        <div className="space-y-4">
          {/* Perfil próprio */}
          <div className="card-base p-6 space-y-4">
            <div className="gradient-bar" />
            <h2 className="font-display font-bold text-brand-dark flex items-center gap-2">
              <User size={16} /> Meu Perfil
            </h2>
            <Input
              label="Nome"
              value={profileForm.nome}
              onChange={e => setProfileForm(p => ({ ...p, nome: e.target.value }))}
            />
            {isAdmin && (
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1">Minha função</label>
                <select
                  value={profileForm.role}
                  onChange={e => setProfileForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 focus:outline-none"
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            )}
            <SaveButton saving={saving} saved={saved} onClick={salvarPerfil} />
          </div>

          {/* Lista de usuários (apenas admin) */}
          {isAdmin && (
            <div className="card-base p-6">
              <div className="gradient-bar" />
              <h2 className="font-display font-bold text-brand-dark mb-4 flex items-center gap-2">
                <Shield size={16} /> Usuários do sistema
              </h2>
              {loadingUsers ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={22} className="animate-spin text-brand-accent" />
                </div>
              ) : usuarios.length === 0 ? (
                <p className="text-sm text-brand-muted">Nenhum usuário encontrado.</p>
              ) : (
                <div className="space-y-2">
                  {usuarios.map(u => (
                    <div key={u.id} className="flex items-center gap-3 py-2 border-b border-brand-border last:border-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-dark to-brand-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {u.nome?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-brand-dark truncate">{u.nome || '—'}</p>
                        <p className="text-xs text-brand-muted truncate">{u.email}</p>
                      </div>
                      <select
                        value={u.role || 'cliente'}
                        onChange={e => alterarRoleUsuario(u.id, e.target.value)}
                        className="text-xs border border-brand-border rounded-lg px-2 py-1 focus:outline-none"
                        disabled={u.id === profile?.id}
                      >
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Aba: Fases */}
      {aba === 'fases' && (
        <div className="space-y-4">
          <div className="card-base p-6">
            <div className="gradient-bar" />
            <h2 className="font-display font-bold text-brand-dark mb-2">Fases padrão SINAPI</h2>
            <p className="text-sm text-brand-muted mb-4">
              Carrega as 23 fases padrão calibradas pelo SINAPI para construção residencial brasileira.
              Os valores são calculados automaticamente com base no orçamento total da obra.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800 flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>Atenção:</strong> As fases serão adicionadas às fases existentes. Para recarregar do zero, exclua as fases manualmente antes.
                {!obraAtiva.orcamento_total && (
                  <p className="mt-1">Para que os valores sejam calculados, configure o orçamento total em <strong>Orçamento</strong>.</p>
                )}
              </div>
            </div>

            {/* Preview das fases */}
            <div className="overflow-x-auto border border-brand-border rounded-xl mb-4">
              <table className="w-full text-xs">
                <thead className="bg-brand-dark text-white">
                  <tr>
                    <th className="text-left px-3 py-2">Nº</th>
                    <th className="text-left px-3 py-2">Fase</th>
                    <th className="text-right px-3 py-2">%</th>
                    <th className="text-right px-3 py-2">Estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {FASES_PADRAO.map((f, i) => {
                    const orcTotal = obraAtiva.orcamento_total || 0
                    const val = f.is_variavel ? null : (orcTotal * (f.proporcao / 100))
                    return (
                      <tr key={f.numero} className={cn("border-b border-brand-border", i%2===0?"bg-white":"bg-brand-bg")}>
                        <td className="px-3 py-1.5 text-brand-muted">{f.numero}</td>
                        <td className="px-3 py-1.5 text-brand-dark">{f.nome}</td>
                        <td className="px-3 py-1.5 text-right text-brand-muted">
                          {f.is_variavel ? 'variável' : `${f.proporcao}%`}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium text-brand-accent">
                          {f.is_variavel ? '—' : formatCurrency(val)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Button
              onClick={seedFases}
              disabled={seedLoading}
              variant={seedDone ? 'outline' : 'default'}
            >
              {seedLoading ? (
                <><Loader2 size={14} className="animate-spin" /> Carregando fases...</>
              ) : seedDone ? (
                <><Check size={14} className="text-green-600" /> Fases adicionadas!</>
              ) : (
                <><RefreshCw size={14} /> Carregar 23 fases padrão</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SaveButton({ saving, saved, onClick, erro }) {
  return (
    <div className="pt-2 space-y-2">
      {erro && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {erro}
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={onClick} disabled={saving}>
          {saving ? (
            <><Loader2 size={14} className="animate-spin" /> Salvando...</>
          ) : saved ? (
            <><Check size={14} /> Salvo!</>
          ) : (
            <><Save size={14} /> Salvar</>
          )}
        </Button>
      </div>
    </div>
  )
}
