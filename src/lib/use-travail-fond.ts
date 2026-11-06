import { useEffect, useRef, useState } from 'react'
import storage from './storage'
import { forceSyncAll } from './sync'
import { envoyerActivite } from './activite-sync'
import { obtenirNoteMentorat, desepinglerSiPlusDeMentorat } from './note-mentorat'
import { notesEnAttenteDeSync } from './ecrans-carnet'
import { prendreTravailDeFond, type Verrous } from './travail-fond'
import type { AccesCompte } from './use-session-carnet'
import type { NoteSummary } from '../types/academic'

/**
 * Le travail de fond, partagé par le panneau latéral et le plein écran (1.8.15),
 * fait par UNE seule vue à la fois (verrou : travail-fond.ts). Sorti de
 * sidepanel/App.tsx, à l'identique, et jamais par minuterie : tout part de
 * l'ouverture de la vue, de la connexion lue, ou d'une relecture des notes
 * (qui suit toujours un geste ou un changement venu de l'autre vue).
 *
 * Rend `true` quand cette vue tient le travail de fond.
 */
export function useTravailDeFond({ connecte, acces, notes, notesChargees, recharger }: {
  connecte: boolean | null
  acces: AccesCompte
  notes: NoteSummary[]
  /** Faux tant que la première lecture des notes n'est pas finie : une liste vide n'est pas « aucune note ». */
  notesChargees: boolean
  /** Relire les notes après un travail qui les a changées. */
  recharger: () => void | Promise<void>
}): boolean {
  const [detient, setDetient] = useState(false)
  const rechargerRef = useRef(recharger)
  rechargerRef.current = recharger

  useEffect(() => {
    const verrous = typeof navigator !== 'undefined' ? (navigator.locks as unknown as Verrous | undefined) : undefined
    return prendreTravailDeFond(verrous, () => {
      // Une ligne dans la console de la vue : savoir laquelle travaille, au diagnostic.
      console.info('[AOK] Travail de fond : pris par cette vue')
      setDetient(true)
    })
  }, [])

  // Rattrapage de la synchronisation. L'envoi automatique à l'enregistrement
  // échoue en silence si la session est absente ou expirée à ce moment-là, et
  // rien ne réessayait ensuite : les notes restaient « à synchroniser »
  // jusqu'au clic manuel (bug signalé par Brice le 17/07). Dès que la vue qui
  // tient le travail de fond est connectée avec des notes en attente, elle les
  // renvoie, une seule fois.
  const rattrapageFait = useRef(false)
  const enAttente = notesEnAttenteDeSync(notes)
  useEffect(() => {
    if (!detient || rattrapageFait.current || connecte !== true || enAttente === 0) return
    rattrapageFait.current = true
    const pending = notes.filter(n => !n.lastSyncAt && !n.syncExcluded)
    console.log(`[AOK AutoSync] Rattrapage de ${pending.length} note(s) en attente`)
    forceSyncAll(pending, (id) => storage.updateNote(id, { lastSyncAt: Date.now() }))
      .then(r => { if (r.synced > 0) void rechargerRef.current() })
      .catch(err => console.warn('[AOK AutoSync] Rattrapage échoué:', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detient, connecte, enAttente])

  // Compteurs d'activité vers le journal (1.8.10) : à chaque relecture des
  // notes, au plus un essai toutes les 15 minutes, seulement connecté et sync
  // active, jamais de contenu (règles dans activite-sync.ts).
  useEffect(() => {
    if (detient && notesChargees) void envoyerActivite(notes)
  }, [detient, notesChargees, notes])

  // La note « Mentorat AOK ». Créée dès l'ouverture pour ceux qui y ont droit :
  // elle est épinglée en tête de l'historique, elle doit y être AVANT qu'on la
  // cherche. Déconnecté, ou connecté sans mentorat (niveau libre, abonnement
  // terminé) : ni supprimée ni cachée (elle contient ce que l'élève a écrit),
  // mais désépinglée, elle redescend dans l'ordre chronologique.
  useEffect(() => {
    if (!detient) return
    if (connecte !== true) {
      desepinglerSiPlusDeMentorat().then(() => rechargerRef.current()).catch(() => { /* pas bloquant */ })
      return
    }
    if (!acces.lu) return
    const geste = acces.etude ? obtenirNoteMentorat() : desepinglerSiPlusDeMentorat()
    geste.then(() => rechargerRef.current()).catch(err => console.warn('[mentorat] note indisponible', err))
  }, [detient, connecte, acces.lu, acces.etude])

  return detient
}
