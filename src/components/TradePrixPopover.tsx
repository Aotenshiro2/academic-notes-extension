import React, { useState } from 'react'
import { Crosshair, Link2 } from 'lucide-react'
import type { TradePrix, TradeSegment } from '@/types/academic'
import { t } from '@/lib/i18n'
import type { PositionImportee } from '@/lib/positions-jour'
import { useComptesPilotage } from '@/lib/use-comptes-pilotage'
import TradePrevuBroker from './TradePrevuBroker'
import CadrePopoverTrade from './CadrePopoverTrade'
import PastilleInstrument from './PastilleInstrument'
import { heure, jourLong, texteDuLien } from './TradeLienPopover'

/**
 * Le panneau d'un trade de la note (pastille « Prix ») : 1.8.12, refait en
 * 1.8.13 d'après le labo du 03/11 (captures b-regle-jour et c-panneau).
 *
 * 1.8.16 (demande de Brice du 10/11) : le ratio en R y entre (la pastille
 * « R ? » quitte la rangée) et la liste « Lier » en sort, pour l'icône lien
 * de la rangée (TradeLienPopover). Il reste :
 * 1. « Ma position » : le prévu (saisi, reste dans le Carnet) et le R, face au
 *    broker (lu dans l'import, Pilotage ne lit que lui) ;
 * 2. une ligne qui dit si le trade est lié, et ouvre le lien d'un clic.
 */

interface TradePrixPopoverProps {
  position: { top: number; bottom: number; left: number }
  trade: TradeSegment
  numero: number
  /** L'instrument lu dans la note (adresse du graphique, titre) ; null quand rien ne le dit. */
  instrumentNote: string | null
  /** La capture automatique du lancement du trade (1.8.14, « Lire une capture »), s'il y en a une. */
  captureLancement?: string | null
  /** Les positions liées à ce trade (lues à l'ouverture de la note), pour la colonne broker. */
  lies: PositionImportee[]
  onSave: (prix: TradePrix | undefined, r: number | undefined) => void
  /** undefined : revenir à l'instrument lu dans la note ; '' : aucun filtre. */
  onSaveInstrument: (instrument: string | undefined) => void
  /** Ouvre le lien avec Pilotage (l'icône de la rangée) à la place de ce panneau. */
  onOuvrirLien: () => void
  onClose: () => void
}

function TradePrixPopover({ position, trade, numero, instrumentNote, captureLancement = null, lies, onSave, onSaveInstrument, onOuvrirLien, onClose }: TradePrixPopoverProps) {
  const etatComptes = useComptesPilotage()
  const comptes = etatComptes.etat === 'pret' ? etatComptes.comptes : []
  const [ouvert, setOuvert] = useState(true)

  const instrument = trade.instrument !== undefined ? (trade.instrument || null) : instrumentNote
  const titre = t('prix.titreJour', { n: numero, jour: `${jourLong(trade.startedAt)} ${heure(trade.startedAt)}` })
  const texteLien = texteDuLien(lies, comptes)

  return (
    <CadrePopoverTrade position={position} ariaLabel={titre} onClose={onClose}>
      <div className="flex items-center gap-1.5 min-w-0">
        <Crosshair size={13} className="text-blue-500 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">{titre}</span>
        <PastilleInstrument instrument={instrument} instrumentNote={instrumentNote} onSave={onSaveInstrument} />
      </div>

      <TradePrevuBroker
        prix={trade.prix}
        r={trade.r}
        lies={lies}
        ouvert={ouvert}
        onToggle={() => setOuvert(o => !o)}
        onSave={(prix, r) => { onSave(prix, r); onClose() }}
        instrument={instrument}
        captureLancement={captureLancement}
      />

      <div className="border-t border-border pt-2 flex items-center gap-1.5" data-prix-lien>
        <Link2 size={12} className={lies.length ? 'text-blue-500 flex-shrink-0' : 'text-muted-foreground flex-shrink-0'} />
        <span className="text-[11px] text-foreground flex-1 min-w-0 truncate" title={texteLien || undefined}>
          {lies.length ? texteLien : <span className="text-muted-foreground">{t('prix.pasLie')}</span>}
        </span>
        <button
          onClick={onOuvrirLien}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0"
        >
          {lies.length ? t('prix.voirLien') : t('prix.lier')}
        </button>
      </div>
    </CadrePopoverTrade>
  )
}

export default TradePrixPopover
