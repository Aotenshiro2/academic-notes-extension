import { useCallback, useEffect, useRef, useState } from 'react'
import type { TradeSegment } from '@/types/academic'
import { fetchPositions } from './pilotage-api'
import { bornesDesTrades, liesAuTrade } from './lien-trade'
import type { PositionImportee } from './positions-jour'

/**
 * Les liens des trades clos d'une note avec les trades importés de Pilotage
 * (1.8.16) : ce que l'icône lien de la rangée montre (pleine = liée).
 *
 * Lus au geste, jamais par minuterie (règle de Brice du 05/11) : à
 * l'ouverture de la note, quand un trade est clos ou change de date, et après
 * un lien posé ou retiré (`recharger`). Une seule requête par lecture, sur les
 * jours des trades (lien-trade.ts). Sans session, rien ne part : l'état dit
 * « non-connecte ».
 */
export type EtatLiens = 'chargement' | 'pret' | 'non-connecte' | 'reseau'

export function useLiensTrades(trades: TradeSegment[] | null | undefined) {
  const [etat, setEtat] = useState<EtatLiens>('chargement')
  const [positions, setPositions] = useState<PositionImportee[]>([])
  const demande = useRef(0)

  // La clé : les trades clos et leur heure. Un nouveau bloc dans la note ne relance rien.
  const clos = (trades ?? []).filter(t => t.closedAt)
  const cle = clos.map(t => `${t.id}@${t.startedAt}`).join(',')

  const recharger = useCallback(async () => {
    const numero = ++demande.current
    const bornes = bornesDesTrades(clos)
    if (!bornes) {
      setPositions([])
      setEtat('pret')
      return
    }
    const r = await fetchPositions(bornes)
    // Une réponse arrivée après une autre demande (autre note) ne compte plus.
    if (numero !== demande.current) return
    if (r.error) {
      setPositions([])
      setEtat(r.error)
      return
    }
    setPositions(r.positions ?? [])
    setEtat('pret')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  useEffect(() => {
    setEtat('chargement')
    void recharger()
  }, [recharger])

  const liesDe = useCallback((tradeId: string) => liesAuTrade(positions, tradeId), [positions])

  return { etat, liesDe, recharger }
}
