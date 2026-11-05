import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileUp, X, Check, Sparkles, AlertCircle, Loader2, ExternalLink, Users, Hourglass } from 'lucide-react'
import { t, tp, locale } from '@/lib/i18n'
import { getBearerToken } from '@/lib/auth'
import { lectureIntelligente, lecturesRestantes, offertesActives, type Lecture, type Quota, type TradeNormalise } from '@/lib/documents-lecture'
import {
  abregerIdentifiant, adresseNouveauCompte, comptesProposes, devinerCompte, libelleCompte, lotsParCompte, type Devinette,
} from '@/lib/documents-attribution'
import { recouvrements, sansLesFaitsDeja, type Recouvrement } from '@/lib/documents-doublons'
import {
  TAILLE_MAX_BASE64, apercuImport, comptesEnvoyes, confirmerImport, demanderConnexion, demanderRelectureComptesPilotage,
  fuseauDuNavigateur, lireDocument, ouvrirPilotage, type ApercuImport,
} from '@/lib/pilotage-api'
import { useComptesPilotage } from '@/lib/use-comptes-pilotage'
import type { CompteConnu } from '@/lib/pilotage-comptes'

/**
 * « Importer mes trades » (1.8.13) : la boîte d'import de Pilotage, dans le
 * Carnet. Modèle visuel : le labo du 03/11 (capture a3).
 *
 * Le même parcours que « Déposer mes documents » de Pilotage, pour les seuls
 * exports de trades (CSV, PDF, capture, HTML de MetaTrader) :
 * 1. chaque fichier est lu par le journal (`documents/lire`, original gardé au
 *    coffre), un à la fois, avec la liste des comptes de Pilotage lue par le
 *    content script ;
 * 2. le compte est deviné d'après le fichier ; « Quel compte ? » seulement en
 *    cas de doute ; un compte que Pilotage ne connaît pas se crée dans Pilotage
 *    (la liste revient toute seule, la boîte re-devine) ;
 * 3. les doublons entre fichiers du dépôt (le CSV et le PDF d'un même rapport)
 *    ne se rangent qu'une fois ; ceux déjà rangés, l'aperçu du journal les dit ;
 * 4. « Ranger N trades » : le même import que Pilotage, sur le même `compteId`.
 * Un document qui n'est pas un export de trades se dépose dans Pilotage : rien
 * n'est écrit depuis le Carnet.
 */

interface ImportTradesDialogProps {
  onClose: () => void
  /** Le début du trade d'où vient la demande (« Importer l'export de ce jour »). */
  jour?: number
  /** Des trades viennent d'être rangés : l'écran d'où vient la demande relit les siens. */
  onRange?: () => void
}

type EtatFichier = 'attente' | 'lecture' | 'lu' | 'hors-trades' | 'erreur' | 'epuisees'

interface Fichier {
  id: string
  fichier: File
  nom: string
  etat: EtatFichier
  raison?: string
  lecture?: Lecture
  /** L'export envoyé tel quel à l'import, quand le journal n'a pas pu le lire. */
  csv?: string
}

interface Lot {
  cle: string
  fichierId: string
  nom: string
  compteLu: string | null
  demande: { trades: TradeNormalise[]; source: string } | { csv: string }
  devinette: Devinette
  nbLus: number | null
  rang: number
  nbLots: number
}

type EtatApercu = { etat: 'chargement' } | { etat: 'pret'; apercu: ApercuImport } | { etat: 'erreur'; message: string }

type Bilan = { nom: string; compteId: string | null; importes: number; deja: number; erreur?: string; pasRange?: boolean }

const EXTENSIONS = '.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.htm,.html'

const MIMES: Record<string, string> = {
  csv: 'text/csv', tsv: 'text/tab-separated-values', txt: 'text/plain', pdf: 'application/pdf', html: 'text/html', htm: 'text/html',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
}
const extension = (nom: string) => nom.split('.').pop()?.toLowerCase() ?? ''
const mimeDe = (fichier: File) => fichier.type || MIMES[extension(fichier.name)] || 'application/octet-stream'
const estTexte = (nom: string) => ['csv', 'tsv', 'txt'].includes(extension(nom))

