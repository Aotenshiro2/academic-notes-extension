import React, { useEffect, useState } from 'react'
import { X, Target } from 'lucide-react'
import storage from '@/lib/storage'
import { t, type CleI18n } from '@/lib/i18n'
import { calculerPointAttention, warmupAttendUnPoint, type CauseRecurrente } from '@/lib/point-attention'
import type { AnnotationCause, NoteWarmup } from '@/types/academic'

// Le point d'attention avant la séance (1.9.2), en tête de la carte du warmup,
// avant les questions. L'erreur qui revient le plus dans les derniers
// jugements du membre, avec ses propres mots. Pas d'IA : ses notes locales.
// Les règles : lib/point-attention.ts.

const UNE: Record<AnnotationCause, CleI18n> = {
  technique: 'attention.une.technique',
  connaissance: 'attention.une.connaissance',
  emotionnel: 'attention.une.emotionnel',
}
const NB: Record<AnnotationCause, CleI18n> = {
  technique: 'attention.nb.technique',
  connaissance: 'attention.nb.connaissance',
  emotionnel: 'attention.nb.emotionnel',
}
export const LIBELLE_CAUSE: Record<AnnotationCause, CleI18n> = {
  technique: 'attention.libelle.technique',
  connaissance: 'attention.libelle.connaissance',
  emotionnel: 'attention.libelle.emotionnel',
}
// Une question par cause (Brice, 11/11). À égalité, la question qui fait
// choisir (attention.laquelle) reste la même.
const QUESTION: Record<AnnotationCause, CleI18n> = {
  technique: 'attention.question.technique',
  connaissance: 'attention.question.connaissance',
  emotionnel: 'attention.question.emotionnel',
}

const BOUTON = 'inline-flex items-center rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors'

interface PointAttentionProps {
  warmup: NoteWarmup
  onSave: (patch: Partial<NoteWarmup>) => void
}

export default function PointAttention({ warmup, onSave }: PointAttentionProps) {
  const [causes, setCauses] = useState<CauseRecurrente[] | null>(null)
  const attend = warmupAttendUnPoint(warmup, Date.now())

  // Lu à l'ouverture de la carte, jamais en fond
  useEffect(() => {
    if (!attend || typeof warmup.startedAt !== 'number') return
    let vivant = true
    storage.getJugements()
      .then(jugements => { if (vivant) setCauses(calculerPointAttention(jugements, warmup.startedAt!)) })
      .catch(error => console.warn('[Warmup] Point d\'attention indisponible :', error))
    return () => { vivant = false }
  }, [attend, warmup.id, warmup.startedAt])

  if (!attend || !causes || causes.length === 0) return null

  const garder = (c: CauseRecurrente) => onSave({ attention: { garde: { cause: c.cause, phrase: c.phrase, le: Date.now() } } })
  const fermer = () => onSave({ attention: { fermeLe: Date.now() } })
  const egalite = causes.length > 1
  const n = causes[0].nombre

  return (
    <div
      role="note"
      aria-label={t('attention.etiquette')}
      data-point-attention={egalite ? 'egalite' : causes[0].cause}
      className="rounded-lg border border-amber-700/25 bg-amber-50 dark:border-amber-300/25 dark:bg-amber-400/10 px-3 py-2.5 space-y-2 text-[13px] leading-snug text-foreground"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">{t('attention.etiquette')}</span>
        <button
          onClick={fermer}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground"
          aria-label={t('commun.fermer')}
          title={t('commun.fermer')}
        >
          <X size={14} />
        </button>
      </div>

      {egalite ? (
        <>
          <p>{t(causes.length > 2 ? 'attention.egalite3' : 'attention.egalite2', { liste: causes.map(c => t(NB[c.cause], { n })).join(', ') })}</p>
          {causes.some(c => c.phrase) && <p className="text-muted-foreground">{t('attention.tesMots')}</p>}
          {causes.filter(c => c.phrase).map(c => (
            <blockquote key={c.cause} className="border-l-2 border-blue-500 pl-2.5 italic">
              {t('attention.citationCause', { cause: t(LIBELLE_CAUSE[c.cause]), phrase: c.phrase })}
            </blockquote>
          ))}
          <p className="font-semibold">{t('attention.laquelle')}</p>
          <div className="flex flex-wrap gap-2">
            {causes.map(c => (
              <button
                key={c.cause}
                onClick={() => garder(c)}
                data-garder={c.cause}
                className={`${BOUTON} border border-border bg-background hover:bg-muted text-foreground`}
              >
                {t(LIBELLE_CAUSE[c.cause])}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>{t(UNE[causes[0].cause], { n })}</p>
          {causes[0].phrase && (
            <>
              <p className="text-muted-foreground">{t('attention.tuAvaisEcrit')}</p>
              <blockquote className="border-l-2 border-blue-500 pl-2.5 italic">{t('attention.citation', { phrase: causes[0].phrase })}</blockquote>
            </>
          )}
          <p className="font-semibold">{t(QUESTION[causes[0].cause])}</p>
          <div>
            <button
              onClick={() => garder(causes[0])}
              data-garder={causes[0].cause}
              className={`${BOUTON} bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-400 dark:hover:bg-blue-300 dark:text-slate-900`}
            >
              {t('attention.garder')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** La pastille « En tête aujourd'hui », au-dessus de l'objectif du jour. */
export function PastilleAttention({ warmup }: { warmup?: NoteWarmup }) {
  const garde = warmup?.attention?.garde
  if (!garde) return null
  const texte = garde.phrase ? t('attention.citation', { phrase: garde.phrase }) : t(LIBELLE_CAUSE[garde.cause])
  return (
    <div
      data-pastille-attention={garde.cause}
      className="flex items-center gap-2 w-fit max-w-full rounded-full bg-blue-500/10 px-3 py-1 text-[12px] text-foreground"
      title={`${t('attention.pastille')} ${texte}`}
    >
      <Target size={13} className="flex-shrink-0 text-blue-600 dark:text-blue-400" />
      <span className="truncate">{t('attention.pastille')} {texte}</span>
    </div>
  )
}
