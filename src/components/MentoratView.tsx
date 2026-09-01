// Panel du mode mentorat — v0 (étape 2 du chantier, TODO section 8).
// « Un panel, pas un 4e prompt » (décision Brice 17/07) : le mode a son propre
// espace. Cette v0 affiche le BRIEF COMPRESSÉ calculé par le backend depuis la
// base (étape 1) : la matière du futur plan d'évolution. Pas encore de gating
// d'abonnement (viendra avec Stripe) ni de plan IA (viendra avec la clé
// Anthropic côté Vercel) : phase de dogfooding.
import { toast } from '@/lib/toast'
import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, GraduationCap, RefreshCw, Copy, Loader2, AlertCircle, Sparkles, Unlock, LifeBuoy, User, ArrowUp } from 'lucide-react'
import { fetchMentoratBrief, fetchLastMentoratPlan, generateMentoratPlan, fetchMentoratAccess, demanderAuMentor, type MentoratBriefData, type MentoratPlanData } from '@/lib/sync'
import {
  obtenirNoteMentorat, lireConversation, enAttenteDeReponse,
  ecrireTourEleve, ecrireReponseMentor, TITRE_NOTE_MENTORAT, apercuDuTour,
  type TourMentorat,
} from '@/lib/note-mentorat'
import storage from '@/lib/storage'
import { getSession } from '@/lib/auth'
import { OFFRES } from '@/lib/offres'

const PERIODS = [
  { days: 30, label: '30 j' },
  { days: 90, label: '90 j' },
  { days: 180, label: '180 j' },
]

const GRADE_CLASS: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-green-500/15 text-green-600 dark:text-green-400',
  B: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  C: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

