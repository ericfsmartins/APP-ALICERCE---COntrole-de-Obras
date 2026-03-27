import { useEffect, useState } from 'react'
import { useObra } from '@/contexts/ObraContext'
import { supabase } from '@/lib/supabase'
import { Plus, Sun, Cloud, CloudRain, CloudLightning, Users, Loader2, BookOpen, Image, ChevronDown } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { formatDate, cn } from '@/lib/utils'
import imageCompression from 'browser-image-compression'

const CLIMA_ICONS = { sol: Sun, nublado: Cloud, chuva: CloudRain, chuva_forte: CloudLightning }
const CLIMA_LABELS = { sol: 'Ensolarado', nublado: 'Nublado', chuva: 'Chuva', chuva_forte: 'Chuva forte' }
const CLIMA_COLORS = { sol: 'text-amber-500', nublado: 'text-slate-400', chuva: 'text-blue-500', chuva_forte: 'text-blue-700' }

export default function DiarioPage() {
  const { obraAtiva } = useObra()
  const [entradas, setEntradas]   = useState([])
  const [fases, setFases]         = useState([])
  const [momentos, setMomentos]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [expandidos, setExpandidos] = useState({})

  useEffect(() => { if (obraAtiva) load() }, [obraAtiva?.id])

  async function load() {
    setLoading(true)
    const [{ data: d }, { data: f }, { data: m }] = await Promise.all([
      supabase.from('diario_obra').select('*').eq('obra_id', obraAtiva.id).order('data', { ascending: false }),
      supabase.from('fases').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero'),
      supabase.from('momentos').select('id,nome,numero').eq('obra_id', obraAtiva.id).order('numero'),
    ])
    setEntradas(d || [])
    setFases(f || [])
    setMomentos(m || [])
    setLoading(false)
  }

  async function salvarEntrada(dados, fotos) {
    setSaving(true)
    try {
      let fotosUrls = []

      // Upload de fotos
      for (const foto of fotos) {
        try {
          const compressed = await imageCompression(foto, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true })
          const ext = foto.name.split('.').pop()
          const path = `${obraAtiva.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
          const { data: up } = await supabase.storage.from('diario-fotos').upload(path, compressed, { contentType: foto.type })
          if (up) {
            const { data: { publicUrl } } = supabase.storage.from('diario-fotos').getPublicUrl(path)
            fotosUrls.push(publicUrl)
          }
        } catch (err) { console.error('Erro ao comprimir/fazer upload de foto:', err) }
      }

      const faseSel = fases.find(f => f.id === dados.fase_id)
      const momSel  = momentos.find(m => m.id === dados.momento_id)

      await supabase.from('diario_obra').insert({
        obra_id: obraAtiva.id,
        data: dados.data,
        fase_id: dados.fase_id || null,
        fase_nome: faseSel?.nome || null,
        momento_id: dados.momento_id || null,
        momento_nome: momSel?.nome || null,
        atividades: dados.atividades,
        ocorrencias: dados.ocorrencias || null,
        funcionarios_presentes: parseInt(dados.funcionarios_presentes) || 0,
        clima: dados.clima,
        progresso_percentual: parseFloat(dados.progresso_percentual) || 0,
        fotos_urls: fotosUrls,
        observacoes: dados.observacoes || null,
        responsavel: dados.responsavel || null,
      })

      setModal(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  function toggleExpand(id) {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (!obraAtiva) return <p className="text-brand-muted text-center py-20">Selecione uma obra.</p>
  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-brand-accent" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-dark">Diário de Obra</h1>
          <p className="text-sm text-brand-muted">{entradas.length} entradas registradas</p>
        </div>
        <Button onClick={() => setModal(true)}><Plus size={16} /> Nova entrada</Button>
      </div>

      {entradas.length === 0 ? (
        <div className="card-base p-12 text-center">
          <div className="gradient-bar" />
          <BookOpen size={40} className="text-brand-muted mx-auto mb-3" />
          <p className="text-brand-muted">Nenhuma entrada no diário ainda.</p>
          <Button className="mt-4" onClick={() => setModal(true)}><Plus size={14} /> Registrar primeiro dia</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {entradas.map(entrada => {
            const ClimaIcon = CLIMA_ICONS[entrada.clima] || Sun
            const expanded  = expandidos[entrada.id]

            return (
              <div key={entrada.id} className="card-base">
                <div className="gradient-bar" />
                <button className="w-full text-left p-5 flex items-start gap-4" onClick={() => toggleExpand(entrada.id)}>
                  {/* Data */}
                  <div className="flex-shrink-0 text-center bg-brand-bg rounded-xl p-3 min-w-[56px]">
                    <div className="text-lg font-display font-bold text-brand-dark">{new Date(entrada.data + 'T12:00:00').getDate()}</div>
                    <div className="text-[10px] text-brand-muted uppercase">
                      {new Date(entrada.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <ClimaIcon size={16} className={CLIMA_COLORS[entrada.clima]} />
                      <span className="text-xs text-brand-muted">{CLIMA_LABELS[entrada.clima]}</span>
                      {entrada.funcionarios_presentes > 0 && (
                        <span className="text-xs text-brand-muted flex items-center gap-1">
                          <Users size={12} /> {entrada.funcionarios_presentes}
                        </span>
                      )}
                      {entrada.progresso_percentual > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          +{entrada.progresso_percentual}% progresso
                        </span>
                      )}
                    </div>
                    <p className={cn("text-sm text-brand-dark", !expanded && "line-clamp-2")}>
                      {entrada.atividades}
                    </p>
                    {entrada.ocorrencias && !expanded && (
                      <p className="text-xs text-amber-600 mt-1 line-clamp-1">⚠ {entrada.ocorrencias}</p>
                    )}
                    {/* Fotos preview */}
                    {entrada.fotos_urls?.length > 0 && !expanded && (
                      <div className="flex gap-1 mt-2">
                        {entrada.fotos_urls.slice(0, 4).map((url, i) => (
                          <img key={i} src={url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ))}
                        {entrada.fotos_urls.length > 4 && (
                          <div className="w-10 h-10 rounded-lg bg-brand-bg flex items-center justify-center text-xs text-brand-muted">
                            +{entrada.fotos_urls.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <ChevronDown size={16} className={cn("text-brand-muted transition-transform flex-shrink-0", expanded && "rotate-180")} />
                </button>

                {/* Expandido */}
                {expanded && (
                  <div className="px-5 pb-5 border-t border-brand-border space-y-3 pt-4">
                    {entrada.atividades && (
                      <div>
                        <p className="text-xs font-medium text-brand-dark mb-1">Atividades</p>
                        <p className="text-sm text-brand-dark whitespace-pre-wrap">{entrada.atividades}</p>
                      </div>
                    )}
                    {entrada.ocorrencias && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p className="text-xs font-medium text-amber-700 mb-1">⚠ Ocorrências</p>
                        <p className="text-sm text-amber-700">{entrada.ocorrencias}</p>
                      </div>
                    )}
                    {entrada.fotos_urls?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-brand-dark mb-2">Fotos ({entrada.fotos_urls.length})</p>
                        <div className="grid grid-cols-4 gap-2">
                          {entrada.fotos_urls.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt="" className="w-full aspect-square rounded-xl object-cover hover:opacity-80 transition-opacity" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {entrada.responsavel && <p className="text-xs text-brand-muted">Responsável: {entrada.responsavel}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* FAB mobile */}
      <button
        onClick={() => setModal(true)}
        className="fixed bottom-20 right-4 lg:hidden w-14 h-14 rounded-full bg-brand-accent text-white shadow-lg flex items-center justify-center z-30"
      >
        <Plus size={24} />
      </button>

      {modal && (
        <ModalDiario fases={fases} momentos={momentos} onSave={salvarEntrada} onClose={() => setModal(false)} saving={saving} />
      )}
    </div>
  )
}

function ModalDiario({ fases, momentos, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    data: new Date().toISOString().split('T')[0],
    fase_id: '', momento_id: '',
    atividades: '', ocorrencias: '',
    funcionarios_presentes: '',
    clima: 'sol', progresso_percentual: '',
    observacoes: '', responsavel: '',
  })
  const [fotos, setFotos] = useState([])

  return (
    <Modal open onClose={onClose} title="Nova entrada no Diário" size="xl">
      <div className="p-6 space-y-4">
        {/* Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input label="Data" type="date" value={form.data} onChange={e => setForm(p=>({...p,data:e.target.value}))} />
          <Select label="Clima" value={form.clima} onChange={e => setForm(p=>({...p,clima:e.target.value}))}>
            {Object.entries(CLIMA_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input label="Funcionários presentes" type="number" value={form.funcionarios_presentes} onChange={e => setForm(p=>({...p,funcionarios_presentes:e.target.value}))} />
          <Input label="Progresso do dia (%)" type="number" min="0" max="100" value={form.progresso_percentual} onChange={e => setForm(p=>({...p,progresso_percentual:e.target.value}))} />
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select label="Fase" value={form.fase_id} onChange={e => setForm(p=>({...p,fase_id:e.target.value}))}>
            <option value="">Nenhuma</option>
            {fases.map(f => <option key={f.id} value={f.id}>{f.numero}. {f.nome.slice(0,30)}</option>)}
          </Select>
          <Select label="Momento" value={form.momento_id} onChange={e => setForm(p=>({...p,momento_id:e.target.value}))}>
            <option value="">Nenhum</option>
            {momentos.map(m => <option key={m.id} value={m.id}>M{m.numero}</option>)}
          </Select>
          <Input label="Responsável" value={form.responsavel} onChange={e => setForm(p=>({...p,responsavel:e.target.value}))} />
        </div>
        <div>
          <label className="text-xs font-medium text-brand-dark">Atividades realizadas *</label>
          <textarea className="mt-1 w-full rounded-xl border border-brand-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30 min-h-[100px]"
            value={form.atividades} onChange={e => setForm(p=>({...p,atividades:e.target.value}))} required placeholder="Descreva as atividades realizadas..." />
        </div>
        <div>
          <label className="text-xs font-medium text-brand-dark">Ocorrências</label>
          <textarea className="mt-1 w-full rounded-xl border border-brand-border px-3 py-2 text-sm focus:outline-none"
            rows={2} value={form.ocorrencias} onChange={e => setForm(p=>({...p,ocorrencias:e.target.value}))} placeholder="Problemas, imprevistos, acidentes..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-brand-dark flex items-center gap-2">
              <Image size={14} /> Fotos (máx. 10)
            </label>
            <input type="file" accept="image/*" multiple className="mt-1 text-sm bg-brand-bg w-full rounded-xl px-3 py-2 border border-brand-border" onChange={e => setFotos(Array.from(e.target.files || []).slice(0, 10))} />
            {fotos.length > 0 && <p className="text-xs text-brand-muted mt-1">{fotos.length} foto(s) selecionada(s)</p>}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-brand-border">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={() => form.atividades && onSave(form, fotos)}>Salvar entrada</Button>
        </div>
      </div>
    </Modal>
  )
}
