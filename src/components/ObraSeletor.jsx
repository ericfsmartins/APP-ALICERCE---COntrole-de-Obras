import { useState } from 'react'
import { ChevronDown, Building2, Plus } from 'lucide-react'
import { useObra } from '@/contexts/ObraContext'
import { useNavigate } from 'react-router-dom'
import { cn, getStatusColor, getStatusLabel } from '@/lib/utils'

export default function ObraSeletor() {
  const { obras, obraAtiva, selecionarObra } = useObra()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  if (!obraAtiva) return (
    <button
      onClick={() => navigate('/obras')}
      className="flex items-center gap-2 text-sm text-brand-muted hover:text-brand-dark"
    >
      <Building2 size={14} />
      Selecionar obra
    </button>
  )

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand-border bg-brand-bg hover:bg-white transition-colors max-w-[200px]"
      >
        <Building2 size={14} className="text-brand-accent flex-shrink-0" />
        <span className="text-sm font-medium text-brand-dark truncate">{obraAtiva.nome}</span>
        <ChevronDown size={12} className="text-brand-muted flex-shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 w-64 bg-white rounded-xl border border-brand-border shadow-lg z-20 py-1 max-h-72 overflow-y-auto scrollbar-thin">
            {obras.map(obra => (
              <button
                key={obra.id}
                onClick={() => { selecionarObra(obra); setOpen(false) }}
                className={cn(
                  "w-full text-left px-3 py-2.5 hover:bg-brand-bg transition-colors flex items-start gap-2",
                  obra.id === obraAtiva.id && "bg-brand-bg"
                )}
              >
                <Building2 size={14} className="text-brand-accent mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-brand-dark truncate">{obra.nome}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", getStatusColor(obra.status))}>
                      {getStatusLabel(obra.status)}
                    </span>
                  </div>
                </div>
                {obra.id === obraAtiva.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-accent mt-1.5 flex-shrink-0" />
                )}
              </button>
            ))}
            <div className="border-t border-brand-border mt-1 pt-1">
              <button
                onClick={() => { navigate('/obras'); setOpen(false) }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-brand-accent hover:bg-brand-bg w-full"
              >
                <Plus size={14} /> Nova obra
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
