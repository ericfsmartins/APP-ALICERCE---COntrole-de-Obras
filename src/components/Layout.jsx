import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Layers, Package, Receipt, Zap, BookOpen,
  FileText, Store, BarChart3, TrendingUp, Settings, Building2,
  Bell, ChevronDown, LogOut, User, Menu, X, Target, Wallet
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useObra } from '@/contexts/ObraContext'
import { useAlerts } from '@/contexts/AlertsContext'
import { cn } from '@/lib/utils'
import AlertsDropdown from './AlertsDropdown'
import ObraSeletor from './ObraSeletor'

const NAV_ITEMS = [
  { to: '/obras',         icon: Building2,       label: 'Minhas Obras'  },
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard'     },
  { to: '/momentos',      icon: Target,          label: 'Momentos'      },
  { to: '/fases',         icon: Layers,          label: 'Fases'         },
  { to: '/insumos',       icon: Package,         label: 'Insumos'       },
  { to: '/despesas',      icon: Receipt,         label: 'Despesas'      },
  { to: '/financeiro',    icon: Wallet,          label: 'Financeiro'    },
  { to: '/lancamento',    icon: Zap,             label: 'Lançamento'    },
  { to: '/diario',        icon: BookOpen,        label: 'Diário'        },
  { to: '/documentos',    icon: FileText,        label: 'Documentos'    },
  { to: '/fornecedores',  icon: Store,           label: 'Fornecedores'  },
  { to: '/orcamentos',    icon: BarChart3,        label: 'Orçamentos'    },
  { to: '/relatorios',    icon: TrendingUp,       label: 'Relatórios'    },
  { to: '/configuracoes', icon: Settings,         label: 'Configurações' },
]

const MOBILE_NAV = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/momentos',   icon: Target,          label: 'Momentos'   },
  { to: '/lancamento', icon: Zap,             label: 'Lançar'     },
  { to: '/fases',      icon: Layers,          label: 'Fases'      },
  { to: '/configuracoes', icon: Settings,     label: 'Config'     },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { obraAtiva } = useObra()
  const { count } = useAlerts()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [alertsOpen, setAlertsOpen]   = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navigate = useNavigate()

  const roleLabel = {
    admin: 'Admin', engenheiro: 'Engenheiro', mestre: 'Mestre de Obra',
    cliente: 'Cliente', fornecedor: 'Fornecedor'
  }

  return (
    <div className="flex h-screen bg-brand-bg overflow-hidden">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-60 z-40 flex flex-col bg-brand-dark text-white transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        "lg:relative lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-brand-accent flex items-center justify-center font-display font-bold text-white text-sm">A</div>
          <div>
            <div className="font-display font-bold text-white text-lg leading-none">Alicerce</div>
            <div className="text-white/50 text-[10px]">Controle de Obras</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={18} className="text-white/50" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-5 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-brand-accent/20 text-brand-accent font-medium border-r-2 border-brand-accent"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={() => { signOut(); navigate('/auth') }}
            className="flex items-center gap-2 text-white/50 hover:text-white text-sm w-full"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-white border-b border-brand-border flex items-center px-4 gap-3 z-20 flex-shrink-0">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} className="text-brand-dark" />
          </button>

          {/* Seletor de obra */}
          <ObraSeletor />

          <div className="flex-1" />

          {/* Alertas */}
          <div className="relative">
            <button
              onClick={() => setAlertsOpen(!alertsOpen)}
              className="relative p-2 rounded-lg hover:bg-brand-bg transition-colors"
            >
              <Bell size={18} className="text-brand-dark" />
              {count > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-status-red rounded-full text-white text-[9px] flex items-center justify-center font-bold">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>
            {alertsOpen && <AlertsDropdown onClose={() => setAlertsOpen(false)} />}
          </div>

          {/* Avatar */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-brand-bg transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-dark to-brand-accent flex items-center justify-center text-white text-xs font-bold">
                {profile?.nome?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-xs font-medium text-brand-dark leading-none">{profile?.nome || 'Usuário'}</div>
                <div className="text-[10px] text-brand-muted">{roleLabel[profile?.role] || ''}</div>
              </div>
              <ChevronDown size={12} className="text-brand-muted hidden md:block" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-10 w-44 bg-white rounded-xl border border-brand-border shadow-lg z-50 py-1">
                <button
                  onClick={() => { navigate('/configuracoes'); setUserMenuOpen(false) }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-brand-dark hover:bg-brand-bg w-full"
                >
                  <User size={14} /> Perfil
                </button>
                <button
                  onClick={() => { signOut(); navigate('/auth') }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-status-red hover:bg-red-50 w-full"
                >
                  <LogOut size={14} /> Sair
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Conteúdo */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-7xl mx-auto p-4 md:p-6 pb-24 lg:pb-6 animate-fadeIn">
            <Outlet />
          </div>
        </main>

        {/* Bottom nav mobile */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-brand-border z-20 flex">
          {MOBILE_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
                isActive ? "text-brand-accent" : "text-brand-muted"
              )}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
