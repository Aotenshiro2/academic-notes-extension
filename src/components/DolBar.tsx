import React, { useState } from 'react'
import { Magnet, Plus, X, ArrowUp, ArrowDown } from 'lucide-react'
import type { DolLevel, DolBias, DolStatus } from '@/types/academic'
import { t, type CleI18n } from '@/lib/i18n'

// Barre DOL — Draw on Liquidity (ICT / Smart Money). Épinglée en haut de la note :
// on pose son/ses niveaux pendant l'analyse HTF, ils restent sous les yeux pendant
// toute la séance pour ne pas perdre la direction une fois plongé dans les LTF.
// Clic sur le statut = cycle actif → atteint → invalidé → actif.

const NEXT_STATUS: Record<DolStatus, DolStatus> = {
  actif: 'atteint',
  atteint: 'invalide',
  invalide: 'actif',
}

// Clés du dictionnaire, traduites au rendu. Le biais stocké (« haussier »,
// « baissier ») est une donnée : seul son affichage passe par la traduction.
const STATUS_LABEL: Record<DolStatus, CleI18n> = {
  actif: 'dol.actif',
  atteint: 'dol.atteint',
  invalide: 'dol.invalide',
}

const BIAS_LABEL: Record<DolBias, CleI18n> = {
  haussier: 'dol.haussier',
  baissier: 'dol.baissier',
}

const STATUS_CHIP_CLASS: Record<DolStatus, string> = {
  actif: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  atteint: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400',
  invalide: 'border-border bg-muted/50 text-muted-foreground line-through',
}

interface DolBarProps {
  dols: DolLevel[]
  onAdd: (dol: Omit<DolLevel, 'id' | 'createdAt' | 'status'>) => void
  onCycleStatus: (dolId: string) => void
  onDelete: (dolId: string) => void
}

export default function DolBar({ dols, onAdd, onCycleStatus, onDelete }: DolBarProps) {
  const [adding, setAdding] = useState(false)
  const [price, setPrice] = useState('')
  const [bias, setBias] = useState<DolBias>('baissier')
  const [instrument, setInstrument] = useState('')
  const [comment, setComment] = useState('')

  const reset = () => {
    setAdding(false)
    setPrice('')
    setInstrument('')
    setComment('')
  }

  const submit = () => {
    if (!price.trim()) { reset(); return }
    onAdd({
      price: price.trim(),
      bias,
      instrument: instrument.trim() || undefined,
      comment: comment.trim() || undefined,
    })
    reset()
  }

  if (dols.length === 0 && !adding) {
    // Lanceur compact et discret (pas de gros bloc en tête de note)
    return (
      <button
        onClick={() => setAdding(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-violet-600/80 dark:text-violet-400/80 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
        title={t('dol.poserAide')}
      >
        <Magnet size={13} className="flex-shrink-0" />
        {t('capture.dol')}
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Magnet size={13} className="text-violet-500 flex-shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">DOL</span>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">{t('dol.sousTitre')}</span>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-violet-600/70 dark:text-violet-400/70 hover:text-violet-600 dark:hover:text-violet-400 rounded-full hover:bg-violet-500/10 transition-colors"
            title={t('dol.ajouterNiveau')}
          >
            <Plus size={10} />
            <span>{t('dol.niveau')}</span>
          </button>
        )}
      </div>

      {dols.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {dols.map(dol => (
            <span
              key={dol.id}
              className={`group inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 text-[11px] rounded-full border transition-colors ${STATUS_CHIP_CLASS[dol.status]}`}
            >
              {dol.bias === 'haussier'
                ? <ArrowUp size={11} className="flex-shrink-0 text-green-600 dark:text-green-400" />
                : <ArrowDown size={11} className="flex-shrink-0 text-red-600 dark:text-red-400" />}
              {dol.instrument && <span className="font-semibold">{dol.instrument}</span>}
              <span className="font-medium">{dol.price}</span>
              {dol.comment && <span className="opacity-75 max-w-[180px] truncate">— {dol.comment}</span>}
              <button
                onClick={() => onCycleStatus(dol.id)}
                className="ml-0.5 px-1 py-0 text-[9px] uppercase tracking-wide rounded-full border border-current/30 opacity-70 hover:opacity-100 transition-opacity"
                title={t('dol.statutAide', { statut: t(STATUS_LABEL[dol.status]) })}
              >
                {t(STATUS_LABEL[dol.status])}
              </button>
              <button
                onClick={() => onDelete(dol.id)}
                className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity leading-none"
                title={t('dol.supprimerNiveau')}
                aria-label={t('dol.supprimerNiveauDol')}
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {adding && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <button
            onClick={() => setBias(b => (b === 'haussier' ? 'baissier' : 'haussier'))}
            className={`flex items-center gap-0.5 px-1.5 py-1 text-[11px] rounded-md border border-border hover:bg-muted transition-colors ${
              bias === 'haussier' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}
            title={t('dol.biaisAide')}
          >
            {bias === 'haussier' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {t(BIAS_LABEL[bias])}
          </button>
          <input
            value={instrument}
            onChange={e => setInstrument(e.target.value)}
            placeholder={t('dol.instrumentPlaceholder')}
            className="w-16 px-2 py-1 text-[12px] bg-background border border-border rounded-md outline-none focus:border-violet-500/50"
          />
          <input
            autoFocus
            value={price}
            onChange={e => setPrice(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              if (e.key === 'Escape') reset()
            }}
            placeholder={t('dol.prixPlaceholder')}
            className="w-28 px-2 py-1 text-[12px] bg-background border border-border rounded-md outline-none focus:border-violet-500/50"
          />
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              if (e.key === 'Escape') reset()
            }}
            placeholder={t('dol.commentairePlaceholder')}
            className="flex-1 min-w-[120px] px-2 py-1 text-[12px] bg-background border border-border rounded-md outline-none focus:border-violet-500/50"
          />
          <button
            onClick={submit}
            className="px-2 py-1 text-[11px] font-medium rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25 transition-colors"
          >
            {t('dol.poser')}
          </button>
          <button
            onClick={reset}
            className="p-1 text-muted-foreground/60 hover:text-foreground"
            aria-label={t('commun.annuler')}
          >
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  )
}
