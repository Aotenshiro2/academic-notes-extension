// Besoins des membres, lot 2 (06/11/2026) : « Il me manque quelque chose ».
//
// L'entrée vit dans la vue Support (bande sous l'en-tête) et dans le menu de
// la roue, juste après « Envoyer un diagnostic ». Langage du Carnet repris
// tel quel : bulles et champs du Support (rounded-xl, border-border,
// bg-muted), accent bleu du Support (LifeBuoy), encadrés d'état du
// Diagnostic (connecté ou non). La mise en page du formulaire est dessinée à
// la main dans ce langage. Appels et compression : lib/besoins.ts ; règles
// pures : lib/besoins-pur.ts.
//
// Aucune minuterie : « Déjà prévu » se lit à l'ouverture du formulaire.
import React, { useEffect, useRef, useState } from 'react'
import { ChevronRight, Lightbulb, MessageCircle, ImagePlus, Loader2, Check, CheckCircle2, X } from 'lucide-react'
import { t } from '@/lib/i18n'
import {
  compresserCapture, imageCollee, lirePrevus, memoireBrouillon, sessionBesoin, signalerBesoin, voterBesoin,
  type CaptureBesoin, type ReponsePrevus,
} from '@/lib/besoins'
import { cleMessageSignalement, texteEnvoyable, TEXTE_MAX, type BesoinPrevu } from '@/lib/besoins-pur'

/** La bande sous l'en-tête du Support : ouvre le formulaire, ou ramène au chat. */
export function EntreeBesoin({ actif, onClick }: { actif: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={actif}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/25 bg-blue-500/5 text-xs font-medium text-foreground hover:bg-blue-500/10 transition-colors text-left"
    >
      {actif
        ? <MessageCircle size={14} className="text-blue-500 flex-shrink-0" />
        : <Lightbulb size={14} className="text-blue-500 flex-shrink-0" />}
      <span className="flex-1">{actif ? t('besoin.retourChat') : t('besoin.entree')}</span>
      {!actif && <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />}
    </button>
  )
}

type EtatPrevus = { etat: 'chargement' } | ReponsePrevus