const CAUSE_LABEL: Record<string, string> = {
  technique: 'Technique',
  connaissance: 'Connaissance',
  emotionnel: 'Émotionnel',
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
        const t = line.trim()
        if (!t) return <div key={i} className="h-1.5" />
        if (t.startsWith('## ')) {
          return <p key={i} className="text-[11px] font-semibold text-foreground uppercase tracking-wide pt-1.5">{t.slice(3)}</p>
        }
        if (t.startsWith('# ')) {
          return <p key={i} className="text-[11px] font-semibold text-foreground uppercase tracking-wide pt-1.5">{t.slice(2)}</p>
        }
        return <p key={i} className="text-[11px] leading-relaxed text-foreground/80">{renderBold(t)}</p>
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

function MentoratView({ onBack, onOpenAccount, onOpenSupport, onOpenPlans }: MentoratViewProps) {

  const [gate, setGate] = useState<GateState>('checking')
  const [days, setDays] = useState(90)

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
      toast.info('Écris quelque chose avant de demander au mentor.')
      return
    }

    setEnvoiEnCours(true)
    try {
      const { reply, error, statut } = await demanderAuMentor(
        fil.map(x => ({ role: x.role, content: x.content })),
        days
      )
      if (!reply) {
        if (statut === 403) toast.info(error || 'Le mode mentorat fait partie du Carnet Premium.')
        else toast.error(error || 'Le mentor est indisponible pour le moment.')
        return
      }
      await ecrireReponseMentor(noteMentoratId, reply)
      await relireFil(noteMentoratId)
    } catch (err) {
      console.error('[mentorat] echec', err)
      toast.error('Le mentor est indisponible pour le moment.')
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
    else setError(res.error ?? 'Brief indisponible')
    setLoading(false)
  }, [])

  useEffect(() => { if (gate === 'ok') load(days) }, [gate, days, load])

  const copyBrief = async () => {
    if (!brief) return
    try {
      await navigator.clipboard.writeText(brief.text)
      toast.success('Brief copié — colle-le dans ta conversation IA.')
    } catch {
      toast.error('Copie impossible.')
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
      toast.success('Proposition de plan générée.')
    } else {
      toast.error(res.error ?? 'Plan indisponible.')
    }
  }

  const t = brief?.trades

  return (
    <div className="p-4 space-y-4">
      {/* En-tête */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          aria-label="Retour"
        >
          <ArrowLeft size={16} />
        </button>
        <GraduationCap size={16} className="text-purple-500 flex-shrink-0" />
        <h2 className="flex-1 text-sm font-semibold text-foreground">Mode mentorat</h2>
        {gate === 'ok' && (
          <>
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
              {PERIODS.map(p => (
                <button
                  key={p.days}
                  onClick={() => setDays(p.days)}
                  className={`px-2 py-0.5 text-[11px] rounded-md transition-colors ${
                    days === p.days ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => load(days)}
              disabled={loading}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
              title="Recalculer"
              aria-label="Recalculer le brief"
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
          <p className="text-sm font-semibold text-foreground">Connecte-toi pour accéder au mentorat</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Le mode mentorat est lié à ton compte AOKnowledge : c'est lui qui porte
            ton suivi et tes droits d'accès.
          </p>
          <button
            onClick={onOpenAccount}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Se connecter
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
                lancement
              </span>
            </div>

            {/* Le prix domine, le cadenas ouvert dit ce que ça fait. Même
                grammaire que « Mon forfait », en plus compact. */}
            <div className="flex items-center gap-2.5">
              <Unlock size={24} className="text-muted-foreground flex-shrink-0" strokeWidth={1.7} />
              <span className="text-[34px] leading-none font-bold tracking-tight text-foreground">
                {OFFRES.an.montant}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-[11px] text-muted-foreground">{OFFRES.an.unite}</span>
                <span className="text-[11px] text-muted-foreground/60 line-through">{OFFRES.mois.montant}</span>
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Le mode boosté de ton carnet : ton suivi de progression chiffré, un plan
              d'évolution rédigé à partir de TES trades, et un mentor à qui tu peux
              répondre. Le carnet gratuit reste entier, Premium s'ajoute par-dessus.
            </p>

            <button
              onClick={onOpenPlans}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-foreground text-background hover:opacity-90 text-sm font-semibold transition-opacity"
            >
              <Unlock size={15} strokeWidth={2.2} />
              Débloquer
            </button>
          </div>

          {/* Les autres portes : déjà incluses dans ces offres */}
          <div className="p-3 border border-border/60 rounded-xl space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Aussi inclus avec</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Le mode mentorat est offert aux membres du{' '}
              <button onClick={() => chrome.tabs.create({ url: 'https://aoknowledge.com/live-club' })} className="underline underline-offset-2 text-foreground/80 hover:text-foreground">Live Club</button>,
              aux niveaux Premium et VIP, et aux élèves des{' '}
              <button onClick={() => chrome.tabs.create({ url: 'https://aoknowledge.com' })} className="underline underline-offset-2 text-foreground/80 hover:text-foreground">formations complètes</button>.
              Et pour travailler tes notes en profondeur, il y a le{' '}
              <button onClick={() => chrome.tabs.create({ url: 'https://journal.aoknowledge.com' })} className="underline underline-offset-2 text-foreground/80 hover:text-foreground">Journal d'Études</button>.
            </p>
          </div>

          <button
            onClick={onOpenSupport}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border/60 bg-muted/30 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Ton accès existe peut-être sous un autre email"
          >
            <LifeBuoy size={12} />
            Déjà membre ? Contacte le support
          </button>
        </div>
      )}

      {gate === 'gate-error' && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>Impossible de vérifier ton accès (réseau ?). Reviens sur l'écran et réessaie.</span>
        </div>
      )}

      {gate === 'ok' && (<>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Ton brief : le condensé chiffré de tes {days} derniers jours, calculé depuis tes
        notes, jugements et trades. C'est la matière du futur plan d'évolution.
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
      ) : brief && t ? (
        <>
          {/* Cartes chiffrées */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Trades</p>
              <p className="text-lg font-semibold text-foreground leading-none">{t.total}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {t.gain} gains · {t.perte} pertes · {t.be} BE{t.open > 0 ? ` · ${t.open} ouverts` : ''}
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Jugements</p>
              <div className="flex items-center gap-1">
                {(['A', 'B', 'C'] as const).map(g => (
                  <span key={g} className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${GRADE_CLASS[g]}`}>
                    {t.grades[g]} {g}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {t.graded} notés sur {t.total}
              </p>
            </div>
          </div>

          {/* Causes des erreurs */}
          {(t.causes.technique + t.causes.connaissance + t.causes.emotionnel) > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Causes des erreurs</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(t.causes).filter(([, n]) => n > 0).map(([cause, n]) => (
                  <span key={cause} className="px-2 py-0.5 rounded-full bg-background border border-border text-[11px] text-foreground/80">
                    {CAUSE_LABEL[cause] ?? cause} · {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Calibration : le découplage décision / résultat */}
          {(t.calibration.A.perte > 0 || t.calibration.C.gain > 0) && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Calibration</p>
              {t.calibration.A.perte > 0 && (
                <p className="text-[11px] text-foreground/80">
                  <span className={`px-1 rounded font-semibold ${GRADE_CLASS.A}`}>{t.calibration.A.perte} A</span>{' '}
                  perdants : bien joués, mauvais résultat. C'est le process qui compte.
                </p>
              )}
              {t.calibration.C.gain > 0 && (
                <p className="text-[11px] text-foreground/80">
                  <span className={`px-1 rounded font-semibold ${GRADE_CLASS.C}`}>{t.calibration.C.gain} C</span>{' '}
                  gagnants : le résultat a récompensé une mauvaise décision.
                </p>
              )}
            </div>
          )}

          {/* Relectures en retard */}
          {brief.reviewBacklog > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {brief.reviewBacklog} relecture{brief.reviewBacklog > 1 ? 's' : ''} en retard : des jugements posés il y a plus de 2 semaines attendent leur second regard.
              </p>
            </div>
          )}

          {/* Plan d'évolution : l'IA propose, Brice valide avant diffusion */}
          <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Plan d'évolution</p>
              <button
                onClick={generatePlan}
                disabled={planLoading}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 rounded-md transition-colors disabled:opacity-50"
              >
                {planLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {lastPlan ? 'Regénérer' : 'Générer une proposition'}
              </button>
            </div>
            {lastPlan ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    {lastPlan.status === 'proposed' ? 'Proposition — en attente de validation' : lastPlan.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {new Date(lastPlan.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <PlanText text={lastPlan.plan} />
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                L'IA rédige une proposition de plan à partir de ton brief : où tu en es, le
                chantier prioritaire, 3 actions pour 2 semaines, et le signal de passage.
                Chaque proposition est validée par Brice avant d'être considérée comme un plan.
              </p>
            )}
          </div>

          {/* Le brief texte */}
          <div className="p-3 bg-muted/30 border border-border/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Brief pour ton IA</p>
              <button
                onClick={copyBrief}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title="Copier le brief pour le coller dans une conversation IA"
              >
                <Copy size={11} />
                Copier
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
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ton fil avec le mentor</p>
              {tours.length > 0 && (
                <span className="text-[10px] text-muted-foreground/60">note « {TITRE_NOTE_MENTORAT} »</span>
              )}
            </div>

            {tours.length === 0 ? (
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                Écris ici ce que tu veux : une question, un doute, une observation de séance.
                Rien ne part tant que tu ne cliques pas sur le bouton du mentor.
              </p>
            ) : (
              <div className="space-y-2 mb-3 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                {tours.map(t => (
                  <div
                    key={t.messageId}
                    className={`p-2 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap ${
                      t.pieceJointe
                        ? 'bg-primary/5 border border-primary/20 text-foreground/80 italic'
                        : t.role === 'assistant'
                          ? 'bg-amber-500/10 border border-amber-500/20 text-foreground'
                          : 'bg-muted/40 text-foreground/85'
                    }`}
                  >
                    <span className="block text-[9px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">
                      {t.pieceJointe ? 'Note jointe' : t.role === 'assistant' ? 'Mentor' : 'Toi'}
                    </span>
                    {/* Une note jointe n'est pas recopiée en entier dans le fil :
                        ça le rendrait illisible. Le mentor, lui, en reçoit tout
                        le contenu quand tu lui demandes. */}
                    {apercuDuTour(t, t.pieceJointe)}
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={brouillon}
              onChange={e => setBrouillon(e.target.value)}
              rows={3}
              placeholder="Écris ici…"
              className="w-full text-[11px] px-2 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/20 placeholder:text-muted-foreground resize-y"
            />

            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={ecrire}
                disabled={!brouillon.trim() || envoiEnCours}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-muted text-foreground hover:bg-muted/70 transition-colors disabled:opacity-40"
                title="Écrire dans la note, sans rien envoyer"
              >
                <ArrowUp size={12} />
                Écrire
              </button>

              <button
                onClick={demander}
                disabled={envoiEnCours || (!brouillon.trim() && enAttente.length === 0)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40 ${
                  envoiEnCours ? 'bg-muted text-muted-foreground cursor-wait' : 'aura-ia bg-background text-foreground hover:bg-muted'
                }`}
                title="Envoyer au mentor tout ce que tu as écrit depuis sa dernière réponse"
              >
                {envoiEnCours
                  ? <><Loader2 size={12} className="animate-spin" /> Le mentor réfléchit…</>
                  : <><Sparkles size={12} className="text-purple-500" /> Demander au mentor</>}
              </button>

              {!envoiEnCours && enAttente.length > 0 && (
                <span className="text-[10px] text-muted-foreground/70">
                  {enAttente.length} message{enAttente.length > 1 ? 's' : ''} en attente
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
