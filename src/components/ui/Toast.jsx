import { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastContext = createContext({})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback(({ title, description, type = 'success', duration = 4000 }) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, title, description, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const remove = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  const icons = { success: CheckCircle, error: AlertCircle, info: Info }
  const colors = {
    success: 'border-l-status-green text-status-green',
    error:   'border-l-status-red text-status-red',
    info:    'border-l-blue-500 text-blue-500',
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-20 lg:bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map(t => {
          const Icon = icons[t.type] || Info
          return (
            <div key={t.id} className={cn(
              "flex items-start gap-3 bg-white rounded-xl border border-brand-border border-l-4 shadow-lg px-4 py-3 w-80 animate-fadeIn",
              colors[t.type] || colors.info
            )}>
              <Icon size={16} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-brand-dark">{t.title}</p>
                {t.description && <p className="text-xs text-brand-muted mt-0.5">{t.description}</p>}
              </div>
              <button onClick={() => remove(t.id)} className="text-brand-muted hover:text-brand-dark">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
