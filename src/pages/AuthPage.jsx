import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function AuthPage() {
  const { signInWithEmail, signInWithGoogle, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode]     = useState('login') // 'login' | 'register'
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm]     = useState({ nome: '', email: '', password: '' })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'login') {
      const { error } = await signInWithEmail(form.email, form.password)
      if (error) setError('Email ou senha incorretos.')
      else navigate('/obras')
    } else {
      if (!form.nome.trim()) { setError('Informe seu nome.'); setLoading(false); return }
      const { error } = await signUp(form.email, form.password, form.nome)
      if (error) setError(error.message === 'User already registered' ? 'Este email já está cadastrado.' : 'Erro ao criar conta.')
      else { setError(''); setMode('login'); alert('Conta criada! Verifique seu email para confirmar.') }
    }
    setLoading(false)
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    await signInWithGoogle()
    setGoogleLoading(false)
  }

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-dark to-brand-accent flex items-center justify-center">
              <span className="font-display font-bold text-white text-xl">A</span>
            </div>
            <div className="text-left">
              <div className="font-display font-bold text-2xl text-brand-dark">Alicerce</div>
              <div className="text-xs text-brand-muted">Controle de Obras</div>
            </div>
          </div>
          <p className="text-brand-muted text-sm">A base sólida da sua gestão de obras.</p>
        </div>

        {/* Card */}
        <div className="card-base">
          <div className="gradient-bar" />
          <div className="p-6">
            {/* Tabs */}
            <div className="flex bg-brand-bg rounded-xl p-1 mb-6">
              {['login','register'].map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError('') }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    mode === m ? 'bg-white text-brand-dark shadow-sm' : 'text-brand-muted'
                  }`}
                >
                  {m === 'login' ? 'Entrar' : 'Criar conta'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === 'register' && (
                <Input
                  label="Nome completo"
                  type="text"
                  placeholder="Seu nome"
                  value={form.nome}
                  onChange={e => set('nome', e.target.value)}
                  required
                />
              )}
              <Input
                label="Email"
                type="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                required
              />
              <Input
                label="Senha"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                required
                minLength={6}
                error={error}
              />

              <Button type="submit" loading={loading} className="w-full mt-2">
                {mode === 'login' ? 'Entrar' : 'Criar conta'}
              </Button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-brand-border" />
              <span className="text-xs text-brand-muted">ou</span>
              <div className="flex-1 h-px bg-brand-border" />
            </div>

            {/* Google */}
            <Button
              variant="secondary"
              className="w-full"
              loading={googleLoading}
              onClick={handleGoogle}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar com Google
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-brand-muted mt-4">
          Alicerce © {new Date().getFullYear()} · Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
