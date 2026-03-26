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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cn(
        "relative bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fadeIn",
        sizes[size], className
      )}>
        <div className="gradient-bar" />
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border flex-shrink-0">
            <h2 className="font-display font-bold text-lg text-brand-dark">{title}</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-brand-bg text-brand-muted">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </div>
      </div>
    </div>
  )
}
