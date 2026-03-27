import { useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

const STATUS_COLORS = {
  planejamento: { bg: 'bg-slate-400',   border: 'border-slate-400',   text: 'text-slate-700',   hex: '#94a3b8' },
  em_andamento: { bg: 'bg-blue-500',    border: 'border-blue-500',    text: 'text-blue-700',    hex: '#3b82f6' },
  concluida:    { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-700', hex: '#22c55e' },
  pausada:      { bg: 'bg-amber-400',   border: 'border-amber-400',   text: 'text-amber-700',   hex: '#eab308' },
  atrasada:     { bg: 'bg-red-500',     border: 'border-red-500',     text: 'text-red-700',     hex: '#ef4444' },
}

function parseDateSafe(str) {
  if (!str) return null
  return new Date(str + 'T12:00:00')
}

function diffDays(a, b) {
  return Math.round((b - a) / 86400000)
}

function fmtShort(date) {
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

export default function TimelineObra({ fases = [], config = {} }) {
  const containerRef = useRef(null)

  const { blocks, months, totalDays, todayPct } = useMemo(() => {
    const inicio = parseDateSafe(config.data_inicio)
    const fim    = parseDateSafe(config.data_fim_prevista)
    const hoje   = new Date()

    if (!inicio || !fim || fim <= inicio) return { blocks: [], months: [], totalDays: 0, todayPct: 0 }

    const totalDays = Math.max(1, diffDays(inicio, fim))
    const todayPct  = Math.min(100, Math.max(0, (diffDays(inicio, hoje) / totalDays) * 100))

    // Months axis
    const months = []
    const cur = new Date(inicio)
    cur.setDate(1)
    while (cur <= fim) {
      const pct = (diffDays(inicio, cur) / totalDays) * 100
      if (pct >= 0 && pct <= 100) months.push({ label: fmtShort(cur), pct: Math.max(0, pct) })
      cur.setMonth(cur.getMonth() + 1)
    }

    // Phase blocks
    const blocks = fases
      .filter(f => f.data_inicio_prevista || f.data_fim_prevista)
      .map(f => {
        const fInicio = parseDateSafe(f.data_inicio_prevista) || inicio
        const fFim    = parseDateSafe(f.data_fim_prevista)    || fim
        const durDays = Math.max(3, diffDays(fInicio, fFim))
        const leftPct = Math.max(0, (diffDays(inicio, fInicio) / totalDays) * 100)
        const widPct  = Math.min(100 - leftPct, (durDays / totalDays) * 100)

        // Detecta atraso
        const isAtrasada = f.status !== 'concluida' && fFim < hoje
        const status = isAtrasada ? 'atrasada' : (f.status || 'planejamento')
        const desvio = isAtrasada ? diffDays(fFim, hoje) : null

        return { ...f, leftPct, widPct: Math.max(widPct, 2), status, desvio }
      })

    return { blocks, months, totalDays, todayPct }
  }, [fases, config])

  if (!totalDays || blocks.length === 0) return null

  return (
    <div className="card-base p-5">
      <div className="gradient-bar" />
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-bold text-brand-dark text-base">Linha do Tempo da Obra</h2>
          <p className="text-[11px] text-brand-muted mt-0.5">Duração total: {totalDays} dias · {fases.length} fases</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-brand-muted flex-wrap">
          {Object.entries(STATUS_COLORS).map(([s, c]) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn('w-2.5 h-2.5 rounded-sm inline-block', c.bg)} />
              {s === 'em_andamento' ? 'Em andamento' : s === 'nao_iniciado' ? 'Não iniciado' :
               s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Timeline scroll container */}
      <div ref={containerRef} className="overflow-x-auto pb-2 scrollbar-thin">
        <div className="relative" style={{ minWidth: '600px' }}>

          {/* Fases */}
          <div className="relative h-10 mb-1">
            {/* Barra de fundo */}
            <div className="absolute inset-y-0 left-0 right-0 bg-brand-bg rounded-lg" />

            {/* Bloco de cada fase */}
            {blocks.map((f, idx) => {
              const col = STATUS_COLORS[f.status] || STATUS_COLORS.planejamento
              return (
                <div
                  key={f.id || idx}
                  className="absolute top-1 bottom-1 rounded-md flex items-center px-1.5 overflow-hidden cursor-pointer group transition-all hover:z-10 hover:scale-y-110"
                  style={{
                    left: `${f.leftPct}%`,
                    width: `${f.widPct}%`,
                    backgroundColor: col.hex + 'cc',
                    border: `1.5px solid ${col.hex}`,
                    borderStyle: f.is_variavel ? 'dashed' : 'solid',
                  }}
                  title={[
                    f.nome,
                    `Status: ${f.status}`,
                    `Progresso: ${f.percentual_concluido || 0}%`,
                    f.data_inicio_prevista ? `Início: ${f.data_inicio_prevista}` : '',
                    f.data_fim_prevista    ? `Fim: ${f.data_fim_prevista}` : '',
                    f.desvio ? `Atraso: ${f.desvio} dias` : '',
                  ].filter(Boolean).join('\n')}
                >
                  <span className="text-white text-[10px] font-bold truncate drop-shadow-sm select-none">
                    {f.numero}. {f.nome?.split(':')[0]?.trim()}
                  </span>
                  {/* Barra de progresso interna */}
                  <div
                    className="absolute bottom-0 left-0 h-0.5 bg-white/60 rounded-b"
                    style={{ width: `${f.percentual_concluido || 0}%` }}
                  />
                </div>
              )
            })}

            {/* Marcador HOJE */}
            {todayPct > 0 && todayPct < 100 && (
              <div
                className="absolute top-0 bottom-0 z-20 flex flex-col items-center pointer-events-none"
                style={{ left: `${todayPct}%` }}
              >
                <div className="w-px h-full bg-brand-accent" />
                <div className="absolute -top-5 -translate-x-1/2 bg-brand-accent text-white text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
                  HOJE
                </div>
              </div>
            )}
          </div>

          {/* Eixo de meses */}
          <div className="relative h-5 mt-1">
            {months.map((m, i) => (
              <div
                key={i}
                className="absolute text-[9px] text-brand-muted"
                style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legenda de atrasos */}
      {blocks.some(b => b.status === 'atrasada') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {blocks.filter(b => b.status === 'atrasada').map(f => (
            <span key={f.id} className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">
              ⚠ Fase {f.numero} atrasada {f.desvio}d
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
