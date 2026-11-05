// « Envoyer un diagnostic » (1.8.14), ouvert par le menu de la roue.
//
// Brice, 05/11 : le membre doit pouvoir remonter les infos de SA machine pour
// qu'on règle ce qu'on ne reproduit pas chez nous (le fantôme des images chez
// Franky, le PDF vers ChatGPT chez Flow). Rassemblé à l'ouverture de l'écran
// (le geste), jamais en tâche de fond. Un résumé en quelques lignes, puis le
// détail dépliable : exactement ce qui part. « Envoyer à l'équipe » passe par
// le journal (connecté) ; « Copier » sert à qui n'est pas connecté ou préfère
// l'envoyer lui-même sur Telegram.
import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Stethoscope, Loader2, Send, Copy, ShieldCheck, Monitor } from 'lucide-react'
import { t, getLangue, locale, type CleI18n } from '@/lib/i18n'
import { toast } from '@/lib/toast'
import { PROVIDERS } from '@/lib/analysis-providers'
import { collecterDiagnostic, envoyerDiagnostic } from '@/lib/diagnostic'
import type { Diagnostic, TraceEnvoi } from '@/lib/diagnostic-pur'
import type { AnalysisProvider } from '@/types/academic'

type Etat = 'pret' | 'envoi' | 'envoye' | 'cadence' | 'non-connecte' | 'erreur'

interface Ligne { label: string; valeur: string; alerte?: boolean }

const quand = (ms: number) => new Date(ms).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const THEMES: Record<Diagnostic['carnet']['theme'], CleI18n> = { clair: 'theme.clair', sombre: 'theme.sombre', systeme: 'theme.systeme' }
const PAGES: Record<TraceEnvoi['page'], CleI18n> = { nouvelle: 'diagnostic.pageNouvelle', conversation: 'diagnostic.pageConversation', autre: 'diagnostic.pageAutre' }

function issueEnvoi(e: TraceEnvoi): string {
  if (e.fichiers.pdf + e.fichiers.autres === 0) return t('diagnostic.sansFichier')
  if (e.pdfUploaded) return t('diagnostic.pdfVu')
  if (e.imageOnly) return t('diagnostic.pdfImages')
  if (e.pdfNonVu) return t('diagnostic.pdfNonVu')
  return t('diagnostic.pdfEchec')
}

/** Le résumé lisible, ligne par ligne. Le même texte part en tête de « Copier ». */
function lignesResume(d: Diagnostic): Ligne[] {
  const n = d.navigateur
  const marque = n.marques.find(m => !/chromium/i.test(m.marque)) ?? n.marques[0]
  const navigateur = [
    marque ? `${marque.marque} ${marque.version}`.trim() : (n.userAgent ?? '?').slice(0, 80),
    n.brave && !/brave/i.test(marque?.marque ?? '') ? 'Brave' : null,
    [n.plateforme, n.versionPlateforme].filter(Boolean).join(' ') || null,
  ].filter(Boolean).join(', ')
  const gpu = d.gpu.rendu ?? d.gpu.vendeur ?? t('diagnostic.gpuAbsente')
  const zoom = d.ecran.zoomEstime !== null ? `${Math.round(d.ecran.zoomEstime * 100)} %` : t('diagnostic.zoomInconnu')
  const erreurs = d.erreurs
  const derniere = erreurs.length > 0 ? erreurs[erreurs.length - 1] : null
  const e = d.dernierEnvoiIA
  const sombre = d.carnet.theme === 'systeme' ? ` (${t(d.carnet.sombre ? 'theme.sombre' : 'theme.clair').toLowerCase()})` : ''
  return [
    { label: t('diagnostic.carnet'), valeur: `${d.carnet.version}, ${d.carnet.langue.toUpperCase()}, ${t(THEMES[d.carnet.theme])}${sombre}` },
    { label: t('diagnostic.navigateur'), valeur: navigateur },
    { label: t('diagnostic.gpu'), valeur: d.gpu.renduLogiciel ? `${gpu} (${t('diagnostic.renduLogiciel')})` : gpu, alerte: d.gpu.renduLogiciel },
    {
      label: t('diagnostic.ecran'),
      valeur: t('diagnostic.ecranValeur', { zoom, dpr: d.ecran.dpr ?? '?', l: d.ecran.panneau?.l ?? '?', h: d.ecran.panneau?.h ?? '?' }),
    },
    { label: t('diagnostic.secours'), valeur: t(d.carnet.reglages.affichageSecours ? 'diagnostic.active' : 'diagnostic.desactive') },
    { label: t('diagnostic.compte'), valeur: d.compte.connecte ? (d.compte.email ?? '?') : t('diagnostic.nonConnecte') },
    {
      label: t('diagnostic.erreurs'),
      valeur: !derniere ? t('diagnostic.erreursAucune')
        : erreurs.length === 1 ? t('diagnostic.erreurs1', { quand: quand(derniere.le) })
          : t('diagnostic.erreursN', { n: erreurs.length, quand: quand(derniere.le) }),
    },
    {
      label: t('diagnostic.envoiIA'),
      valeur: !e ? t('diagnostic.envoiAucun')
        : [PROVIDERS[e.fournisseur as AnalysisProvider]?.label ?? e.fournisseur, t(PAGES[e.page]), issueEnvoi(e), t('diagnostic.le', { quand: quand(e.le) })].join(', '),
      alerte: !!e && e.fichiers.pdf + e.fichiers.autres > 0 && !e.pdfUploaded,
    },
  ]
}

