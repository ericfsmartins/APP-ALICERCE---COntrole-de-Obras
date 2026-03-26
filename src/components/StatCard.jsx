import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

const THEMES = {
  gold:  { bar: 'from-[#C87941] to-[#e8a560]', text: 'text-[#C87941]', bg: 'bg-amber-50'  },
  navy:  { bar: 'from-[#1C1F26] to-[#3a3f4d]', text: 'text-[#1C1F26]', bg: 'bg-slate-50'  },
  green: { bar: 'from-[#16a34a] to-[#22C55E]',  text: 'text-green-600', bg: 'bg-green-50'  },
  red:   { bar: 'from-[#dc2626] to-[#EF4444]',  text: 'text-red-600',   bg: 'bg-red-50'    },
  blue:  { bar: 'from-[#2563eb] to-[#60a5fa]',  text: 'text-blue-600',  bg: 'bg-blue-50'   },
}

export default function StatCard({ title, value, subtitle, icon: Icon, color = 'gold', trend, className }) {
  const theme = THEMES[color] || THEMES.gold
  const trendPositive = trend > 0

  return (
    <div className={cn("card-base", className)}>
      <div className={cn("gradient-bar bg-gradient-to-r", theme.bar)} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-brand-muted font-body uppercase tracking-wide">{title}</p>
            <p className={cn("font-display font-bold text-2xl mt-1 leading-none", theme.text)}>{value}</p>
            {subtitle && <p className="text-xs text-brand-muted mt-2">{subtitle}</p>}
          </div>
          {Icon && (
            <div className={cn("p-2.5 rounded-xl flex-shrink-0", theme.bg)}>
              <Icon size={20} className={theme.text} />
            </div>
          )}
        </div>

        {trend != null && (
          <div className={cn(
            "flex items-center gap-1 mt-3 text-xs font-medium",
            trendPositive ? "text-status-red" : "text-status-green"
          )}>
            {trendPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend).toFixed(1)}% vs orçado
          </div>
        )}
      </div>
    </div>
  )
}
