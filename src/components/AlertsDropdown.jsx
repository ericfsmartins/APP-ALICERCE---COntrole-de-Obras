import { useAlerts } from '@/contexts/AlertsContext'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function AlertsDropdown({ onClose }) {
  const { alerts } = useAlerts()
  const navigate = useNavigate()

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-10 w-80 bg-white rounded-xl border border-brand-border shadow-lg z-20 py-2 max-h-96 overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between px-4 py-2 border-b border-brand-border">
          <span className="text-sm font-medium text-brand-dark">Alertas</span>
          <button onClick={onClose}><X size={14} className="text-brand-muted" /></button>
        </div>

        {alerts.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-brand-muted">
            Nenhum alerta no momento
          </div>
        ) : alerts.map(alert => (
          <button
            key={alert.id}
            onClick={() => { navigate(alert.link); onClose() }}
            className="w-full text-left px-4 py-3 hover:bg-brand-bg transition-colors flex items-start gap-3 border-b border-brand-border/50 last:border-0"
          >
            <div className={cn(
              "mt-0.5 p-1 rounded-full flex-shrink-0",
              alert.tipo === 'erro'  ? "bg-red-100 text-status-red" :
              alert.tipo === 'aviso' ? "bg-amber-100 text-amber-600" :
              "bg-blue-100 text-blue-600"
            )}>
              <AlertTriangle size={12} />
            </div>
            <div>
              <div className="text-xs font-medium text-brand-dark">{alert.titulo}</div>
              <div className="text-xs text-brand-muted mt-0.5 line-clamp-2">{alert.mensagem}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}