function texteACopier(d: Diagnostic): string {
  const sep = getLangue() === 'fr' ? ' : ' : ': '
  return [t('diagnostic.titreCopie'), ...lignesResume(d).map(l => `${l.label}${sep}${l.valeur}`), '', JSON.stringify(d)].join('\n')
}

interface DiagnosticViewProps {
  onBack: () => void
  onOpenSettings: () => void
  onOpenAccount: () => void
}

function DiagnosticView({ onBack, onOpenSettings, onOpenAccount }: DiagnosticViewProps) {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [etat, setEtat] = useState<Etat>('pret')
  const issueRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivant = true
    collecterDiagnostic()
      .then(d => { if (vivant) setDiagnostic(d) })
      .catch(err => console.warn('[diagnostic] collecte', err))
    return () => { vivant = false }
  }, [])

  // À 360 px, la réponse de l'envoi tombe sous le bas du panneau : on la montre.
  useEffect(() => {
    if (etat !== 'pret' && etat !== 'envoi') issueRef.current?.scrollIntoView({ block: 'nearest' })
  }, [etat])

  const envoyer = async () => {
    if (!diagnostic || etat === 'envoi') return
    setEtat('envoi')
    const r = await envoyerDiagnostic(diagnostic)
    setEtat(r.statut === 'envoye' ? 'envoye' : r.statut)
  }

  const copier = async () => {
    if (!diagnostic) return
    try {
      await navigator.clipboard.writeText(texteACopier(diagnostic))
      toast.success(t('diagnostic.copie'))
    } catch {
      toast.error(t('mentorat.copieImpossible'))
    }
  }

  const connecte = !!diagnostic?.compte.connecte && etat !== 'non-connecte'
  const bloque = !connecte || etat === 'envoi' || etat === 'envoye' || etat === 'cadence'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          aria-label={t('commun.retour')}
          title={t('commun.retour')}
        >
          <ArrowLeft size={16} />
        </button>
        <Stethoscope size={16} className="text-blue-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-foreground">{t('diagnostic.titre')}</h2>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{t('diagnostic.intro')}</p>
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <ShieldCheck size={13} className="flex-shrink-0" />
        {t('diagnostic.rienDesNotes')}
      </p>

      {!diagnostic ? (
        <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          {t('diagnostic.collecte')}
        </div>
      ) : (
        <>
          <dl className="rounded-lg border border-border bg-muted/40 divide-y divide-border/60 text-xs" data-diagnostic-resume="">
            {lignesResume(diagnostic).map(l => (
              <div key={l.label} className="flex gap-3 px-3 py-1.5">
                <dt className="w-[6.5rem] flex-shrink-0 text-muted-foreground">{l.label}</dt>
                <dd className={`min-w-0 break-words ${l.alerte ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-foreground'}`}>{l.valeur}</dd>
              </div>
            ))}
          </dl>

          <details className="text-xs">
            <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">{t('diagnostic.detail')}</summary>
            <pre
              className="mt-2 p-2 rounded-md border border-border bg-muted/50 text-[10px] leading-snug text-foreground/80 overflow-auto max-h-72 whitespace-pre-wrap break-all"
              data-diagnostic-detail=""
            >
              {JSON.stringify(diagnostic, null, 2)}
            </pre>
          </details>

          {!diagnostic.carnet.reglages.affichageSecours && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 text-xs text-foreground/80">
              <Monitor size={13} className="mt-0.5 flex-shrink-0 text-blue-500" />
              <div>
                <p>{t('diagnostic.conseilSecours')}</p>
                <button onClick={onOpenSettings} className="mt-1 text-blue-600 dark:text-blue-400 hover:underline">
                  {t('diagnostic.ouvrirParametres')}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => void envoyer()}
              disabled={bloque}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {etat === 'envoi' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {etat === 'envoi' ? t('diagnostic.envoi') : t('diagnostic.envoyer')}
            </button>
            <button
              onClick={() => void copier()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
            >
              <Copy size={13} />
              {t('diagnostic.copier')}
            </button>
          </div>

          <div ref={issueRef} className="empty:hidden">
          {!connecte && (
            <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300" role="status">
              <p>{t('diagnostic.nonConnecteAide')}</p>
              <button onClick={onOpenAccount} className="mt-1 font-medium underline-offset-2 hover:underline">
                {t('diagnostic.seConnecter')}
              </button>
            </div>
          )}
          {connecte && etat === 'envoye' && (
            <p className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-800 dark:text-emerald-300" role="status">
              {t('diagnostic.envoye')}
            </p>
          )}
          {connecte && etat === 'cadence' && (
            <p className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300" role="status">
              {t('diagnostic.cadence')}
            </p>
          )}
          {connecte && etat === 'erreur' && (
            <p className="p-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300" role="alert">
              {t('diagnostic.echec')}
            </p>
          )}
          </div>
        </>
      )}
    </div>
  )
}

export default DiagnosticView
