import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import { propagarDespesa, propagarDespesaViaInsumo } from '@/lib/propagation'
import { Zap, CheckCircle2, Link } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { cn } from '@/lib/utils'

const TIPOS = [
  { value: 'mao_obra',    label: 'Mão de Obra', color: 'bg-blue-100 text-blue-700 border-blue-300'      },
  { value: 'material',    label: 'Material',    color: 'bg-amber-100 text-amber-700 border-amber-300'   },
  { value: 'servico',     label: 'Serviço',     color: 'bg-green-100 text-green-700 border-green-300'   },
  { value: 'equipamento', label: 'Equipamento', color: 'bg-purple-100 text-purple-700 border-purple-300'},
  { value: 'outro',       label: 'Outro',       color: 'bg-slate-100 text-slate-600 border-slate-300'   },
]

export default function LancamentoPage() {
  const { obraAtiva } = useObra()
  const [fases, setFases]       = useState([])
  const [momentos, setMomentos] = useState([])
  const [insumos, setInsumos]   = useState([])
  const [saving, setSaving]     = useState(false)
  const [success, setSuccess]   = useState(false)
  const [form, setForm]         = useState(defaultForm())

  function defaultForm() {
    return {
      descricao: '', valor: '', tipo: 'material',
      insumo_id: '', fase_id: '', momento_id: '',
      fornecedor_nome: '',
      data_lancamento: new Date().toISOString().split('T')[0],
      status_pagamento: 'pendente',
      forma_pagamento: '',
      observacoes: '',
    }
  }

  useEffect(() => {
    if (!obraAtiva) return
    Promise.all([
      supabase.from('fases').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero'),
      supabase.from('momentos').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero'),
      supabase.from('insumos').select('id,nome,fase_id,momento_id,fase_nome,momento_nome,categoria').eq('obra_id', obraAtiva.id).order('ranking'),
    ]).then(([f, m, i]) => {
      setFases(f.data || [])
      setMomentos(m.data || [])
      setInsumos(i.data || [])
    })
  }, [obraAtiva?.id])

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  // Ao selecionar um insumo: preenche fase e momento automaticamente
  function handleInsumoChange(insumoId) {
    const insumo = insumos.find(i => i.id === insumoId)
    setForm(prev => ({
      ...prev,
      insumo_id: insumoId,
      fase_id:    insumo?.fase_id    || prev.fase_id,
      momento_id: insumo?.momento_id || prev.momento_id,
      descricao:  prev.descricao || insumo?.nome || '',
    }))
  }

  function parseMoeda(v) {
    return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0
  }

  async function handleSubmit(e, lancarOutro = false) {
    e?.preventDefault()
    if (!form.descricao || !form.valor) return
    setSaving(true)

    const faseSel  = fases.find(f => f.id === form.fase_id)
    const momSel   = momentos.find(m => m.id === form.momento_id)
    const insumoSel = insumos.find(i => i.id === form.insumo_id)
    const valor    = parseMoeda(form.valor)

    const { error } = await supabase.from('despesas').insert({
      obra_id:          obraAtiva.id,
      descricao:        form.descricao,
      valor,
      tipo:             form.tipo,
      insumo_id:        form.insumo_id || null,
      fase_id:          form.fase_id   || insumoSel?.fase_id    || null,
      fase_nome:        faseSel?.nome  || insumoSel?.fase_nome  || null,
      momento_id:       form.momento_id || insumoSel?.momento_id || null,
      momento_nome:     momSel?.nome   || insumoSel?.momento_nome || null,
      fornecedor_nome:  form.fornecedor_nome || null,
      data_lancamento:  form.data_lancamento,
      status_pagamento: form.status_pagamento,
      forma_pagamento:  form.forma_pagamento || null,
      observacoes:      form.observacoes || null,
    })

    if (!error) {
      // Propagação: via insumo (se tiver) ou direta
      if (form.insumo_id) {
        await propagarDespesaViaInsumo({ obraId: obraAtiva.id, insumoId: form.insumo_id })
      } else {
        await propagarDespesa({
          obraId: obraAtiva.id,
          faseId: form.fase_id || null,
          momentoId: form.momento_id || null,
        })
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)

      if (lancarOutro) {
        setForm(prev => ({ ...defaultForm(), fase_id: prev.fase_id, momento_id: prev.momento_id, tipo: prev.tipo }))
      } else {
        setForm(defaultForm())
      }
    }

    setSaving(false)
  }

  if (!obraAtiva) return <p className="text-brand-muted text-center py-20">Selecione uma obra.</p>

  const insumoSelecionado = insumos.find(i => i.id === form.insumo_id)

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-brand-dark flex items-center gap-2">
          <Zap size={24} className="text-brand-accent" /> Lançamento Rápido
        </h1>
        <p className="text-sm text-brand-muted mt-0.5">Registre uma despesa e atualize automaticamente fases e momentos.</p>
      </div>

      <div className="card-base">
        <div className="gradient-bar" />
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-brand-dark">Tipo</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {TIPOS.map(t => (
                <button key={t.value} type="button" onClick={() => set('tipo', t.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all',
                    form.tipo === t.value ? t.color : 'border-brand-border text-brand-muted hover:border-brand-accent'
                  )}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Insumo (opcional — auto-preenche fase/momento) */}
          <div>
            <label className="text-xs font-medium text-brand-dark flex items-center gap-1">
              <Link size={11} /> Insumo (opcional — preenche fase e momento automaticamente)
            </label>
            <select
              value={form.insumo_id}
              onChange={e => handleInsumoChange(e.target.value)}
              className="mt-1 w-full text-sm border border-brand-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
            >
              <option value="">— sem vínculo com insumo —</option>
              {insumos.map(i => (
                <option key={i.id} value={i.id}>
                  [{i.categoria || '—'}] {i.nome}
                </option>
              ))}
            </select>
            {insumoSelecionado && (
              <p className="mt-1 text-[11px] text-brand-accent">
                Auto-vinculado: {insumoSelecionado.fase_nome || '—'} · M{momentos.find(m => m.id === insumoSelecionado.momento_id)?.numero ?? '—'}
              </p>
            )}
          </div>

          {/* Descrição */}
          <Input
            label="Descrição *"
            placeholder="Ex: Compra de cimento Portland 50kg"
            value={form.descricao}
            onChange={e => set('descricao', e.target.value)}
            required
          />

          {/* Valor */}
          <div>
            <label className="text-xs font-medium text-brand-dark">Valor (R$) *</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted text-sm">R$</span>
              <input
                type="text"
                placeholder="0,00"
                value={form.valor}
                onChange={e => set('valor', e.target.value)}
                className="h-9 w-full rounded-xl border border-brand-border pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
                required
              />
            </div>
          </div>

          {/* Fase e Momento (editáveis, mesmo se preenchidos pelo insumo) */}
          <div className="grid grid-cols-2 gap-3">
            <Select label="Fase" value={form.fase_id} onChange={e => set('fase_id', e.target.value)}>
              <option value="">Selecione...</option>
              {fases.map(f => <option key={f.id} value={f.id}>{f.numero}. {f.nome.slice(0, 28)}</option>)}
            </Select>
            <Select label="Momento" value={form.momento_id} onChange={e => set('momento_id', e.target.value)}>
              <option value="">Selecione...</option>
              {momentos.map(m => <option key={m.id} value={m.id}>M{m.numero} — {m.nome.split('—')[0].trim().slice(0, 18)}</option>)}
            </Select>
          </div>

          {/* Fornecedor */}
          <Input
            label="Fornecedor"
            placeholder="Nome do fornecedor"
            value={form.fornecedor_nome}
            onChange={e => set('fornecedor_nome', e.target.value)}
          />

          {/* Data e Pagamento */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data" type="date" value={form.data_lancamento} onChange={e => set('data_lancamento', e.target.value)} />
            <div>
              <label className="text-xs font-medium text-brand-dark">Pagamento</label>
              <div className="flex gap-2 mt-1">
                {['pendente', 'pago'].map(s => (
                  <button key={s} type="button" onClick={() => set('status_pagamento', s)}
                    className={cn(
                      'flex-1 h-9 rounded-xl text-xs font-medium border-2 transition-all',
                      form.status_pagamento === s
                        ? s === 'pago' ? 'bg-green-100 text-green-700 border-green-400' : 'bg-amber-100 text-amber-700 border-amber-400'
                        : 'border-brand-border text-brand-muted'
                    )}>
                    {s === 'pago' ? 'Pago' : 'Pendente'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs font-medium text-brand-dark">Observações</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-brand-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
              rows={2}
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
              placeholder="Nota fiscal, detalhes..."
            />
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {success ? <><CheckCircle2 size={16} /> Lançado!</> : 'Lançar despesa'}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={e => handleSubmit(e, true)}>
              + Outro
            </Button>
          </div>

          {success && (
            <div className="flex items-center gap-2 text-status-green text-sm bg-green-50 rounded-xl p-3">
              <CheckCircle2 size={16} />
              Despesa lançada! Fases e Momentos atualizados automaticamente.
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
