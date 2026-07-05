import React, { useState } from 'react'
import { Sunrise, ChevronDown, ChevronRight } from 'lucide-react'
import type { NoteWarmup } from '@/types/academic'

// Warmup de séance, lancé DANS la note quand on est prêt à trader (le pendant du
// cooldown-par-trade). Non imposé : une note de cours l'ignore. Le débrief de fin,
// lui, est attaché à chaque trade (CooldownPopover).

const FIELDS: { key: 'physical' | 'emotional' | 'dominantThought' | 'objective'; label: string; hint: string }[] = [
  { key: 'physical', label: 'État physique', hint: 'Fatigué ? En forme ? Tendu ? Bien dormi ?' },
  { key: 'emotional', label: 'État émotionnel', hint: 'Anxieux, excité, détendu, irritable…' },
  { key: 'dominantThought', label: 'Pensée dominante', hint: 'Un objectif ? Une peur ? Une attente ?' },
  { key: 'objective', label: 'Objectif du jour (qualitatif)', hint: 'Respecter mon plan, exécuter — pas un chiffre.' },
]

function hasContent(w?: NoteWarmup): boolean {
  return !!(w && (w.physical || w.emotional || w.dominantThought || w.objective || w.doneAt))
}

function gaugeStyle(v: number) {
  const color = v < 34 ? '#22c55e' : v < 67 ? '#f59e0b' : '#ef4444'
  const label = v < 34 ? 'Calme' : v < 67 ? 'Modéré' : 'Chargé'
  return { color, label }
}

interface WarmupCardProps {
  warmup?: NoteWarmup
  onSave: (patch: Partial<NoteWarmup>) => void
}

export default function WarmupCard({ warmup, onSave }: WarmupCardProps) {
  const filled = hasContent(warmup)
  const [open, setOpen] = useState(filled)
  const [gauge, setGauge] = useState(warmup?.emotionLevel ?? 0)

  // Rien de rempli et replié → simple lanceur discret (le warmup n'est pas obligatoire)
  if (!open && !filled) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/5 transition-colors"
      >
        <Sunrise size={15} className="flex-shrink-0" />
        <span className="text-xs font-medium">Lancer mon warmup</span>
        <span className="text-[10px] text-muted-foreground ml-auto hidden sm:inline">te situer avant d'ouvrir les graphiques</span>
      </button>
    )
  }

  const g = gaugeStyle(gauge)

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-1.5 px-3 py-2">
        <Sunrise size={14} className="text-blue-500 flex-shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Warmup</span>
        {filled && <span className="text-[10px] font-medium ml-auto" style={{ color: g.color }}>{gauge} · {g.label}</span>}
        {open
          ? <ChevronDown size={13} className={`text-muted-foreground ${filled ? 'ml-1.5' : 'ml-auto'}`} />
          : <ChevronRight size={13} className={`text-muted-foreground ${filled ? 'ml-1.5' : 'ml-auto'}`} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          {FIELDS.map(f => (
            <div key={f.key}>
              <div className="text-[11px] font-medium mb-0.5 text-blue-600 dark:text-blue-400">{f.label}</div>
              <textarea
                defaultValue={warmup?.[f.key] ?? ''}
                onBlur={e => { const v = e.target.value; if (v !== (warmup?.[f.key] ?? '')) onSave({ [f.key]: v }) }}
                placeholder={f.hint}
                rows={1}
                className="w-full resize-y rounded-md px-2.5 py-1.5 text-[13px] bg-background border border-border text-foreground outline-none focus:border-primary"
                style={{ minHeight: 34 }}
              />
            </div>
          ))}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Émotion accumulée au démarrage</span>
              <span className="text-[11px] font-semibold" style={{ color: g.color }}>{gauge} · {g.label}</span>
            </div>
            <input
              type="range" min={0} max={100} value={gauge}
              onChange={e => setGauge(Number(e.target.value))}
              onPointerUp={() => onSave({ emotionLevel: gauge })}
              onBlur={() => onSave({ emotionLevel: gauge })}
              className="w-full" style={{ accentColor: g.color }}
            />
            <p className="text-[10px] mt-0.5 text-muted-foreground">Tu ne repars pas de zéro : ce que tu portes d'hier pèse sur aujourd'hui.</p>
          </div>
        </div>
      )}
    </div>
  )
}
