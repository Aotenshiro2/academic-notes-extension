// Panel du mode mentorat — v0 (étape 2 du chantier, TODO section 8).
// « Un panel, pas un 4e prompt » (décision Brice 17/07) : le mode a son propre
// espace. Cette v0 affiche le BRIEF COMPRESSÉ calculé par le backend depuis la
// base (étape 1) : la matière du futur plan d'évolution. Pas encore de gating
// d'abonnement (viendra avec Stripe) ni de plan IA (viendra avec la clé
// Anthropic côté Vercel) : phase de dogfooding.
import { toast } from '@/lib/toast'
import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, GraduationCap, RefreshCw, Copy, Loader2, AlertCircle, Sparkles, Unlock, LifeBuoy, User, ArrowUp, FolderTree, Check, Square, CheckSquare } from 'lucide-react'
import { fetchMentoratBrief, fetchLastMentoratPlan, generateMentoratPlan, fetchMentoratAccess, demanderAuMentor, type MentoratBriefData, type MentoratPlanData } from '@/lib/sync'
import {
  obtenirNoteMentorat, lireConversation, enAttenteDeReponse,
  ecrireTourEleve, ecrireReponseMentor, TITRE_NOTE_MENTORAT, apercuDuTour,
  type TourMentorat,
} from '@/lib/note-mentorat'
import storage from '@/lib/storage'
import { getSession } from '@/lib/auth'
import type { NoteFolder, AnnotationLettre } from '@/types/academic'
import { OFFRES, formatPrix } from '@/lib/offres'
import { t, tp, locale, type CleI18n } from '@/lib/i18n'

// Le libellé se calcule au rendu (clé `mentorat.jours`) : la langue peut
// changer pendant que l'écran est ouvert.
const PERIODS = [30, 90, 180]

// D (24/09/2026) : même teinte que la notation (rouge plus sombre que le C),
// couleur par défaut à faire valider par Brice.
const GRADE_CLASS: Record<AnnotationLettre, string> = {
  A: 'bg-green-500/15 text-green-600 dark:text-green-400',
  B: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  C: 'bg-red-500/15 text-red-600 dark:text-red-400',
  D: 'bg-red-800/15 text-red-800 dark:text-red-300',
}

const CAUSE_LABEL: Record<string, CleI18n> = {
  technique: 'mentorat.causeTechnique',
  connaissance: 'mentorat.causeConnaissance',
  emotionnel: 'mentorat.causeEmotionnel',
}

// Le plan sort en markdown léger (## titres, **gras**) : on le rend proprement
// au lieu d'afficher les marqueurs bruts
function renderBold(s: string): React.ReactNode {
  return s.split(/\*\*([^*]+)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-foreground">{part}</strong> : part
  )
}

function PlanText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split('\n').map((line, i) => {
        const ligne = line.trim()
        if (!ligne) return <div key={i} className="h-1.5" />
        if (ligne.startsWith('## ')) {
          return <p key={i} className="text-[11px] font-semibold text-foreground uppercase tracking-wide pt-1.5">{ligne.slice(3)}</p>
        }
        if (ligne.startsWith('# ')) {
          return <p key={i} className="text-[11px] font-semibold text-foreground uppercase tracking-wide pt-1.5">{ligne.slice(2)}</p>
        }
        return <p key={i} className="text-[11px] leading-relaxed text-foreground/80">{renderBold(ligne)}</p>
      })}
    </div>
  )
}

interface MentoratViewProps {
  onBack: () => void
  onOpenAccount: () => void
  onOpenSupport: () => void
  /** Ouvre « Mon forfait » : le seul écran qui vend, avec l'offre annuelle et
   *  l'email pré-rempli. La carte d'upsell d'ici s'y branche au lieu de
   *  refaire un mini-tunnel de paiement dans son coin. */
  onOpenPlans: () => void
}

// Portail d'entrée (décision Brice 28/08) : le mode mentorat est réservé aux
// membres. Pas connecté → invitation à se connecter ; connecté sans droits →
// écran d'upgrade. L'affichage suit /api/mentorat/access, et le serveur
// re-vérifie de toute façon sur chaque route (l'extension ne décide jamais).
type GateState = 'checking' | 'anon' | 'denied' | 'gate-error' | 'ok'