/** Base64 par tranches : `String.fromCharCode(...tableau)` fait exploser la pile sur un PDF. */
function versBase64(buffer: ArrayBuffer): string {
  const octets = new Uint8Array(buffer)
  let binaire = ''
  for (let i = 0; i < octets.length; i += 8192) binaire += String.fromCharCode(...octets.subarray(i, i + 8192))
  return btoa(binaire)
}

const nouvelId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const jourCourt = (instant: number) => new Date(instant).toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit' })

/** « Lectures intelligentes : 3 sur 10 ce mois-ci », comme le compteur de Pilotage. */
function phraseQuota(quota: Quota): string {
  if (quota.limite === null) return t('import.quotaSansLimite')
  if (lecturesRestantes(quota) === 0) return t('import.quotaEpuisees')
  if (offertesActives(quota)) {
    const date = new Date(quota.jusquAu!).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
    return tp('import.quotaOffertes1', 'import.quotaOffertes', quota.offertes, { date })
  }
  return t('import.quota', { lues: Math.min(Math.max(0, quota.utilisees), quota.limite), limite: quota.limite })
}

function ImportTradesDialog({ onClose, jour, onRange }: ImportTradesDialogProps) {
  const etatComptes = useComptesPilotage()
  const comptes: CompteConnu[] = etatComptes.etat === 'pret' ? etatComptes.comptes : []
  const [connecte, setConnecte] = useState<boolean | null>(null)
  const [fichiers, setFichiersEtat] = useState<Fichier[]>([])
  const fichiersRef = useRef<Fichier[]>([])
  const [survol, setSurvol] = useState(false)
  const [quota, setQuota] = useState<Quota | null>(null)
  const [choix, setChoix] = useState<Record<string, string>>({})
  const [changer, setChanger] = useState<Record<string, boolean>>({})
  const [apercus, setApercus] = useState<Record<string, EtatApercu>>({})
  const apercusDemandes = useRef<Set<string>>(new Set())
  const [etape, setEtape] = useState<'depot' | 'rangement' | 'rapport'>('depot')
  const [bilans, setBilans] = useState<Bilan[]>([])
  const enLecture = useRef(false)
  const comptesRef = useRef<CompteConnu[]>([])
  comptesRef.current = comptes
  const inputRef = useRef<HTMLInputElement>(null)
  const fuseau = useMemo(fuseauDuNavigateur, [])

  useEffect(() => { void getBearerToken().then(jeton => setConnecte(!!jeton)) }, [])

  // Les comptes de Pilotage relus au geste, jamais à la minuterie (règle de
  // Brice du 05/11) : à l'ouverture de la boîte, puis quand le panneau
  // reprend la main (retour de Pilotage où un compte vient d'être créé :
  // l'onglet Pilotage reste visible à côté du panneau, il ne change pas de
  // visibilité). La nouvelle liste arrive par useComptesPilotage.
  useEffect(() => {
    void demanderRelectureComptesPilotage()
    const auRetour = () => { void demanderRelectureComptesPilotage() }
    window.addEventListener('focus', auRetour)
    return () => window.removeEventListener('focus', auRetour)
  }, [])

  const setFichiers = useCallback((maj: (actuels: Fichier[]) => Fichier[]) => {
    fichiersRef.current = maj(fichiersRef.current)
    setFichiersEtat(fichiersRef.current)
  }, [])
  const majFichier = useCallback((id: string, champs: Partial<Fichier>) => {
    setFichiers(actuels => actuels.map(f => (f.id === id ? { ...f, ...champs } : f)))
  }, [setFichiers])

  useEffect(() => {
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape' && etape !== 'rangement') onClose() }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [onClose, etape])

  /** Un fichier lu par le journal. false : la session manque, la file s'arrête. */
  const lireUn = useCallback(async (f: Fichier): Promise<boolean> => {
    const data = versBase64(await f.fichier.arrayBuffer())
    if (data.length > TAILLE_MAX_BASE64) {
      majFichier(f.id, { etat: 'erreur', raison: t('import.tropLourd') })
      return true
    }
    const r = await lireDocument({ nom: f.nom, type: mimeDe(f.fichier), data, comptes: comptesEnvoyes(comptesRef.current) })
    if (r.quota) setQuota(r.quota)
    if (!r.ok) {
      if (r.erreur === 'non-connecte') {
        majFichier(f.id, { etat: 'attente' })
        setConnecte(false)
        return false
      }
      if (r.erreur === 'epuisees') { majFichier(f.id, { etat: 'epuisees', raison: r.message ?? t('import.epuisees') }); return true }
      if (r.erreur === 'trop-lourd') { majFichier(f.id, { etat: 'erreur', raison: t('import.tropLourd') }); return true }
      // Le journal ne lit pas : un CSV part tel quel à l'import des trades, comme dans Pilotage.
      if (estTexte(f.nom)) { majFichier(f.id, { etat: 'lu', csv: await f.fichier.text() }); return true }
      majFichier(f.id, { etat: 'erreur', raison: r.message ?? t('import.erreurLecture') })
      return true
    }
    const lecture = r.lecture
    if (lecture.type === 'trades' && lecture.trades?.length) { majFichier(f.id, { etat: 'lu', lecture }); return true }
    if (lecture.type !== 'trades' && lecture.type !== 'illisible' && lecture.type !== 'autre') {
      majFichier(f.id, { etat: 'hors-trades', lecture })
      return true
    }
    // Un CSV que la lecture n'a pas compris : l'import des trades a ses propres lecteurs.
    if (estTexte(f.nom)) { majFichier(f.id, { etat: 'lu', csv: await f.fichier.text() }); return true }
    majFichier(f.id, { etat: lecture.type === 'autre' ? 'hors-trades' : 'erreur', lecture, raison: lecture.type === 'illisible' ? (lecture.remarque ?? t('import.illisible')) : lecture.type === 'trades' ? t('import.aucunTrade') : undefined })
    return true
  }, [majFichier])

  /** La file : un fichier à la fois, une progression visible. */
  const lancerLecture = useCallback(async () => {
    if (enLecture.current) return
    enLecture.current = true
    try {
      for (;;) {
        const suivant = fichiersRef.current.find(f => f.etat === 'attente')
        if (!suivant) break
        majFichier(suivant.id, { etat: 'lecture' })
        const continuer = await lireUn(suivant).catch(() => { majFichier(suivant.id, { etat: 'erreur', raison: t('import.erreurLecture') }); return true })
        if (!continuer) break
      }
    } finally {
      enLecture.current = false
    }
  }, [lireUn, majFichier])

  const ajouter = useCallback((liste: FileList | File[] | null) => {
    const nouveaux = Array.from(liste ?? [])
      .filter(fichier => !fichiersRef.current.some(f => f.nom === fichier.name && f.fichier.size === fichier.size && f.fichier.lastModified === fichier.lastModified))
      .map(fichier => ({ id: nouvelId(), fichier, nom: fichier.name, etat: 'attente' as const }))
    if (!nouveaux.length) return
    setEtape('depot')
    setFichiers(actuels => [...actuels, ...nouveaux])
    void lancerLecture()
    if (inputRef.current) inputRef.current.value = ''
  }, [lancerLecture, setFichiers])

  const retirer = (id: string) => setFichiers(actuels => actuels.filter(f => f.id !== id || f.etat === 'lecture'))

  // Les doublons entre les fichiers du dépôt, puis un lot par compte du fichier.
  const { lots, recouvre } = useMemo(() => {
    const lus = fichiers.filter(f => f.etat === 'lu')
    const recouvre = recouvrements(lus.filter(f => f.lecture).map(f => ({ id: f.id, nom: f.nom, empreintes: f.lecture!.empreintes })))
    const sortie: Lot[] = []
    for (const f of lus) {
      if (!f.lecture) {
        if (f.csv !== undefined) {
          sortie.push({
            cle: `${f.id}:csv`, fichierId: f.id, nom: f.nom, compteLu: null, demande: { csv: f.csv },
            devinette: { compteId: null, par: null, doute: true, inconnu: null, demo: false }, nbLus: null, rang: 0, nbLots: 1,
          })
        }
        continue
      }
      const rec = recouvre.get(f.id)
      if (rec?.memeContenuQue) continue
      const lecture = sansLesFaitsDeja(f.lecture, rec?.deja ?? new Set())
      const parCompte = lotsParCompte(lecture).filter(l => l.lecture.trades?.length)
      parCompte.forEach((l, rang) => {
        const trades = l.lecture.trades!
        sortie.push({
          cle: `${f.id}:${rang}`, fichierId: f.id, nom: f.nom, compteLu: l.compteLu, demande: { trades, source: trades[0].source },
          devinette: devinerCompte(l.lecture, comptes), nbLus: trades.length, rang, nbLots: parCompte.length,
        })
      })
    }
    return { lots: sortie, recouvre }
  }, [fichiers, comptes])

  /** Le compte où ce lot se range : le choix du membre, sinon la devinette ; null tant qu'il n'y en a pas. */
  const compteDuLot = useCallback((lot: Lot): string | null => {
    const choisi = choix[lot.cle]
    if (choisi === 'aucun') return null
    const id = choisi ?? lot.devinette.compteId
    return id && comptes.some(c => c.id === id) ? id : null
  }, [choix, comptes])

  // L'aperçu du journal (nouveaux, déjà connus) pour chaque lot et son compte.
  useEffect(() => {
    for (const lot of lots) {
      const compteId = compteDuLot(lot) ?? ''
      const cle = `${lot.cle}|${compteId}`
      if (apercusDemandes.current.has(cle)) continue
      apercusDemandes.current.add(cle)
      setApercus(a => ({ ...a, [cle]: { etat: 'chargement' } }))
      void apercuImport({ ...lot.demande, fichier: lot.nom, compteId, fuseau }).then(r => {
        if (!r.ok && r.erreur === 'non-connecte') setConnecte(false)
        setApercus(a => ({
          ...a,
          [cle]: r.ok ? { etat: 'pret', apercu: r.valeur } : { etat: 'erreur', message: r.message ?? t('import.erreurLecture') },
        }))
      })
    }
  }, [lots, compteDuLot, fuseau])

  const apercuDuLot = (lot: Lot): EtatApercu | undefined => apercus[`${lot.cle}|${compteDuLot(lot) ?? ''}`] ?? apercus[`${lot.cle}|`]

  const nomCompte = (id: string | null) => {
    const compte = id ? comptes.find(c => c.id === id) : undefined
    return compte ? libelleCompte(compte) : null
  }

  const prets = lots.filter(lot => {
    const a = apercuDuLot(lot)
    return compteDuLot(lot) && a?.etat === 'pret' && a.apercu.lus > 0
  })
  const aRanger = prets.reduce((total, lot) => {
    const a = apercuDuLot(lot)
    return total + (a?.etat === 'pret' ? a.apercu.nouveaux : 0)
  }, 0)
  const sansCompte = lots.filter(lot => {
    const a = apercuDuLot(lot)
    return !compteDuLot(lot) && choix[lot.cle] !== 'aucun' && !(a?.etat === 'pret' && a.apercu.lus === 0)
  }).length
  const lectureEnCours = fichiers.some(f => f.etat === 'attente' || f.etat === 'lecture')

  const ranger = async () => {
    setEtape('rangement')
    const resultats: Bilan[] = []
    for (const lot of lots) {
      const compteId = compteDuLot(lot)
      const a = apercuDuLot(lot)
      if (!compteId) {
        if (!(a?.etat === 'pret' && a.apercu.lus === 0)) resultats.push({ nom: lot.nom, compteId: null, importes: 0, deja: 0, pasRange: true })
        continue
      }
      if (a?.etat !== 'pret' || a.apercu.lus === 0) continue
      // Rien de nouveau : l'aperçu suffit, aucun appel.
      if (a.apercu.nouveaux === 0) {
        resultats.push({ nom: lot.nom, compteId, importes: 0, deja: a.apercu.dejaConnus })
        continue
      }
      const r = await confirmerImport({ ...lot.demande, fichier: lot.nom, compteId, fuseau })
      if (!r.ok) {
        if (r.erreur === 'non-connecte') setConnecte(false)
        resultats.push({ nom: lot.nom, compteId, importes: 0, deja: 0, erreur: r.message ?? t('import.erreurLecture') })
        continue
      }
      resultats.push({ nom: lot.nom, compteId, importes: r.valeur.importes, deja: r.valeur.dejaConnus })
    }
    setBilans(resultats)
    setEtape('rapport')
    if (resultats.some(b => b.importes > 0)) onRange?.()
  }

  const recommencer = () => {
    setFichiers(() => [])
    setChoix({})
    setChanger({})
    setApercus({})
    apercusDemandes.current = new Set()
    setBilans([])
    setEtape('depot')
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  const titre = jour ? t('import.titreJour', { jour: jourCourt(jour) }) : t('import.titre')

  const choixCompte = (lot: Lot) => {
    const valeur = choix[lot.cle] ?? lot.devinette.compteId ?? ''
    return (
      <select
        value={comptes.some(c => c.id === valeur) || valeur === 'aucun' ? valeur : ''}
        onChange={e => setChoix(c => ({ ...c, [lot.cle]: e.target.value }))}
        className="ml-auto max-w-[60%] px-1.5 py-0.5 text-[11px] bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary/50"
        aria-label={t('import.quelCompte')}
      >
        <option value="" disabled>{t('import.choisirCompte')}</option>
        {comptesProposes(comptes, lot.devinette.demo).map(c => <option key={c.id} value={c.id}>{libelleCompte(c)}</option>)}
        <option value="aucun">{t('import.neRienRanger')}</option>
      </select>
    )
  }

  const ligneCompte = (lot: Lot) => {
    const compteId = compteDuLot(lot)
    const choisi = choix[lot.cle] !== undefined
    const montrerChoix = changer[lot.cle] || (!choisi && (lot.devinette.doute || !compteId))
    if (montrerChoix || !compteId) {
      return (
        <div className="space-y-1">
          {lot.devinette.inconnu && !choisi && (
            <div className="space-y-1">
              <p className="text-[11px] text-foreground">
                {t('import.inconnu', { compte: abregerIdentifiant(lot.devinette.inconnu.identifiant) })}
              </p>
              <button
                onClick={() => ouvrirPilotage(adresseNouveauCompte(lot.devinette.inconnu!))}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/40 text-[10px] font-medium text-primary hover:bg-primary/10"
              >
                <ExternalLink size={10} />{t('import.creerCompte')}
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px]">
            <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
            <span className="text-foreground">{t('import.quelCompte')}</span>
            {choixCompte(lot)}
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1.5 text-[11px] min-w-0">
        <span className="text-muted-foreground flex-shrink-0">{t('import.compte')}</span>
        <span className="font-medium text-foreground truncate">{nomCompte(compteId)}</span>
        <span className="text-[10px] text-muted-foreground flex-shrink-0">{choisi ? t('import.choisiParToi') : t('import.devine')}</span>
        <button onClick={() => setChanger(c => ({ ...c, [lot.cle]: true }))} className="ml-auto text-[10px] text-primary hover:underline flex-shrink-0">
          {t('import.changer')}
        </button>
      </div>
    )
  }

  const blocLot = (lot: Lot, rec: Recouvrement | undefined) => {
    const a = apercuDuLot(lot)
    const lus = a?.etat === 'pret' ? a.apercu.lus : lot.nbLus
    const deja = a?.etat === 'pret' ? a.apercu.dejaConnus : 0
    const morceaux = [
      lus !== null ? tp('import.tradesLus1', 'import.tradesLus', lus) : null,
      deja > 0 ? t('import.dejaLa', { n: deja }) : null,
      lot.rang === 0 && rec && rec.deja.size > 0 && !rec.memeContenuQue ? t('import.dejaDans', { n: rec.deja.size, nom: rec.dejaDans[0] ?? '' }) : null,
    ].filter(Boolean)
    return (
      <div key={lot.cle} className={`space-y-1 ${lot.nbLots > 1 ? 'pl-2 border-l-2 border-border' : ''}`}>
        {lot.nbLots > 1 && lot.compteLu && <p className="text-[10px] font-medium text-muted-foreground">{abregerIdentifiant(lot.compteLu)}</p>}
        {a?.etat === 'chargement' && !morceaux.length && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 size={10} className="animate-spin" />{t('import.lecture')}</p>
        )}
        {a?.etat === 'erreur' && <p className="text-[11px] text-red-600 dark:text-red-400">{a.message}</p>}
        {a?.etat === 'pret' && a.apercu.colonnesADire && <p className="text-[11px] text-muted-foreground">{t('import.colonnes')}</p>}
        {a?.etat === 'pret' && a.apercu.lus === 0 && !a.apercu.colonnesADire && (
          <p className="text-[11px] text-muted-foreground">{a.apercu.erreurs[0] ?? t('import.aucunTrade')}</p>
        )}
        {morceaux.length > 0 && !(a?.etat === 'pret' && a.apercu.lus === 0) && (
          <p className="text-[11px] text-muted-foreground">{morceaux.join(' · ')}</p>
        )}
        {!(a?.etat === 'pret' && a.apercu.lus === 0) && etape !== 'rapport' && ligneCompte(lot)}
      </div>
    )
  }

  const carteFichier = (f: Fichier) => {
    const rec = recouvre.get(f.id)
    const lotsDuFichier = lots.filter(l => l.fichierId === f.id)
    const intelligente = f.lecture ? lectureIntelligente(f.lecture) : false
    const Icone = f.etat === 'lecture' || f.etat === 'attente' ? Loader2
      : f.etat === 'erreur' ? AlertCircle
      : f.etat === 'epuisees' ? Hourglass
      : f.etat === 'hors-trades' ? FileUp
      : intelligente ? Sparkles : Check
    const couleur = f.etat === 'erreur' ? 'text-red-500'
      : f.etat === 'epuisees' || f.etat === 'hors-trades' ? 'text-amber-500'
      : f.etat === 'lu' ? (intelligente ? 'text-purple-500' : 'text-green-600 dark:text-green-400')
      : 'text-muted-foreground'
    const etiquette = f.etat === 'attente' ? t('import.attente')
      : f.etat === 'lecture' ? t('import.lecture')
      : f.etat === 'lu' || f.etat === 'hors-trades' ? (intelligente ? t('import.intelligente') : t('import.sansAide'))
      : ''
    return (
      <div key={f.id} className="rounded-lg border border-border p-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icone size={12} className={`${couleur} flex-shrink-0 ${f.etat === 'lecture' ? 'animate-spin' : ''}`} />
          <span className="text-xs text-foreground flex-1 truncate" title={f.nom}>{f.nom}</span>
          {etiquette && <span className="text-[10px] text-muted-foreground flex-shrink-0">{etiquette}</span>}
          {etape === 'depot' && f.etat !== 'lecture' && (
            <button onClick={() => retirer(f.id)} className="p-0.5 rounded text-muted-foreground hover:bg-muted flex-shrink-0" aria-label={t('import.retirer', { nom: f.nom })}>
              <X size={11} />
            </button>
          )}
        </div>
        {f.etat === 'lu' && rec?.memeContenuQue && (
          <p className="text-[11px] text-muted-foreground">{t('import.memeContenu', { nom: rec.memeContenuQue.nom })}</p>
        )}
        {/* Copy trading : le premier compte, puis « 2 autres comptes dans le fichier (copie) », chacun le sien. */}
        {f.etat === 'lu' && lotsDuFichier.slice(0, 1).map(lot => blocLot(lot, rec))}
        {f.etat === 'lu' && lotsDuFichier.length > 1 && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users size={10} className="flex-shrink-0" />{tp('import.autresComptes1', 'import.autresComptes', lotsDuFichier.length - 1)}
          </p>
        )}
        {f.etat === 'lu' && lotsDuFichier.slice(1).map(lot => blocLot(lot, rec))}
        {f.etat === 'hors-trades' && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-foreground">{t('import.horsTrades')}</p>
            <p className="text-[10px] text-muted-foreground">{t('import.horsTradesSous')}</p>
            <button onClick={() => ouvrirPilotage('/documents')} className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline">
              <ExternalLink size={10} />{t('import.horsTradesLien')}
            </button>
          </div>
        )}
        {(f.etat === 'erreur' || f.etat === 'epuisees') && f.raison && (
          <p className={`text-[11px] ${f.etat === 'erreur' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>{f.raison}</p>
        )}
      </div>
    )
  }

  const rapport = () => {
    const parCompte = new Map<string, { importes: number; deja: number }>()
    for (const b of bilans) {
      if (!b.compteId || b.erreur) continue
      const total = parCompte.get(b.compteId) ?? { importes: 0, deja: 0 }
      parCompte.set(b.compteId, { importes: total.importes + b.importes, deja: total.deja + b.deja })
    }
    return (
      <div className="space-y-1.5">
        {[...parCompte.entries()].map(([compteId, { importes, deja }]) => (
          <p key={compteId} className="flex items-start gap-1.5 text-xs text-foreground">
            <Check size={12} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
            <span>
              {tp('import.rapportLigne1', 'import.rapportLigne', importes, { compte: nomCompte(compteId) ?? '' })}
              {deja > 0 && `, ${t('import.rapportDeja', { n: deja })}`}
            </span>
          </p>
        ))}
        {bilans.filter(b => b.erreur).map((b, i) => (
          <p key={`e${i}`} className="text-[11px] text-red-600 dark:text-red-400">{t('import.rapportErreur', { nom: b.nom, raison: b.erreur ?? '' })}</p>
        ))}
        {bilans.filter(b => b.pasRange).map((b, i) => (
          <p key={`p${i}`} className="text-[11px] text-muted-foreground">{t('import.rapportPasRange', { nom: b.nom })}</p>
        ))}
        {fichiers.filter(f => f.etat === 'lu' && recouvre.get(f.id)?.memeContenuQue).map(f => (
          <p key={f.id} className="text-[11px] text-muted-foreground">{f.nom} : {t('import.memeContenu', { nom: recouvre.get(f.id)!.memeContenuQue!.nom })}</p>
        ))}
      </div>
    )
  }

  const corps = () => {
    if (connecte === null || etatComptes.etat === 'chargement') {
      return <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" />{t('import.lecture')}</p>
    }
    if (connecte === false) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-foreground">{t('import.nonConnecte')}</p>
          <button onClick={() => { demanderConnexion(); onClose() }} className="w-full px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            {t('import.meConnecter')}
          </button>
        </div>
      )
    }
    if (etatComptes.etat !== 'pret') {
      return (
        <div className="space-y-2">
          <p className="text-xs text-foreground">{etatComptes.etat === 'autre-compte' ? t('import.autreCompteAok') : t('import.aucunCompte')}</p>
          <button onClick={() => ouvrirPilotage('/comptes')} className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <ExternalLink size={12} />{t('import.ouvrirPilotage')}
          </button>
        </div>
      )
    }
    if (etape === 'rapport') {
      return (
        <>
          {rapport()}
          <div className="flex gap-2">
            <button onClick={recommencer} className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted">{t('import.encore')}</button>
            <button onClick={onClose} className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">{t('import.fermer')}</button>
          </div>
        </>
      )
    }
    const epuisees = fichiers.some(f => f.etat === 'epuisees')
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
          onDragOver={e => { e.preventDefault(); setSurvol(true) }}
          onDragLeave={() => setSurvol(false)}
          onDrop={e => { e.preventDefault(); setSurvol(false); ajouter(e.dataTransfer.files) }}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${survol ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
        >
          <p className="text-xs font-medium text-foreground">{survol ? t('import.lache') : t('import.depose')}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{t('import.deposeSous')}</p>
          <input ref={inputRef} type="file" multiple accept={EXTENSIONS} hidden onChange={e => ajouter(e.target.files)} />
        </div>
        {fichiers.length === 0 && <p className="text-[10px] leading-snug text-muted-foreground">{t('import.coffre')}</p>}
        {fichiers.map(carteFichier)}
        {(quota || epuisees) && (
          <p className="text-[10px] text-muted-foreground">{epuisees ? t('import.epuisees') : phraseQuota(quota!)}</p>
        )}
        {fichiers.length > 0 && (
          <>
            {sansCompte > 0 && !lectureEnCours && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">{tp('import.attendCompte1', 'import.attendCompte', sansCompte)}</p>
            )}
            <button
              onClick={() => void ranger()}
              disabled={etape === 'rangement' || lectureEnCours || aRanger === 0}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {etape === 'rangement' && <Loader2 size={12} className="animate-spin" />}
              {etape === 'rangement' ? t('import.enRangement') : aRanger > 0 ? tp('import.ranger1', 'import.ranger', aRanger) : t('import.rien')}
            </button>
          </>
        )}
      </>
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/40 flex items-start justify-center pt-16 px-3"
      onMouseDown={() => { if (etape !== 'rangement') onClose() }}
    >
      <div
        className="w-full max-w-sm max-h-[calc(100vh-5rem)] overflow-y-auto bg-background border border-border rounded-xl shadow-lg p-4 space-y-3"
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-label={titre}
      >
        <div className="flex items-center gap-2">
          <FileUp size={16} className="text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground flex-1 truncate">{etape === 'rapport' ? t('import.rapportTitre') : titre}</span>
          <button onClick={onClose} disabled={etape === 'rangement'} className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40" aria-label={t('import.fermer')}>
            <X size={14} />
          </button>
        </div>
        {corps()}
      </div>
    </div>,
    document.body,
  )
}

export default ImportTradesDialog