export function FormulaireBesoin({ onOpenAccount }: { onOpenAccount?: () => void }) {
  const [connecte, setConnecte] = useState<boolean | null>(null)
  const [texte, setTexte] = useState(() => memoireBrouillon.lire().texte)
  const [capture, setCapture] = useState<CaptureBesoin | null>(() => memoireBrouillon.lire().capture)
  const [prepCapture, setPrepCapture] = useState(false)
  const [erreurCapture, setErreurCapture] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [phrase, setPhrase] = useState<string | null>(null)
  const [prevus, setPrevus] = useState<EtatPrevus>({ etat: 'chargement' })
  const [votesEnCours, setVotesEnCours] = useState<string[]>([])
  const [erreurVote, setErreurVote] = useState<string | null>(null)
  const fichierRef = useRef<HTMLInputElement>(null)

  // À l'ouverture : la session, puis « Déjà prévu ». Une fois, jamais en fond.
  useEffect(() => {
    let vivant = true
    void (async () => {
      const ok = await sessionBesoin()
      if (!vivant) return
      setConnecte(ok)
      if (!ok) return
      const r = await lirePrevus()
      if (vivant) setPrevus(r)
    })()
    return () => { vivant = false }
  }, [])

  const changerTexte = (valeur: string) => {
    memoireBrouillon.ecrire({ ...memoireBrouillon.lire(), texte: valeur })
    setTexte(valeur)
  }

  const changerCapture = (c: CaptureBesoin | null) => {
    memoireBrouillon.ecrire({ ...memoireBrouillon.lire(), capture: c })
    setCapture(c)
  }

  const joindre = async (fichier: Blob) => {
    setErreurCapture(null)
    setPrepCapture(true)
    const r = await compresserCapture(fichier)
    setPrepCapture(false)
    // `in` plutôt que `r.ok` : le projet n'est pas en strictNullChecks, le booléen ne discrimine pas.
    if ('capture' in r) changerCapture(r.capture)
    else setErreurCapture(t(r.raison === 'lourde' ? 'besoin.captureLourde' : 'besoin.captureFormat'))
  }

  const coller = (e: React.ClipboardEvent) => {
    const image = imageCollee(e.clipboardData)
    if (!image) return
    e.preventDefault()
    void joindre(image)
  }

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (envoi || prepCapture || !texteEnvoyable(texte)) return
    setErreur(null)
    setEnvoi(true)
    const r = await signalerBesoin(texte, capture?.dataUrl)
    setEnvoi(false)
    if (r.etat === 'ok') {
      memoireBrouillon.ecrire({ texte: '', capture: null })
      setTexte('')
      setCapture(null)
      setPhrase(r.phrase ?? t('besoin.merciDefaut'))
    } else {
      setErreur(t(cleMessageSignalement(r.code), { code: r.code ?? '' }))
    }
  }

  const voter = async (b: BesoinPrevu) => {
    if (b.aVote || votesEnCours.includes(b.id)) return
    setErreurVote(null)
    setVotesEnCours(v => [...v, b.id])
    const r = await voterBesoin(b.id)
    setVotesEnCours(v => v.filter(id => id !== b.id))
    if (r.etat === 'ok') {
      setPrevus(p => p.etat === 'ok'
        ? { ...p, besoins: p.besoins.map(x => x.id === b.id ? { ...x, aVote: true, votes: r.votes >= 0 ? r.votes : x.votes + 1 } : x) }
        : p)
    } else {
      setErreurVote(t(r.etat === 'ferme' ? 'besoin.voteFerme' : r.etat === 'non-connecte' ? 'besoin.voteSession' : 'besoin.voteErreur'))
    }
  }

  if (connecte === null) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  // Sans session : la même invitation que l'écran du diagnostic.
  if (!connecte) {
    return (
      <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300" role="status">
        <p className="leading-relaxed">{t('besoin.nonConnecte')}</p>
        {onOpenAccount && (
          <button onClick={onOpenAccount} className="mt-1.5 font-medium underline-offset-2 hover:underline">
            {t('besoin.seConnecter')}
          </button>
        )}
      </div>
    )
  }

  if (phrase) {
    return (
      <div className="space-y-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10" role="status">
        <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{phrase}</p>
        <button
          onClick={() => setPhrase(null)}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          {t('besoin.autre')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <form onSubmit={e => void envoyer(e)} onPaste={coller} className="space-y-2.5">
        <label htmlFor="besoin-texte" className="block text-xs font-medium text-muted-foreground">
          {t('besoin.label')}
        </label>
        <textarea
          id="besoin-texte"
          value={texte}
          onChange={e => changerTexte(e.target.value)}
          rows={4}
          maxLength={TEXTE_MAX}
          placeholder={t('besoin.placeholder')}
          className="w-full resize-none text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        {texte.length > TEXTE_MAX - 400 && (
          <p className="text-right text-[10px] text-muted-foreground">{texte.length} / {TEXTE_MAX}</p>
        )}

        {/* Capture facultative : fichier, ou collage depuis le presse-papiers. */}
        {capture ? (
          <div className="flex items-center gap-2 p-1.5 rounded-lg border border-border bg-muted/40">
            <img src={capture.dataUrl} alt={t('besoin.captureAlt')} className="h-10 w-14 flex-shrink-0 rounded object-cover" />
            <span className="flex-1 text-[11px] text-muted-foreground">
              {t('besoin.captureJointe', { l: capture.largeur, h: capture.hauteur })}
            </span>
            <button
              type="button"
              onClick={() => changerCapture(null)}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              aria-label={t('besoin.retirer')}
              title={t('besoin.retirer')}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <button
              type="button"
              onClick={() => fichierRef.current?.click()}
              disabled={prepCapture}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {prepCapture ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              {prepCapture ? t('besoin.preparation') : t('besoin.joindre')}
            </button>
            <span className="text-[11px] text-muted-foreground">{t('besoin.coller')}</span>
          </div>
        )}
        <input
          ref={fichierRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void joindre(f)
          }}
        />
        {erreurCapture && <p className="text-xs text-red-600 dark:text-red-400">{erreurCapture}</p>}

        {erreur && (
          <p className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300" role="alert">
            {erreur}
          </p>
        )}

        <button
          type="submit"
          disabled={envoi || prepCapture || !texteEnvoyable(texte)}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {envoi && <Loader2 size={13} className="animate-spin" />}
          {envoi ? t('besoin.envoi') : t('besoin.envoyer')}
        </button>
      </form>

      {/* Déjà prévu : si le besoin y est, « Moi aussi » plutôt qu'un doublon. */}
      <section className="pt-3 border-t border-border/60" aria-label={t('besoin.prevuTitre')}>
        <h3 className="text-xs font-semibold text-foreground">{t('besoin.prevuTitre')}</h3>
        {prevus.etat === 'chargement' && <p className="mt-1.5 text-xs text-muted-foreground">{t('besoin.prevuChargement')}</p>}
        {prevus.etat === 'pas-encore' && <p className="mt-1.5 text-xs text-muted-foreground">{t('besoin.prevuPasEncore')}</p>}
        {(prevus.etat === 'erreur' || prevus.etat === 'non-connecte') && (
          <p className="mt-1.5 text-xs text-muted-foreground">{t('besoin.prevuErreur')}</p>
        )}
        {prevus.etat === 'ok' && prevus.besoins.length === 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">{t('besoin.prevuVide')}</p>
        )}
        {prevus.etat === 'ok' && prevus.besoins.length > 0 && (
          <>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{t('besoin.prevuAide')}</p>
            <ul className="mt-2 rounded-lg border border-border divide-y divide-border/60">
              {prevus.besoins.map(b => (
                <li key={b.id} className="flex items-start gap-2 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground leading-snug break-words">{b.titre}</p>
                    <p className="mt-0.5 flex gap-2 text-[10px] text-muted-foreground">
                      <span className="text-blue-600 dark:text-blue-400">
                        {t(b.statut === 'en_cours' ? 'besoin.statutEnCours' : 'besoin.statutPlanifie')}
                      </span>
                      {b.votes > 0 && <span>{b.votes} {t(b.votes > 1 ? 'besoin.votes' : 'besoin.vote')}</span>}
                    </p>
                  </div>
                  {b.aVote ? (
                    <span className="inline-flex flex-shrink-0 items-center gap-1 px-1.5 py-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                      <Check size={12} />
                      {t('besoin.note')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void voter(b)}
                      disabled={votesEnCours.includes(b.id)}
                      className="flex-shrink-0 px-2 py-1 text-[11px] font-medium rounded-md border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {t('besoin.moiAussi')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {erreurVote && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{erreurVote}</p>}
      </section>
    </div>
  )
}
