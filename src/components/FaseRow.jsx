import { cn, formatCurrency, formatPercent, calcDesvio, getStatusColor, getStatusLabel } from '@/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

export default function FaseRow({ fase, onClick, expanded, children }) {
  const desvio = calcDesvio(fase.total_realizado || 0, fase.total_estimado || 0)
  const desvioPositivo = desvio > 0

  return (
    <div className="card-base mb-2">
      <div className="gradient-bar" />
      <button
        className="w-full text-left p-4 flex items-center gap-3"
        onClick={onClick}
      >
        {/* Número */}
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
          fase.status === 'pausada' ? "bg-amber-100 text-amber-700" :
          fase.status === 'concluida' ? "bg-green-100 text-green-700" :
          fase.status === 'em_andamento' ? "bg-blue-100 text-blue-700" :
          "bg-slate-100 text-slate-600"
        )}>
          {fase.numero}
        </div>

        {/* Nome + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-brand-dark truncate">{fase.nome}</span>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", getStatusColor(fase.status))}>
              {getStatusLabel(fase.status)}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-brand-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-dark to-brand-accent transition-all duration-500"
                style={{ width: `${fase.percentual_concluido || 0}%` }}
              />
            </div>
            <span className="text-xs text-brand-muted flex-shrink-0">{formatPercent(fase.percentual_concluido || 0, 0)}</span>
          </div>
        </div>

        {/* Financeiro */}
        <div className="hidden md:flex flex-col items-end flex-shrink-0">
          <span className="text-sm font-medium text-brand-dark">{formatCurrency(fase.total_realizado || 0)}</span>
          <span className="text-xs text-brand-muted">de {formatCurrency(fase.total_estimado || 0)}</span>
          {fase.total_estimado > 0 && (
            <span className={cn(
              "text-[10px] font-medium mt-0.5",
              desvioPositivo ? "text-status-red" : "text-status-green"
            )}>
              {desvioPositivo ? '+' : ''}{formatPercent(desvio, 1)} desvio
            </span>
          )}
        </div>

        <ChevronDown
          size={16}
          className={cn("text-brand-muted transition-transform flex-shrink-0", expanded && "rotate-180")}
        />
      </button>

      {expanded && children && (
        <div className="px-4 pb-4 border-t border-brand-border">
          {children}
        </div>
      )}
    </div>
  )
}
