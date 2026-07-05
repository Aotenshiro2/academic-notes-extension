import React, { useEffect, useState } from 'react'
import { ArrowLeft, Sunrise, Loader2, Plus } from 'lucide-react'
import { getRituals, createRitual, updateRitual, type Ritual, type RitualPatch } from '@/lib/ritual'

// Écran dédié « rituel de séance » = espace pour PRÉPARER / passer en revue son warmup
// à froid (hors note). Le warmup d'une séance donnée se lance, lui, directement depuis
// la note (WarmupCard) ; le cooldown est attaché à chaque trade. Cet écran ne clôt donc
// plus une séance — un warmup est un état qu'on pose, pas un process avec une fin.

type TextKey = 'physical' | 'emotional' | 'dominantThought' | 'objective'

const WARMUP: { key: TextKey; label: string; hint: string }[] = [
  { key: 'physical', label: 'État physique', hint: 'Fatigué ? En forme ? Tendu ? Bien dormi ?' },
  { key: 'emotional', label: 'État émotionnel', hint: 'Anxieux, excité, détendu, irritable…' },
  { key: 'dominantThought', label: 'Pensée dominante', hint: 'Performance ? Un objectif ? Une peur ? Une attente ?' },
  { key: 'objective', label: 'Objectif du jour (qualitatif)', hint: 'Respecter mon plan, exécuter, journaler — pas un chiffre.' },
]

function Field({ label, hint, def, onSave, tint }: { label: string; hint: string; def: string; onSave: (v: string) => void; tint: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium mb-0.5" style={{ color: tint }}>{label}</div>
      <textarea
        defaultValue={def}
        onBlur={e => { if (e.target.value !== def) onSave(e.target.value) }}
        placeholder={hint}
        rows={1}
        className="w-full resize-y rounded-md px-2.5 py-1.5 text-[13px] bg-background border border-border text-foreground outline-none focus:border-primary"
        style={{ minHeight: 34 }}
      />
    </div>
  )
}

function Gauge({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [level, setLevel] = useState(value)
  const color = level < 34 ? '#22c55e' : level < 67 ? '#f59e0b' : '#ef4444'
  const label = level < 34 ? 'Calme' : level < 67 ? 'Modéré' : 'Chargé'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium" style={{ color: '#3b82f6' }}>Émotion accumulée au démarrage</span>
        <span className="text-[11px] font-semibold" style={{ color }}>{level} · {label}</span>
      </div>
      <input type="range" min={0} max={100} value={level}
        onChange={e => setLevel(Number(e.target.value))}
        onPointerUp={() => onCommit(level)} onBlur={() => onCommit(level)}
        className="w-full" style={{ accentColor: color }} />
      <p className="text-[10px] mt-0.5 text-muted-foreground">Tu ne repars pas de zéro : ce que tu portes d’hier pèse sur aujourd’hui.</p>
    </div>
  )
}

export default function RitualView({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<Ritual | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    getRituals().then(list => {
      setActive(list.find(r => !r.closed) ?? null)
      setLoading(false)
    })
  }, [])

  const start = async () => {
    setBusy(true)
    const r = await createRitual({})
    if (r) setActive(r); else setOffline(true)
    setBusy(false)
  }

  const save = (patch: RitualPatch) => {
    if (!active) return
    setActive({ ...active, ...patch } as Ritual)
    updateRitual(active.id, patch).then(r => { if (!r) setOffline(true) })
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="header-section px-4 py-3 flex items-center gap-2">
        <button onClick={onClose} className="p-1.5 -ml-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Retour">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold text-foreground flex items-center gap-1.5"><Sunrise size={16} className="text-blue-500" /> Rituel de séance</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-10 text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>
        ) : offline ? (
          <p className="text-sm text-muted-foreground text-center py-8">Impossible de joindre le journal (hors ligne ou déconnecté). Reconnecte-toi, ton rituel se synchronisera.</p>
        ) : !active ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3 opacity-40">🌅</div>
            <p className="text-sm text-foreground mb-1">Préparer mon warmup</p>
            <p className="text-xs text-muted-foreground mb-5 max-w-xs mx-auto">Poser à froid ce qui compte avant de trader. En séance, tu lanceras ton warmup directement depuis ta note.</p>
            <button onClick={start} disabled={busy} className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Préparer
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Sunrise size={14} style={{ color: '#3b82f6' }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#3b82f6' }}>Avant la séance</span>
              </div>
              <div className="space-y-2.5">
                {WARMUP.map(f => <Field key={f.key} label={f.label} hint={f.hint} def={active[f.key] ?? ''} onSave={v => save({ [f.key]: v })} tint="#3b82f6" />)}
                <Gauge value={active.emotionLevel ?? 0} onCommit={v => save({ emotionLevel: v })} />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center pt-1">Le débrief se fait trade par trade (cooldown) ; l'analyse est dans le journal → Rituel de séance.</p>
          </div>
        )}
      </div>
    </div>
  )
}
