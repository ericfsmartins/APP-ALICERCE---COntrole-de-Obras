import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ObraProvider } from '@/contexts/ObraContext'
import { AlertsProvider } from '@/contexts/AlertsContext'
import Layout from '@/components/Layout'
import AuthPage from '@/pages/AuthPage'

// Pages
import ObrasPage        from '@/pages/ObrasPage'
import DashboardPage    from '@/pages/DashboardPage'
import MomentosPage     from '@/pages/MomentosPage'
import FasesPage        from '@/pages/FasesPage'
import InsumosPage      from '@/pages/InsumosPage'
import DespesasPage     from '@/pages/DespesasPage'
import LancamentoPage   from '@/pages/LancamentoPage'
import DiarioPage       from '@/pages/DiarioPage'
import DocumentosPage   from '@/pages/DocumentosPage'
import FornecedoresPage from '@/pages/FornecedoresPage'
import OrcamentosPage   from '@/pages/OrcamentosPage'
import RelatoriosPage   from '@/pages/RelatoriosPage'
import ConfiguracoesPage from '@/pages/ConfiguracoesPage'
import FinanceiroPage    from '@/pages/FinanceiroPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin h-8 w-8 rounded-full border-4 border-brand-accent border-t-transparent" /></div>
  if (!user) return <Navigate to="/auth" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <ObraProvider>
            <AlertsProvider>
              <Layout />
            </AlertsProvider>
          </ObraProvider>
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/obras" replace />} />
        <Route path="obras"         element={<ObrasPage />} />
        <Route path="dashboard"     element={<DashboardPage />} />
        <Route path="momentos"      element={<MomentosPage />} />
        <Route path="fases"         element={<FasesPage />} />
        <Route path="insumos"       element={<InsumosPage />} />
        <Route path="despesas"      element={<DespesasPage />} />
        <Route path="financeiro"    element={<FinanceiroPage />} />
        <Route path="lancamento"    element={<LancamentoPage />} />
        <Route path="diario"        element={<DiarioPage />} />
        <Route path="documentos"    element={<DocumentosPage />} />
        <Route path="fornecedores"  element={<FornecedoresPage />} />
        <Route path="orcamentos"    element={<OrcamentosPage />} />
        <Route path="relatorios"    element={<RelatoriosPage />} />
        <Route path="configuracoes" element={<ConfiguracoesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
