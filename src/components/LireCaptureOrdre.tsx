import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardPaste, ImagePlus, Loader2, LogIn, ExternalLink, X, Camera } from 'lucide-react'
import { t } from '@/lib/i18n'
import { getBearerToken } from '@/lib/auth'
import { compressImage } from '@/lib/image-utils'
import { demanderConnexion, lireOrdre, ouvrirPilotage } from '@/lib/pilotage-api'
import { reductionAvantEnvoi, type LectureOrdre } from '@/lib/prix-trade'
import type { Quota } from '@/lib/documents-lecture'

/**
 * « Lire une capture » (1.8.14, brief C5) : le membre dépose ou colle une
 * capture de son panneau d'ordre de TradingView (ou de l'outil Position), ou
 * prend en un clic la capture automatique du lancement du trade. Le journal
 * la fait lire par l'IA (une lecture du palier, comme l'import) ; la carte se
 * remplit et le membre vérifie avant d'enregistrer. Rien n'est enregistré ici.
 *
 * Sans connexion : l'écran dit comment l'obtenir, la saisie reste à la main.
 * 429 : le quota du palier ; 413 : réduite une seconde fois, puis le message.
 */

const LIBELLES_PALIER = { libre: 'ordre.palierLibre', premium: 'ordre.palierPremium', equipe: 'ordre.palierEquipe' } as const

type Etat =
  | { etape: 'verification' }
  | { etape: 'choix' }
  | { etape: 'lecture'; apercu: string }
  | { etape: 'erreur'; erreur: 'non-connecte' | 'epuisees' | 'trop-lourd' | 'indisponible' | 'refus' | 'reseau' | 'image'; message?: string | null; quota?: Quota | null }

interface LireCaptureOrdreProps {
  /** La capture automatique du lancement du trade (data URL ou adresse), s'il y en a une. */
  captureLancement: string | null
  onLecture: (lecture: LectureOrdre, quota: Quota | null) => void
  onFermer: () => void
}

const lireFichier = (f: Blob) => new Promise<string>((resolve, reject) => {
  const lecteur = new FileReader()
  lecteur.onload = () => resolve(String(lecteur.result))
  lecteur.onerror = () => reject(lecteur.error)
  lecteur.readAsDataURL(f)
})

/** Une data URL telle quelle ; une adresse (image déjà synchronisée) est relue en data URL. */
async function enDataUrl(source: string): Promise<string> {
  if (source.startsWith('data:')) return source
  const reponse = await fetch(source)
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
  return lireFichier(await reponse.blob())
}

const typeDe = (dataUrl: string) => /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? ''
const base64De = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1)

/** La phrase du quota après une lecture, comme le compteur de Pilotage. */
export function phraseQuotaOrdre(quota: Quota | null): string | null {
  if (!quota) return null
  if (quota.limite === null) return t('ordre.quotaSansLimite')
  const lues = Math.min(Math.max(0, quota.utilisees), quota.limite)
  return t('ordre.quota', { lues, limite: quota.limite })
}

