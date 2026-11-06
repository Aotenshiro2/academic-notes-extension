import { useEffect, useState } from 'react'
import { t } from './i18n'
import { memoireBrouillon, signalerFriction } from './besoins'
import { bulleDejaVue, codeDeSync, composerPrerempli, marquerBulleVue, type CleSignal } from './besoins-decouverte'
import { EVENEMENT_OUVRIR_COMPTE } from './pilotage-api'
import {
  AUCUN_ECRAN, LIGNES_FRICTION, basculerEcran, ouvrirEcran,
  type EcranCarnet, type EtatEcrans, type FocusReglage,
} from './ecrans-carnet'

/**
 * L'écran ouvert (Compte, Paramètres, Mentorat, Support...) et ce que le pied
 * en montre, partagés par le panneau latéral et le plein écran (1.8.15).
 * Règles : ecrans-carnet.ts. Rendu : EcransCarnet et PiedCarnet.
 *
 * Avec les écrans, les besoins des membres (06/11) : la ligne d'une friction
 * (piste C), la clé qui part avec la demande pré-remplie, et la bulle de
 * découverte de « Aide et idées » (piste B). Tout part d'un geste ou d'un
 * échec : aucune minuterie.
 */
export function useEcransCarnet() {
  const [etat, setEtat] = useState<EtatEcrans>(AUCUN_ECRAN)
  // La friction rencontrée (ligne C), la clé qui part avec la demande
  // pré-remplie, et un compteur qui remonte le Support à chaque ouverture
  // pré-remplie (le formulaire relit alors le brouillon).
  const [friction, setFriction] = useState<CleSignal | null>(null)
  const [signalBesoin, setSignalBesoin] = useState<CleSignal | null>(null)
  const [ouvertureBesoin, setOuvertureBesoin] = useState(0)
  const [bulleAide, setBulleAide] = useState(false)
  useEffect(() => { setBulleAide(!bulleDejaVue()) }, [])

  const ouvrir = (ecran: EcranCarnet, options?: { supportBesoin?: boolean; focusReglage?: FocusReglage }) =>
    setEtat(ouvrirEcran(ecran, options))
  const fermer = () => setEtat(AUCUN_ECRAN)

  // « Me connecter » (boîte d'import, panneau d'un trade, « Lire une capture ») : l'écran Compte, dans la vue même.
  useEffect(() => {
    const surDemande = () => setEtat(ouvrirEcran('compte'))
    window.addEventListener(EVENEMENT_OUVRIR_COMPTE, surDemande)
    return () => window.removeEventListener(EVENEMENT_OUVRIR_COMPTE, surDemande)
  }, [])

  const fermerBulleAide = () => {
    if (bulleAide) marquerBulleVue()
    setBulleAide(false)
  }

  /** Un refus ou une impasse : le signal (une fois, en silence, connecté seulement) et la ligne C. */
  const frictionIci = (cle: CleSignal, contexte?: Record<string, unknown>) => {
    setFriction(cle)
    void signalerFriction(cle, contexte)
  }

  /** Une synchronisation lancée à la main qui laisse des notes en échec : le code du premier échec, jamais son texte. */
  const suivreSync = <R extends { failed: number; errors: Array<{ error: string }> }>(resultat: R): R => {
    if (resultat.failed > 0) frictionIci('carnet.sync_echec', { code: codeDeSync(resultat.errors[0]?.error) })
    return resultat
  }

  /** La ligne C : le Support s'ouvre sur « Il me manque quelque chose », la phrase posée dans le brouillon. */
  const ouvrirBesoinPrerempli = (cle: CleSignal) => {
    const actuel = memoireBrouillon.lire()
    memoireBrouillon.ecrire({ ...actuel, texte: composerPrerempli(t(LIGNES_FRICTION[cle].prerempli), actuel.texte) })
    setSignalBesoin(cle)
    setOuvertureBesoin(n => n + 1)
    setEtat(ouvrirEcran('support', { supportBesoin: true }))
    setFriction(null)
    marquerBulleVue()
    setBulleAide(false)
  }

  /** « Aide et idées », dans le pied : le Support sur le chat, ou refermé au second clic. */
  const basculerSupport = () => {
    fermerBulleAide()
    setSignalBesoin(null)
    setEtat(e => basculerEcran(e, 'support'))
  }

  return {
    ecran: etat.ecran,
    supportBesoin: etat.supportBesoin,
    focusReglage: etat.focusReglage,
    ouvrir,
    fermer,
    basculer: (ecran: EcranCarnet) => setEtat(e => basculerEcran(e, ecran)),
    basculerSupport,
    friction,
    masquerFriction: () => setFriction(null),
    frictionIci,
    suivreSync,
    signalBesoin,
    oublierSignal: () => setSignalBesoin(null),
    ouvertureBesoin,
    ouvrirBesoinPrerempli,
    bulleAide,
    fermerBulleAide,
  }
}

export type EcransCarnetEtat = ReturnType<typeof useEcransCarnet>
