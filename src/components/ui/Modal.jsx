import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'

export default function Modal({ open, onClose, title, children, size = 'md', className }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="flex min-h-full items-start justify-center p-3 py-6 sm:p-6 sm:py-10">
        <div className={cn(
          "relative bg-white rounded-2xl shadow-2xl w-full flex flex-col animate-fadeIn",
          "max-h-[90vh]",
          sizes[size], className
        )} onClick={e => e.stopPropagation()}>
          <div className="gradient-bar flex-shrink-0" />
          {title && (
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-brand-border flex-shrink-0">
              <h2 className="font-display font-bold text-base text-brand-dark">{title}</h2>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brand-bg text-brand-muted">
                <X size={16} />
              </button>
            </div>
          )}
          <div className="overflow-y-auto scrollbar-thin flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
