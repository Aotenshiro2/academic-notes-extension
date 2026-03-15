import React, { useState, useEffect } from 'react'
import { ArrowLeft, LogOut, Loader2, RefreshCw, ExternalLink, Eye, EyeOff, ChevronLeft } from 'lucide-react'
import type { Settings as SettingsType } from '@/types/academic'
import { getUser, signInWithGoogle, signOut, signInWithEmail, signUpWithEmail, sendPasswordResetEmail } from '@/lib/auth'
import type { User } from '@/lib/supabase'

interface AccountViewProps {
  settings: SettingsType
  onSettingsChange: (s: Partial<SettingsType>) => void
  onSyncAll: () => Promise<{ synced: number; failed: number; errors: Array<{ title: string; error: string }> }>
  onBack: () => void
}

type AuthMode = 'signin' | 'signup'
type AuthView = 'main' | 'forgot'

export default function AccountView({ settings, onSettingsChange, onSyncAll, onBack }: AccountViewProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number; errors: Array<{ title: string; error: string }> } | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  // Auth state
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [authView, setAuthView] = useState<AuthView>('main')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [newsletter, setNewsletter] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)

  useEffect(() => {
    getUser()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
      .finally(() => setLoadingUser(false))
  }, [])

  const handleGoogleLogin = async () => {
    setAuthLoading(true)
    const { session, error } = await signInWithGoogle()
    if (session) {
      const user = await getUser()
      setCurrentUser(user)
    } else if (error) {
      console.error('[Auth] login error:', error)
    }
    setAuthLoading(false)
  }

  const handleEmailSignIn = async () => {
    setAuthLoading(true)
    setEmailError(null)
    const { session, error } = await signInWithEmail(email, password)
    if (session) {
      setCurrentUser(await getUser())
    } else {
      setEmailError(error)
    }
    setAuthLoading(false)
  }

  const handleEmailSignUp = async () => {
    setAuthLoading(true)
    setEmailError(null)
    const { session, error } = await signUpWithEmail(email, password, { name, newsletter })
    if (error) {
      setEmailError(error)
    } else {
      if (newsletter) {
        fetch('https://journal-d-etude-beta.vercel.app/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name }),
        }).catch(() => {})
      }
      if (session) {
        setCurrentUser(await getUser())
      } else {
        setEmailSuccess('Vérifie tes emails pour confirmer ton compte.')
      }
    }
    setAuthLoading(false)
  }

  const handleForgot = async () => {
    setAuthLoading(true)
    setEmailError(null)
    const { error } = await sendPasswordResetEmail(email)
    if (error) {
      setEmailError(error)
    } else {
      setEmailSuccess('Email de reset envoyé — vérifie ta boite mail.')
    }
    setAuthLoading(false)
  }

  const handleLogout = async () => {
    setAuthLoading(true)
    await signOut()
    setCurrentUser(null)
    setAuthLoading(false)
  }

  const handleSyncAll = async () => {
    setSyncing(true)
    setSyncResult(null)
    const result = await onSyncAll()
    setSyncResult(result)
    setSyncing(false)
  }

  const handleSyncToggle = (enabled: boolean) => {
    onSettingsChange({
      journalSync: { ...settings.journalSync, syncEnabled: enabled }
    })
  }

  const initials = currentUser?.user_metadata?.full_name
    ? (currentUser.user_metadata.full_name as string).split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : currentUser?.email?.charAt(0).toUpperCase() ?? '?'

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center space-x-3 pb-3 border-b border-border">
        <button
          onClick={onBack}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          title="Retour"
          aria-label="Retour"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold text-foreground">Compte AOKnowledge</h2>
      </div>

      {currentUser ? (
        <>
          {/* Profil utilisateur */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {currentUser.user_metadata?.full_name ?? currentUser.email ?? 'Utilisateur'}
                </p>
                <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                border border-border text-sm text-muted-foreground
                hover:text-foreground hover:bg-muted transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authLoading ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
              Se déconnecter
            </button>
          </div>

          {/* Journal d'Études sync */}
          <div className="p-4 border rounded-lg space-y-4">
            <h3 className="text-sm font-medium text-foreground">Journal d'Études</h3>

            {/* Sync toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Sync automatique</p>
                <p className="text-xs text-muted-foreground">Chaque nouvelle note est envoyée au journal</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.journalSync.syncEnabled}
                  onChange={(e) => handleSyncToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                {settings.journalSync.pendingNotes.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                    {settings.journalSync.pendingNotes.length} en attente
                  </span>
                )}
                {settings.journalSync.lastSync > 0 && (
                  <span>
                    {new Date(settings.journalSync.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <button
                onClick={handleSyncAll}
                disabled={syncing || !settings.journalSync.syncEnabled}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Synchroniser tout
              </button>
            </div>
            {syncResult && (
              <div className="mt-1 space-y-1">
                <p className={`text-xs ${syncResult.failed > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                  {syncResult.synced > 0 && `${syncResult.synced} synquée(s)`}
                  {syncResult.failed > 0 && ` · ${syncResult.failed} échec(s)`}
                  {syncResult.synced === 0 && syncResult.failed === 0 && 'Tout est déjà synqué'}
                </p>
                {syncResult.errors.length > 0 && (
                  <ul className="space-y-0.5">
                    {syncResult.errors.slice(0, 5).map((e, i) => (
                      <li key={i} className="text-xs text-orange-400/80 truncate">
                        ✗ {e.title} — {e.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Lien vers le journal */}
          <button
            onClick={() => chrome.tabs.create({ url: 'https://journal-d-etude-beta.vercel.app' })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
              border border-border text-sm text-muted-foreground
              hover:text-foreground hover:bg-muted transition-colors"
          >
            <ExternalLink size={14} />
            Ouvrir Journal d'Études
          </button>
        </>
      ) : (
        <>
          {authView === 'forgot' ? (
            /* ── Vue reset mot de passe ── */
            <div className="space-y-3 px-1">
              <button
                onClick={() => { setAuthView('main'); setEmailError(null); setEmailSuccess(null) }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft size={14} /> Retour à la connexion
              </button>
              <p className="text-sm font-medium text-foreground">Mot de passe oublié</p>
              <p className="text-xs text-muted-foreground">
                Un lien de réinitialisation sera envoyé à ton adresse email.
              </p>
              <input
                type="email"
                placeholder="Ton adresse email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleForgot()}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              {emailError && <p className="text-xs text-red-400">{emailError}</p>}
              {emailSuccess && <p className="text-xs text-green-400">{emailSuccess}</p>}
              <button
                onClick={handleForgot}
                disabled={authLoading || !email}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Envoyer le lien
              </button>
            </div>
          ) : (
            /* ── Écran principal (Google + onglets) ── */
            <div className="space-y-4 px-1">
              {/* Logo */}
              <div className="flex flex-col items-center text-center pt-2 pb-1">
                <div className="w-12 h-12 rounded-2xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center text-xl mb-2">
                  📚
                </div>
                <p className="text-xs text-muted-foreground">
                  Synchronise tes notes vers Journal d'Études
                </p>
              </div>

              {/* Google */}
              <button
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl
                  bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                  text-sm font-medium text-gray-800 dark:text-gray-200
                  hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authLoading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                )}
                Continuer avec Google
              </button>

              {/* Séparateur */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground/50">ou</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Onglets */}
              <div className="flex rounded-lg overflow-hidden border border-border">
                <button
                  onClick={() => { setAuthMode('signin'); setEmailError(null); setEmailSuccess(null) }}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    authMode === 'signin'
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Connexion
                </button>
                <button
                  onClick={() => { setAuthMode('signup'); setEmailError(null); setEmailSuccess(null) }}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    authMode === 'signup'
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Inscription
                </button>
              </div>

              {/* Formulaire connexion */}
              {authMode === 'signin' && (
                <div className="space-y-2.5">
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mot de passe"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleEmailSignIn()}
                      className="w-full px-3 py-2 pr-9 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {emailError && <p className="text-xs text-red-400">{emailError}</p>}
                  {emailSuccess && <p className="text-xs text-green-400">{emailSuccess}</p>}
                  <button
                    onClick={handleEmailSignIn}
                    disabled={authLoading || !email || !password}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl btn-primary text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {authLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                    Se connecter
                  </button>
                  <p className="text-right">
                    <button
                      onClick={() => { setAuthView('forgot'); setEmailError(null); setEmailSuccess(null) }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Mot de passe oublié ?
                    </button>
                  </p>
                </div>
              )}

              {/* Formulaire inscription */}
              {authMode === 'signup' && (
                <div className="space-y-2.5">
                  <input
                    type="text"
                    placeholder="Prénom ou pseudo"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mot de passe"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-9 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newsletter}
                      onChange={e => setNewsletter(e.target.checked)}
                      className="mt-0.5 rounded border-border accent-blue-500"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      Recevoir les nouveautés AOKnowledge
                    </span>
                  </label>
                  {emailError && <p className="text-xs text-red-400">{emailError}</p>}
                  {emailSuccess && <p className="text-xs text-green-400">{emailSuccess}</p>}
                  <button
                    onClick={handleEmailSignUp}
                    disabled={authLoading || !email || !password || !name}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl btn-primary text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {authLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                    Créer mon compte
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
