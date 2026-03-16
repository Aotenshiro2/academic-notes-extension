import React, { useState, useEffect } from 'react'
import { ArrowLeft, LogOut, Loader2, RefreshCw, ExternalLink, Eye, EyeOff, ChevronLeft, ShieldCheck, Download } from 'lucide-react'
import type { Settings as SettingsType, AcademicNote } from '@/types/academic'
import type { VerifySyncResult } from '@/lib/sync'
import { getUser, signInWithGoogle, signOut, signInWithEmail, signUpWithEmail, sendPasswordResetEmail } from '@/lib/auth'
import type { User } from '@/lib/supabase'

interface AccountViewProps {
  settings: SettingsType
  onSettingsChange: (s: Partial<SettingsType>) => void
  onSyncAll: () => Promise<{ synced: number; failed: number; errors: Array<{ title: string; error: string }> }>
  onVerifySync: () => Promise<VerifySyncResult>
  onResyncMissing: (missingNotes: VerifySyncResult['missingNotes']) => Promise<{ synced: number; failed: number; errors: Array<{ title: string; error: string }> }>
  onForceResyncAll: () => Promise<{ synced: number; failed: number; errors: Array<{ title: string; error: string }> }>
  onPullFromJournal: () => Promise<{ imported: number; skipped: number; error?: string }>
  onBack: () => void
  notes: AcademicNote[]
}

type AuthMode = 'signin' | 'signup'
type AuthView = 'main' | 'forgot'

