import { useCallback, useRef, useState } from 'react'
import { getBearerToken } from './auth'
import { etatComptes, lireListeComptes, userIdCarnet } from './pilotage-api'
import { compressImage } from './image-utils'
import { normaliseLecture, type TradeNormalise } from './documents-lecture'
import { t } from './i18n'
import { toast } from './toast'
import {
  CLE_LECTURES_FAITES, choisirTableauTrades, dejaLue, empreinteTableau, normaliseReleve, noterLue,
  type LectureFaite, type ReleveTradesPage,
} from './trades-page'

/**
 * Après une capture intelligente (1.10.0) : la page montre-t-elle des trades
 * fermés à ranger dans Pilotage ? Le panneau et le plein écran appellent
 * `proposer` avec le résultat de la capture et sa capture d'écran ; si oui, la
 * boîte « Les trades de cette page » s'ouvre (TradesDeLaPage).
 *
 * Rien ne s'ouvre, en silence, quand le membre n'est pas connecté ou que le
 * Carnet ne connaît aucun compte Pilotage : la capture d'une page de trades
 * reste alors une note, comme avant. La même page déjà lue dans les 12 h ne
 * recompte pas une lecture : un petit message le dit.
 * Tout se décide au geste de la capture : ni minuterie ni relecture en fond.
 */

export type DemandeTradesPage = {
  id: number
  /** La capture d'écran (data URL JPEG), celle qui part à la lecture et au coffre. */
  image: string
  url: string
  releve: ReleveTradesPage
  /** Les lignes du tableau relevé dans la page (pour dire qu'il en reste au-delà de la lecture). */
  lignesVues: number
  empreinte: string
  /** Porte ouverte : des trades lus sans IA par la stratégie du site (aucune en 1.10.0). */
  directs: TradeNormalise[] | null
}

/** 3 Mo de base64 au plus : au-delà (écran 4K), la capture est réduite avant de partir (limite du journal : 4,4 Mo). */
const BASE64_MAX_AVANT_REDUCTION = 3_000_000

export async function imagePourLecture(dataUrl: string): Promise<string> {
  if (dataUrl.length <= BASE64_MAX_AVANT_REDUCTION) return dataUrl
  try {
    return await compressImage(dataUrl, { maxWidth: 2200, maxHeight: 2200, quality: 0.85, format: 'jpeg' })
  } catch {
    return dataUrl
  }
}

async function lirelues(): Promise<LectureFaite[]> {
  try {
    const r = await chrome.storage.local.get(CLE_LECTURES_FAITES)
    return Array.isArray(r?.[CLE_LECTURES_FAITES]) ? r[CLE_LECTURES_FAITES] as LectureFaite[] : []
  } catch {
    return []
  }
}

/** La lecture de ce tableau est faite : la même page, relue dans les 12 h, ne repart pas. */
export async function marquerLue(empreinte: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [CLE_LECTURES_FAITES]: noterLue(await lirelues(), empreinte, Date.now()) })
  } catch { /* rien : au pire, une relecture */ }
}

export function useTradesDeLaPage() {
  const [demande, setDemande] = useState<DemandeTradesPage | null>(null)
  const compteur = useRef(0)

  const proposer = useCallback(async (resultat: unknown, image: string | null | undefined): Promise<void> => {
    try {
      if (!image || !resultat || typeof resultat !== 'object') return
      const r = resultat as { tradesPage?: unknown; tradesDirects?: unknown; url?: unknown }
      const releve = normaliseReleve(r.tradesPage)
      const directs = Array.isArray(r.tradesDirects) && r.tradesDirects.length
        ? normaliseLecture({ type: 'trades', methode: 'csv', confiance: 1, trades: r.tradesDirects }).trades ?? null
        : null
      if (!releve) return
      const choix = choisirTableauTrades(releve.tableaux)
      if (!choix && !directs?.length) return

      // Sans compte AOK ni comptes Pilotage, rien à ranger : la note suffit.
      if (!(await getBearerToken())) return
      const comptes = etatComptes(await lireListeComptes(), await userIdCarnet())
      if (comptes.etat !== 'pret') return

      const empreinte = choix ? empreinteTableau(choix.tableau) : `directs-${directs!.length}`
      if (dejaLue(await lirelues(), empreinte, Date.now())) {
        toast.info(t('tradesPage.dejaLue'))
        return
      }
      setDemande({
        id: ++compteur.current,
        image: await imagePourLecture(image),
        url: typeof r.url === 'string' ? r.url : '',
        releve,
        lignesVues: choix?.tableau.lignes.length ?? 0,
        empreinte,
        directs,
      })
    } catch (e) {
      // Une proposition qui échoue ne gêne jamais la capture : la note est faite.
      console.warn('[trades de la page]', e)
    }
  }, [])

  const fermer = useCallback(() => setDemande(null), [])

  return { demande, proposer, fermer }
}
