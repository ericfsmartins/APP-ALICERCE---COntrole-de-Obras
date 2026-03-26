import { cn } from '@/lib/utils'

export default function Badge({ children, className, variant = 'default' }) {
  const variants = {
    default: 'bg-slate-100 text-slate-600',
    green:   'bg-green-100 text-green-700',
    red:     'bg-red-100 text-red-700',
    amber:   'bg-amber-100 text-amber-700',
    blue:    'bg-blue-100 text-blue-700',
    gold:    'bg-[#C87941]/10 text-[#C87941]',
    A:       'bg-red-100 text-red-700',
    B:       'bg-amber-100 text-amber-700',
    C:       'bg-blue-100 text-blue-700',
  }
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
      variants[variant] || variants.default,
      className
    )}>
      {children}
    </span>
  )
}
