import React, { useState } from 'react'
import { t } from '@/lib/i18n'
import { normaliserInstrument } from '@/lib/instrument'

/**
 * La pastille de l'instrument d'un trade (1.8.13), dans l'en-tête de « Prix »
 * et du lien avec Pilotage (1.8.16) : elle filtre les trades du broker et
 * donne le pas de cotation des ticks. Un clic la rend modifiable ; vide = tous
 * les instruments ; revenir à celui de la note = undefined.
 */

interface PastilleInstrumentProps {
  /** L'instrument retenu pour le trade (choisi, sinon celui de la note) ; null = tous. */
  instrument: string | null
  /** L'instrument lu dans la note (adresse du graphique, titre). */
  instrumentNote: string | null
  onSave: (instrument: string | undefined) => void
}

function PastilleInstrument({ instrument, instrumentNote, onSave }: PastilleInstrumentProps) {
  const [edition, setEdition] = useState(false)
  const [brouillon, setBrouillon] = useState('')

  const enregistrer = () => {
    const brut = brouillon.trim()
    const valeur = brut ? (normaliserInstrument(brut) ?? brut.toUpperCase()) : ''
    onSave(valeur === (instrumentNote ?? '') ? undefined : valeur)
    setEdition(false)
  }

  if (edition) {
    return (
      <input
        autoFocus
        value={brouillon}
        onChange={e => setBrouillon(e.target.value.toUpperCase())}
        onBlur={enregistrer}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); enregistrer() }
          if (e.key === 'Escape') { e.stopPropagation(); setEdition(false) }
        }}
        placeholder={t('prix.instrumentPlaceholder')}
        aria-label={t('prix.instrumentAide')}
        className="w-16 px-1.5 py-0 text-[10px] text-center bg-muted/40 border border-border rounded-full focus:outline-none focus:border-primary/50"
      />
    )
  }
  return (
    <button
      onClick={() => { setBrouillon(instrument ?? ''); setEdition(true) }}
      className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 transition-colors ${
        instrument ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'border border-dashed border-muted-foreground/60 text-muted-foreground hover:text-foreground'
      }`}
      title={t('prix.instrumentAide')}
      aria-label={t('prix.instrumentAide')}
    >
      {instrument ?? t('prix.instrumentTous')}
    </button>
  )
}

export default PastilleInstrument
