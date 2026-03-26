import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

const variants = {
  primary:   "bg-brand-accent text-white hover:bg-[#b86d38] active:scale-[0.98]",
  secondary: "bg-brand-bg border border-brand-border text-brand-dark hover:bg-white",
  ghost:     "text-brand-dark hover:bg-brand-bg",
  danger:    "bg-status-red text-white hover:bg-red-600",
  outline:   "border border-brand-accent text-brand-accent hover:bg-brand-accent hover:text-white",
}
const sizes = {
  sm:  "h-8 px-3 text-xs gap-1.5",
  md:  "h-9 px-4 text-sm gap-2",
  lg:  "h-11 px-6 text-base gap-2",
  icon:"h-9 w-9 p-0",
}

export default function Button({
  children, variant = 'primary', size = 'md',
  loading, disabled, className, ...props
}) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        className
      )}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}