/** Une ligne du cadrage. Définie HORS du corps de MentoratView : un composant
 *  redéfini à chaque rendu est un type neuf à chaque fois, et React remonterait
 *  la liste entière à chaque clic. */
function CaseDossier({ dossier, coche, onToggle, decale }: {
  dossier: NoteFolder
  coche: boolean
  onToggle: (f: NoteFolder) => void
  decale?: boolean
}) {
  return (
    <button
      onClick={() => onToggle(dossier)}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors hover:bg-muted ${
        decale ? 'ml-4' : ''
      } ${coche ? 'text-foreground' : 'text-muted-foreground'}`}
    >
      {coche
        ? <CheckSquare size={14} className="flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
        : <Square size={14} className="flex-shrink-0" />}
      <span className="truncate">{dossier.name}</span>
    </button>
  )
}

function MentoratView({ onBack, onOpenAccount, onOpenSupport, onOpenPlans }: MentoratViewProps) {

  const [gate, setGate] = useState<GateState>('checking')
  const [days, setDays] = useState(90)

  // ── Cadrage par dossiers (01/09/2026, idée de Brice) ─────────────────────
  // Un carnet mélange le trading et le perso. Avant de lâcher le mentor sur
  // tout, on demande ce qu'il a le droit de lire. RIEN DE COCHÉ = TOUT : le
  // cas par défaut ne demande donc aucun geste, et le cadrage reste un confort
  // plutôt qu'un péage. Cocher un dossier racine emporte ses sous-dossiers.
  const [dossiers, setDossiers] = useState<NoteFolder[]>([])
  const [coches, setCoches] = useState<string[]>([])
  const [cadrageOuvert, setCadrageOuvert] = useState(false)
  // Incrémenté à chaque validation : force le brief à se recalculer.
  const [versionCadrage, setVersionCadrage] = useState(0)

  // Au premier passage dans le mode, on propose le cadrage. Ensuite il ne
  // revient plus tout seul : il se rouvre par le bouton de l'en-tête.
  useEffect(() => {
    if (gate !== 'ok') return
    let vivant = true
    void (async () => {
      const [liste, settings] = await Promise.all([storage.getFolders(), storage.getSettings()])
      if (!vivant) return
      setDossiers(liste)
      setCoches(settings.mentoratDossiers ?? [])
      // Sans dossier, il n'y a rien à cadrer : on ne montre pas un écran vide.
      if (!settings.mentoratCadrageFait && liste.length > 0) setCadrageOuvert(true)
    })()
    return () => { vivant = false }
  }, [gate])

  const basculerDossier = useCallback((f: NoteFolder) => {
    setCoches(actuels => {
      const dedans = actuels.includes(f.id)
      const enfants = dossiers.filter(d => d.parentId === f.id).map(d => d.id)
      // Un parent emporte ses enfants dans les deux sens : devoir les décocher
      // un par un après avoir décoché le parent serait absurde.
      if (dedans) return actuels.filter(id => id !== f.id && !enfants.includes(id))
      return Array.from(new Set([...actuels, f.id, ...enfants]))
    })
  }, [dossiers])

  const validerCadrage = useCallback(async () => {
    await storage.saveSettings({ mentoratDossiers: coches, mentoratCadrageFait: true })
    setCadrageOuvert(false)
    setVersionCadrage(v => v + 1)
  }, [coches])

  // ── Le fil avec le mentor (1.8.1) ────────────────────────────────────────
  // Il vit dans la note epinglee « Mentorat AOK » : c'est elle la source de
  // verite, pas un etat local. On la relit apres chaque ecriture.
  const [noteMentoratId, setNoteMentoratId] = useState<string | null>(null)
  const [tours, setTours] = useState<TourMentorat[]>([])
  const [brouillon, setBrouillon] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const enAttente = enAttenteDeReponse(tours)

  const relireFil = useCallback(async (id: string) => {
    const note = await storage.getNote(id)
    if (note) setTours(lireConversation(note))
  }, [])

  useEffect(() => {
    let vivant = true
    obtenirNoteMentorat()
      .then(note => {
        if (!vivant) return
        setNoteMentoratId(note.id)
        setTours(lireConversation(note))
      })
      .catch(err => console.warn('[mentorat] note indisponible', err))
    return () => { vivant = false }
  }, [])

  // Ecrire : gratuit, aucun appel au modele. C'est le geste par defaut, pour
  // que l'eleve puisse prendre des notes dans ce fil sans rien declencher.
  const ecrire = useCallback(async () => {
    const texte = brouillon.trim()
    if (!texte || !noteMentoratId) return
    await ecrireTourEleve(noteMentoratId, texte)
    setBrouillon('')
    await relireFil(noteMentoratId)
  }, [brouillon, noteMentoratId, relireFil])

  // Demander : le seul endroit ou un jeton part. On envoie TOUT ce qui a ete
  // ecrit depuis la derniere reponse du mentor, pas seulement la derniere
  // ligne — on ecrit dans un carnet par petits bouts, puis on demande.
  const demander = useCallback(async () => {
    if (!noteMentoratId || envoiEnCours) return
    const texte = brouillon.trim()

    let fil = tours
    if (texte) {
      await ecrireTourEleve(noteMentoratId, texte)
      setBrouillon('')
      const note = await storage.getNote(noteMentoratId)
      fil = note ? lireConversation(note) : tours
      setTours(fil)
    }
    if (enAttenteDeReponse(fil).length === 0) {
      toast.info(t('mentorat.ecrisAvant'))
      return
    }

    setEnvoiEnCours(true)
    try {
      const { reply, error, statut } = await demanderAuMentor(
        fil.map(x => ({ role: x.role, content: x.content })),
        days
      )
      if (!reply) {
        if (statut === 403) toast.info(error || t('mentorat.reservePremium'))
        else toast.error(error || t('mentorat.indisponible'))
        return
      }
      await ecrireReponseMentor(noteMentoratId, reply)
      await relireFil(noteMentoratId)
    } catch (err) {
      console.error('[mentorat] echec', err)
      toast.error(t('mentorat.indisponible'))
    } finally {
      setEnvoiEnCours(false)
    }
  }, [noteMentoratId, brouillon, tours, envoiEnCours, relireFil, days])
  const [brief, setBrief] = useState<MentoratBriefData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const session = await getSession()
      if (!alive) return
      if (!session) { setGate('anon'); return }
      const res = await fetchMentoratAccess()
      if (!alive) return
      if (res.access) setGate(res.access.entitled ? 'ok' : 'denied')
      else setGate('gate-error')
    })()
    return () => { alive = false }
  }, [])

  const load = useCallback(async (d: number) => {
    setLoading(true)
    setError(null)
    const res = await fetchMentoratBrief(d)
    if (res.brief) setBrief(res.brief)
    else setError(res.error ?? t('mentorat.briefIndisponible'))
    setLoading(false)
  }, [])

  useEffect(() => { if (gate === 'ok') load(days) }, [gate, days, load, versionCadrage])

  const copyBrief = async () => {
    if (!brief) return
    try {
      await navigator.clipboard.writeText(brief.text)
      toast.success(t('mentorat.briefCopie'))
    } catch {
      toast.error(t('mentorat.copieImpossible'))
    }
  }

  // Plan d'évolution : notre IA propose (statut « proposition »), Brice valide
  const [lastPlan, setLastPlan] = useState<MentoratPlanData | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  useEffect(() => {
    fetchLastMentoratPlan().then(r => { if (r.plan) setLastPlan(r.plan) })
  }, [])

  const generatePlan = async () => {
    setPlanLoading(true)
    const res = await generateMentoratPlan(days)
    setPlanLoading(false)
    if (res.plan) {
      setLastPlan({ id: '', periodDays: days, plan: res.plan, status: res.status ?? 'proposed', createdAt: new Date().toISOString() })
      toast.success(t('mentorat.planGenere'))
    } else {
      toast.error(res.error ?? t('mentorat.planIndisponible'))
    }
  }

  // `stats` et pas `t` : `t` est la fonction de traduction.
  const stats = brief?.trades

  return (
    <div className="p-4 space-y-4">
      {/* En-tête */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          aria-label={t('commun.retour')}
        >
          <ArrowLeft size={16} />
        </button>
        <GraduationCap size={16} className="text-muted-foreground flex-shrink-0" />
        <h2 className="flex-1 text-sm font-semibold text-foreground">{t('mentorat.titre')}</h2>
        {gate === 'ok' && (
          <>
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
              {PERIODS.map(p => (
                <button
                  key={p}
                  onClick={() => setDays(p)}
                  className={`px-2 py-0.5 text-[11px] rounded-md transition-colors ${
                    days === p ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('mentorat.jours', { n: p })}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCadrageOuvert(true)}
              className={`p-1.5 rounded-md transition-colors hover:bg-muted ${
                coches.length ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={coches.length
                ? tp('mentorat.litDossierUn', 'mentorat.litDossiersPlur', coches.length)
                : t('mentorat.litTout')}
              aria-label={t('mentorat.choisirDossiers')}
            >
              <FolderTree size={14} />
            </button>
            <button
              onClick={() => load(days)}
              disabled={loading}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
              title={t('mentorat.recalculer')}
              aria-label={t('mentorat.recalculerBrief')}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </>
        )}
      </div>

      {/* Portail : vérification, connexion, upgrade */}
      {gate === 'checking' && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {gate === 'anon' && (
        <div className="p-4 border border-border rounded-xl space-y-3 text-center">
          <User size={22} className="mx-auto text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">{t('mentorat.connecteToi')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('mentorat.lieAuCompte')}
          </p>
          <button
            onClick={onOpenAccount}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            {t('mentorat.seConnecter')}
          </button>
        </div>
      )}

      {gate === 'denied' && (
        <div className="space-y-3">
          {/* Ce qu'on vend ICI : le mode boosté de l'extension (recadrage
              Brice 28/08 — pas le Live Club, lui est une piste parmi d'autres).
              Refaite le 31/08 : elle portait encore la palette violette d'avant
              « Mon forfait », un prix mensuel écrit en dur, et un bouton qui
              partait direct sur Stripe SANS l'email pré-rempli. Elle ne vend
              plus toute seule — elle amorce, et l'écran de vente conclut. */}
          <div className="p-4 border border-border bg-card rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Carnet Premium</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                {t('forfait.lancement')}
              </span>
            </div>

            {/* Le prix domine, le cadenas ouvert dit ce que ça fait. Même
                grammaire que « Mon forfait », en plus compact. */}
            <div className="flex items-center gap-2.5">
              <Unlock size={24} className="text-muted-foreground flex-shrink-0" strokeWidth={1.7} />
              <span className="text-[34px] leading-none font-bold tracking-tight text-foreground">
                {formatPrix(OFFRES.an.prix)}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-[11px] text-muted-foreground">{t('forfait.parMois')}</span>
                <span className="text-[11px] text-muted-foreground/60 line-through">{formatPrix(OFFRES.mois.prix)}</span>
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('mentorat.modeBooste')}
            </p>

            <button
              onClick={onOpenPlans}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-foreground text-background hover:opacity-90 text-sm font-semibold transition-opacity"
            >
              <Unlock size={15} strokeWidth={2.2} />
              {t('forfait.debloquer')}
            </button>
          </div>

          {/* Les autres portes : déjà incluses dans ces offres. La phrase est
              coupée autour de ses trois liens, d'où trois clés. */}
          <div className="p-3 border border-border/60 rounded-xl space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('mentorat.aussiInclus')}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('mentorat.inclusDebut')}{' '}
              <button onClick={() => chrome.tabs.create({ url: 'https://aoknowledge.com/live-club' })} className="underline underline-offset-2 text-foreground/80 hover:text-foreground">Live Club</button>
              {t('mentorat.inclusMilieu')}{' '}
              <button onClick={() => chrome.tabs.create({ url: 'https://aoknowledge.com' })} className="underline underline-offset-2 text-foreground/80 hover:text-foreground">{t('mentorat.formations')}</button>
              {t('mentorat.inclusFin')}{' '}
              <button onClick={() => chrome.tabs.create({ url: 'https://journal.aoknowledge.com' })} className="underline underline-offset-2 text-foreground/80 hover:text-foreground">{t('outils.journalNom')}</button>.
            </p>
          </div>

          <button
            onClick={onOpenSupport}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border/60 bg-muted/30 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title={t('mentorat.autreEmail')}
          >
            <LifeBuoy size={12} />
            {t('mentorat.dejaMembre')}
          </button>
        </div>
      )}

      {gate === 'gate-error' && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{t('mentorat.verifImpossible')}</span>
        </div>
      )}

      {gate === 'ok' && cadrageOuvert && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">{t('mentorat.cadrageTitre')}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('mentorat.cadrageTexte')}
            </p>
          </div>

          <div className="max-h-56 overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-0.5">
            {dossiers.filter(d => !d.parentId).map(racine => (
              <div key={racine.id}>
                <CaseDossier dossier={racine} coche={coches.includes(racine.id)} onToggle={basculerDossier} />
                {dossiers.filter(d => d.parentId === racine.id).map(enfant => (
                  <CaseDossier key={enfant.id} dossier={enfant} coche={coches.includes(enfant.id)} onToggle={basculerDossier} decale />
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => void validerCadrage()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <Check size={13} strokeWidth={2.4} />
              {coches.length === 0
                ? t('mentorat.lireTout')
                : tp('mentorat.lireDossierUn', 'mentorat.lireDossiersPlur', coches.length)}
            </button>
            {coches.length > 0 && (
              <button
                onClick={() => setCoches([])}
                className="px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {t('mentorat.toutDecocher')}
              </button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
            {t('mentorat.cadrageAide')}
          </p>
        </div>
      )}

      {gate === 'ok' && !cadrageOuvert && (<>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t('mentorat.briefIntro', { n: days })}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : brief && stats ? (
        <>
          {/* Cartes chiffrées */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('mentorat.trades')}</p>
              <p className="text-lg font-semibold text-foreground leading-none">{stats.total}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {tp('mentorat.gainUn', 'mentorat.gainPlur', stats.gain)} · {tp('mentorat.perteUn', 'mentorat.pertePlur', stats.perte)} · {t('mentorat.be', { n: stats.be })}
                {stats.open > 0 ? ` · ${tp('mentorat.ouvertUn', 'mentorat.ouvertPlur', stats.open)}` : ''}
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('mentorat.jugements')}</p>
              <div className="flex items-center gap-1">
                {(() => {
                  // Le D n'apparaît que s'il a servi : chez qui n'a jamais noté
                  // D, une pastille « 0 D » serait du bruit. Lecture optionnelle :
                  // tant que le journal n'est pas déployé, le serveur ne renvoie
                  // pas de clé D (le type MentoratBriefData ne la porte pas encore).
                  const grades = stats.grades as Partial<Record<AnnotationLettre, number>>
                  const lettres: AnnotationLettre[] = (grades.D ?? 0) > 0 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C']
                  return lettres.map(g => (
                    <span key={g} className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${GRADE_CLASS[g]}`}>
                      {grades[g] ?? 0} {g}
                    </span>
                  ))
                })()}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {tp('mentorat.noteSurUn', 'mentorat.notesSurPlur', stats.graded, { total: stats.total })}
              </p>
            </div>
          </div>

          {/* Causes des erreurs */}
          {(stats.causes.technique + stats.causes.connaissance + stats.causes.emotionnel) > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">{t('mentorat.causes')}</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(stats.causes).filter(([, n]) => n > 0).map(([cause, n]) => (
                  <span key={cause} className="px-2 py-0.5 rounded-full bg-background border border-border text-[11px] text-foreground/80">
                    {CAUSE_LABEL[cause] ? t(CAUSE_LABEL[cause]) : cause} · {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Calibration : le découplage décision / résultat */}
          {(stats.calibration.A.perte > 0 || stats.calibration.C.gain > 0) && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('mentorat.calibration')}</p>
              {stats.calibration.A.perte > 0 && (
                <p className="text-[11px] text-foreground/80">
                  <span className={`px-1 rounded font-semibold ${GRADE_CLASS.A}`}>{stats.calibration.A.perte} A</span>{' '}
                  {t('mentorat.calibrationA')}
                </p>
              )}
              {stats.calibration.C.gain > 0 && (
                <p className="text-[11px] text-foreground/80">
                  <span className={`px-1 rounded font-semibold ${GRADE_CLASS.C}`}>{stats.calibration.C.gain} C</span>{' '}
                  {t('mentorat.calibrationC')}
                </p>
              )}
            </div>
          )}

          {/* Relectures en retard */}
          {brief.reviewBacklog > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {tp('mentorat.retardUn', 'mentorat.retardPlur', brief.reviewBacklog)}
              </p>
            </div>
          )}

          {/* Plan d'évolution : l'IA propose, Brice valide avant diffusion.
              Palette neutralisée le 01/09 : le violet servait d'accent « IA »,
              mais il chargeait l'écran. Le signal IA reste porté par l'anneau
              `aura-ia` du bouton, qui le dit sans repeindre tout le panneau. */}
          <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('mentorat.plan')}</p>
              <button
                onClick={generatePlan}
                disabled={planLoading}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
              >
                {planLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {lastPlan ? t('mentorat.regenerer') : t('mentorat.generer')}
              </button>
            </div>
            {lastPlan ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    {lastPlan.status === 'proposed' ? t('mentorat.enAttenteValidation') : lastPlan.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {new Date(lastPlan.createdAt).toLocaleDateString(locale())}
                  </span>
                </div>
                <PlanText text={lastPlan.plan} />
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t('mentorat.planExplication')}
              </p>
            )}
          </div>

          {/* Le brief texte */}
          <div className="p-3 bg-muted/30 border border-border/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('mentorat.briefPourIA')}</p>
              <button
                onClick={copyBrief}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title={t('mentorat.copierAide')}
              >
                <Copy size={11} />
                {t('mentorat.copier')}
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/70 font-sans">{brief.text}</pre>
          </div>

          {/* ── Le fil avec le mentor (1.8.1) ─────────────────────────────
              L'écran donnait l'impression qu'on pouvait répondre dedans ; il
              le peut maintenant. Le fil vit dans la note épinglée « Mentorat
              AOK », donc il se synchronise, s'exporte et se relit comme le
              reste du carnet.

              La règle, la même que la capture : ÉCRIRE EST GRATUIT, DEMANDER
              EST UN GESTE. La flèche pose le texte dans la note sans qu'un
              jeton parte. Le bouton du mentor envoie tout ce qui a été écrit
              depuis sa dernière réponse — on écrit par petits bouts, on
              réfléchit, puis on demande une fois. */}
          <div className="p-3 border border-border/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('mentorat.fil')}</p>
              {tours.length > 0 && (
                <span className="text-[10px] text-muted-foreground/60">{t('mentorat.noteFil', { titre: TITRE_NOTE_MENTORAT })}</span>
              )}
            </div>

            {tours.length === 0 ? (
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                {t('mentorat.filVide')}
              </p>
            ) : (
              <div className="space-y-2 mb-3 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                {tours.map(tour => (
                  <div
                    key={tour.messageId}
                    className={`p-2 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap ${
                      tour.pieceJointe
                        ? 'bg-primary/5 border border-primary/20 text-foreground/80 italic'
                        : tour.role === 'assistant'
                          ? 'bg-amber-500/10 border border-amber-500/20 text-foreground'
                          : 'bg-muted/40 text-foreground/85'
                    }`}
                  >
                    <span className="block text-[9px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">
                      {tour.pieceJointe ? t('mentorat.noteJointe') : tour.role === 'assistant' ? t('mentorat.mentor') : t('mentorat.toi')}
                    </span>
                    {/* Une note jointe n'est pas recopiée en entier dans le fil :
                        ça le rendrait illisible. Le mentor, lui, en reçoit tout
                        le contenu quand tu lui demandes. */}
                    {apercuDuTour(tour, tour.pieceJointe)}
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={brouillon}
              onChange={e => setBrouillon(e.target.value)}
              rows={3}
              placeholder={t('mentorat.ecrisIci')}
              className="w-full text-[11px] px-2 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/20 placeholder:text-muted-foreground resize-y"
            />

            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={ecrire}
                disabled={!brouillon.trim() || envoiEnCours}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-muted text-foreground hover:bg-muted/70 transition-colors disabled:opacity-40"
                title={t('mentorat.ecrireAide')}
              >
                <ArrowUp size={12} />
                {t('mentorat.ecrire')}
              </button>

              <button
                onClick={demander}
                disabled={envoiEnCours || (!brouillon.trim() && enAttente.length === 0)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40 ${
                  envoiEnCours ? 'bg-muted text-muted-foreground cursor-wait' : 'aura-ia bg-background text-foreground hover:bg-muted'
                }`}
                title={t('mentorat.demanderAide')}
              >
                {envoiEnCours
                  ? <><Loader2 size={12} className="animate-spin" /> {t('mentorat.reflechit')}</>
                  : <><Sparkles size={12} /> {t('mentorat.demander')}</>}
              </button>

              {!envoiEnCours && enAttente.length > 0 && (
                <span className="text-[10px] text-muted-foreground/70">
                  {tp('mentorat.attenteUn', 'mentorat.attentePlur', enAttente.length)}
                </span>
              )}
            </div>
          </div>
        </>
      ) : null}
      </>)}
    </div>
  )
}

export default MentoratView
