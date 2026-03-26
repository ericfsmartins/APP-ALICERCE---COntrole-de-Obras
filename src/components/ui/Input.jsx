import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

const Input = forwardRef(function Input({ label, error, className, ...props }, ref) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-brand-dark">{label}</label>}
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-xl border border-brand-border bg-white px-3 text-sm text-brand-dark placeholder:text-brand-muted",
          "focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-status-red focus:ring-red-200",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-status-red">{error}</p>}
    </div>
  )
})

export default Input