export default function AccountView({ settings, onSettingsChange, onSyncAll, onVerifySync, onResyncMissing, onForceResyncAll, onPullFromJournal, onBack, notes }: AccountViewProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pullResult, setPullResult] = useState<{ imported: number; skipped: number; error?: string } | null>(null)
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number; errors: Array<{ title: string; error: string }> } | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifySyncResult | null>(null)
  const [verifyTime, setVerifyTime] = useState<number | null>(null)
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

  const handleVerifySync = async () => {
    setVerifying(true)
    setVerifyResult(null)
    setSyncResult(null)
    const result = await onVerifySync()
    setVerifyResult(result)
    setVerifyTime(Date.now())
    setVerifying(false)
  }

  const handleResyncMissing = async () => {
    if (!verifyResult?.missingNotes.length) return
    setSyncing(true)
    const result = await onResyncMissing(verifyResult.missingNotes)
    setSyncResult(result)
    setVerifyResult(prev => prev ? {
      ...prev,
      missing: result.failed,
      confirmed: prev.confirmed + result.synced,
      pending: prev.pending - result.synced,
      missingNotes: [],
    } : null)
    setSyncing(false)
  }

  const handleForceResyncAll = async () => {
    if (!confirm('Cela va re-synquer TOUTES les notes vers le journal (même celles déjà synquées). Continuer ?')) return
    setSyncing(true)
    setSyncResult(null)
    const result = await onForceResyncAll()
    setSyncResult(result)
    setSyncing(false)
  }

  const handlePullFromJournal = async () => {
    if (!confirm('Récupérer toutes les notes depuis le journal ? Les notes déjà présentes localement seront ignorées.')) return
    setPulling(true)
    setPullResult(null)
    const result = await onPullFromJournal()
    setPullResult(result)
    setPulling(false)
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

            {/* Comptage total local (fiable sans appel réseau) */}
            <p className="text-xs text-muted-foreground">
              {notes.length} note{notes.length > 1 ? 's' : ''} dans l'extension
            </p>

            {/* Boutons sync */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleVerifySync}
                disabled={verifying || syncing}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Comparer les notes locales avec le journal pour connaître l'état réel"
              >
                {verifying ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                Vérifier l'état
              </button>
              <button
                onClick={handleSyncAll}
                disabled={syncing || verifying || !settings.journalSync.syncEnabled}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Sync tout
              </button>
              <button
                onClick={handleForceResyncAll}
                disabled={syncing || verifying || !settings.journalSync.syncEnabled}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-orange-500/40 text-xs text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Re-synque toutes les notes, même celles déjà synquées. Utile pour récupérer les notes manquantes."
              >
                {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Forcer re-sync
              </button>
            </div>

            {/* Import depuis le journal */}
            <div className="pt-2 border-t border-border">
              <button
                onClick={handlePullFromJournal}
                disabled={pulling || syncing || verifying}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-purple-500/40 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Récupère les notes depuis le journal vers l'extension (utile après réinstallation)"
              >
                {pulling ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Importer depuis le journal
              </button>
              {pullResult && (
                <p className={`mt-1.5 text-xs ${pullResult.error ? 'text-red-400' : 'text-green-400'}`}>
                  {pullResult.error
                    ? `Erreur : ${pullResult.error}`
                    : `${pullResult.imported} importée(s)${pullResult.skipped > 0 ? ` · ${pullResult.skipped} déjà présente(s)` : ''}`
                  }
                </p>
              )}
            </div>

            {/* Résultat vérification */}
            {(verifyResult || verifying) && (
              <div className="space-y-1 p-2.5 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-foreground">État sync vérifié</p>
                  {verifyTime && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(verifyTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                {verifyResult?.verifyError ? (
                  <p className="text-xs text-red-400">{verifyResult.verifyError}</p>
                ) : verifyResult ? (
                  <div className="space-y-1">
                    <div className="grid grid-cols-[1rem_auto_1fr] items-baseline gap-x-1.5 gap-y-0.5 text-xs">
                      <span className="text-green-500 font-mono text-center">✓</span>
                      <span className="text-green-500 font-semibold tabular-nums">{verifyResult.confirmed}</span>
                      <span className="text-muted-foreground">confirmée{verifyResult.confirmed > 1 ? 's' : ''} — dans l'extension ET le journal</span>

                      <span className="text-blue-400 font-mono text-center">○</span>
                      <span className="text-blue-400 font-semibold tabular-nums">{verifyResult.pending}</span>
                      <span className="text-muted-foreground">en attente — jamais envoyée{verifyResult.pending > 1 ? 's' : ''} au journal</span>

                      {verifyResult.missing > 0 && <>
                        <span className="text-orange-400 font-mono text-center">✗</span>
                        <span className="text-orange-400 font-semibold tabular-nums">{verifyResult.missing}</span>
                        <span className="text-muted-foreground">manquante{verifyResult.missing > 1 ? 's' : ''} — étaient synquées, disparues du journal</span>
                      </>}

                      {verifyResult.locallyExcluded > 0 && <>
                        <span className="text-orange-500 font-mono text-center">⊗</span>
                        <span className="text-orange-500 font-semibold tabular-nums">{verifyResult.locallyExcluded}</span>
                        <span className="text-muted-foreground">exclue{verifyResult.locallyExcluded > 1 ? 's' : ''} manuellement — ne seront pas synquées</span>
                      </>}

                      {verifyResult.journalExcluded > 0 && <>
                        <span className="text-muted-foreground font-mono text-center">−</span>
                        <span className="text-muted-foreground font-semibold tabular-nums">{verifyResult.journalExcluded}</span>
                        <span className="text-muted-foreground">supprimée{verifyResult.journalExcluded > 1 ? 's' : ''} du journal — exclues automatiquement</span>
                      </>}

                      {verifyResult.journalOrphans > 0 && <>
                        <span className="text-yellow-500 font-mono text-center">⚠</span>
                        <span className="text-yellow-500 font-semibold tabular-nums">{verifyResult.journalOrphans}</span>
                        <span className="text-muted-foreground">seule{verifyResult.journalOrphans > 1 ? 's' : ''} dans le journal — supprimée{verifyResult.journalOrphans > 1 ? 's' : ''} de l'extension</span>
                      </>}
                    </div>

                    {verifyResult.missingNotes.length > 0 && (
                      <button
                        onClick={handleResyncMissing}
                        disabled={syncing}
                        className="w-full mt-1.5 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Re-synquer les {verifyResult.missingNotes.length} manquante{verifyResult.missingNotes.length > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Résultat sync */}
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
          {import.meta.env.PROD ? (
            <div className="relative group w-full">
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                  border border-border text-sm text-muted-foreground/40 cursor-not-allowed
                  bg-muted/30"
              >
                <ExternalLink size={14} />
                Ouvrir Journal d'Études
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded
                bg-popover border border-border text-xs text-muted-foreground whitespace-nowrap
                opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md">
                Bientôt disponible
              </div>
            </div>
          ) : (
            <button
              onClick={() => chrome.tabs.create({ url: 'https://journal-d-etude-beta.vercel.app' })}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                border border-border text-sm text-muted-foreground
                hover:text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink size={14} />
              Ouvrir Journal d'Études
            </button>
          )}
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