function LireCaptureOrdre({ captureLancement, onLecture, onFermer }: LireCaptureOrdreProps) {
  const [etat, setEtat] = useState<Etat>({ etape: 'verification' })
  const [survol, setSurvol] = useState(false)
  const fichierRef = useRef<HTMLInputElement>(null)
  const enCours = useRef(false)

  // Connecté ? Vérifié à l'ouverture (le geste), pour expliquer tout de suite comment l'obtenir.
  useEffect(() => {
    let vivant = true
    void getBearerToken().then(jeton => { if (vivant) setEtat(jeton ? { etape: 'choix' } : { etape: 'erreur', erreur: 'non-connecte' }) })
    return () => { vivant = false }
  }, [])

  const lire = useCallback(async (source: string) => {
    if (enCours.current) return
    enCours.current = true
    try {
      let image: string
      try {
        image = await enDataUrl(source)
      } catch {
        setEtat({ etape: 'erreur', erreur: 'image' }); return
      }
      if (!typeDe(image).startsWith('image/')) { setEtat({ etape: 'erreur', erreur: 'image' }); return }
      setEtat({ etape: 'lecture', apercu: image })
      for (const essai of [0, 1] as const) {
        const reduction = reductionAvantEnvoi({ longueurBase64: base64De(image).length, type: typeDe(image), essai })
        if (reduction) {
          try {
            image = await compressImage(image, { maxWidth: reduction.maxWidth, maxHeight: 100_000, quality: reduction.quality, format: 'jpeg' })
          } catch {
            setEtat({ etape: 'erreur', erreur: 'image' }); return
          }
        }
        const r = await lireOrdre(image)
        if (r.ok && r.lecture) { onLecture(r.lecture, r.quota); return }
        if (r.erreur === 'trop-lourd' && essai === 0) continue
        setEtat({ etape: 'erreur', erreur: r.erreur ?? 'refus', message: r.message, quota: r.quota }); return
      }
    } finally {
      enCours.current = false
    }
  }, [onLecture])

  const depuisFichiers = useCallback((fichiers: FileList | File[] | null | undefined) => {
    const image = Array.from(fichiers ?? []).find(f => f.type.startsWith('image/'))
    if (!image) { if (fichiers && Array.from(fichiers).length) setEtat({ etape: 'erreur', erreur: 'image' }); return }
    void lireFichier(image).then(lire, () => setEtat({ etape: 'erreur', erreur: 'image' }))
  }, [lire])

  // Coller (Ctrl+V) tant que la zone attend une capture.
  useEffect(() => {
    if (etat.etape !== 'choix') return
    const coller = (e: ClipboardEvent) => {
      const fichiers = Array.from(e.clipboardData?.items ?? []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter((f): f is File => !!f)
      if (!fichiers.some(f => f.type.startsWith('image/'))) return
      e.preventDefault()
      depuisFichiers(fichiers)
    }
    document.addEventListener('paste', coller)
    return () => document.removeEventListener('paste', coller)
  }, [etat.etape, depuisFichiers])

  const entete = (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-foreground flex-1">{t('ordre.titre')}</span>
      <button onClick={onFermer} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted" aria-label={t('ordre.fermer')}>
        <X size={11} />
      </button>
    </div>
  )

  const corps = () => {
    switch (etat.etape) {
      case 'verification':
        return <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 size={10} className="animate-spin" />{t('ordre.verification')}</p>
      case 'lecture':
        return (
          <div className="flex items-center gap-2" role="status">
            <img src={etat.apercu} alt="" className="w-14 h-10 object-cover rounded border border-border flex-shrink-0" />
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 size={11} className="animate-spin text-purple-500" />{t('ordre.lecture')}</p>
          </div>
        )
      case 'erreur': {
        if (etat.erreur === 'non-connecte') {
          return (
            <div className="space-y-1.5">
              <p className="text-[10px] leading-snug text-muted-foreground">{t('ordre.nonConnecte')}</p>
              <button onClick={() => { demanderConnexion(); onFermer() }} className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline">
                <LogIn size={10} />{t('prix.meConnecter')}
              </button>
            </div>
          )
        }
        if (etat.erreur === 'epuisees') {
          const q = etat.quota
          const texte = q?.palier && q.limite !== null
            ? t('ordre.epuiseesPalier', { palier: t(LIBELLES_PALIER[q.palier]), limite: q.limite })
            : t('ordre.epuisees')
          return (
            <div className="space-y-1.5" data-ordre-erreur="epuisees">
              <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-300">{texte}</p>
              {q?.palier !== 'premium' && q?.palier !== 'equipe' && (
                <button onClick={() => ouvrirPilotage('/offres')} className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline">
                  <ExternalLink size={10} />{t('ordre.voirOffres')}
                </button>
              )}
            </div>
          )
        }
        const texte = etat.erreur === 'trop-lourd' ? t('ordre.tropLourd')
          : etat.erreur === 'image' ? t('ordre.pasUneImage')
          : etat.erreur === 'reseau' ? t('ordre.reseau')
          : etat.erreur === 'indisponible' ? t('ordre.indisponible')
          : etat.message || t('ordre.refus')
        return (
          <div className="space-y-1.5" data-ordre-erreur={etat.erreur}>
            <p className="text-[10px] leading-snug text-red-600 dark:text-red-400">{texte}</p>
            {etat.erreur !== 'indisponible' && (
              <button onClick={() => setEtat({ etape: 'choix' })} className="text-[10px] font-medium text-primary hover:underline">{t('ordre.reessayer')}</button>
            )}
          </div>
        )
      }
      case 'choix':
        return (
          <div className="space-y-1.5">
            <button
              onClick={() => fichierRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setSurvol(true) }}
              onDragLeave={() => setSurvol(false)}
              onDrop={e => { e.preventDefault(); setSurvol(false); depuisFichiers(e.dataTransfer.files) }}
              className={`w-full flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-lg border border-dashed text-center transition-colors ${
                survol ? 'border-purple-500/70 bg-purple-500/10' : 'border-border hover:bg-muted/50'
              }`}
              data-ordre-zone
            >
              <span className="flex items-center gap-1 text-[11px] font-medium text-foreground"><ImagePlus size={12} />{t('ordre.deposer')}</span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><ClipboardPaste size={10} />{t('ordre.coller')}</span>
            </button>
            <input ref={fichierRef} type="file" accept="image/*" className="hidden" onChange={e => { depuisFichiers(e.target.files); e.target.value = '' }} />
            {captureLancement && (
              <button
                onClick={() => void lire(captureLancement)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded-lg border border-border hover:bg-muted/50 text-left"
              >
                <img src={captureLancement} alt="" className="w-10 h-7 object-cover rounded flex-shrink-0" />
                <span className="flex items-center gap-1 text-[10px] font-medium text-foreground"><Camera size={10} />{t('ordre.captureLancement')}</span>
              </button>
            )}
            <p className="text-[10px] leading-snug text-muted-foreground/80">{t('ordre.aide')}</p>
          </div>
        )
    }
  }

  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-2 space-y-1.5" data-ordre-etape={etat.etape}>
      {entete}
      {corps()}
    </div>
  )
}

export default LireCaptureOrdre
