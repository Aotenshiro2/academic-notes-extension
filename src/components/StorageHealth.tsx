import { toast } from '../lib/toast'
import React, { useCallback, useEffect, useState } from 'react'
import { HardDrive, Loader2, Wand2, AlertTriangle, Check } from 'lucide-react'
import storage from '@/lib/storage'
import { formatFileSize } from '@/lib/image-utils'

// Au-delà, le carnet devient assez lourd pour que Chrome finisse par tuer
// l'onglet ou le panneau (« Out of Memory »). Seuil volontairement prudent.
const HEAVY_THRESHOLD = 120 * 1024 * 1024

interface Stats {
  noteCount: number
  totalBytes: number
  imageBytes: number
  imageCount: number
  heaviest: { id: string; title: string; bytes: number }[]
}

/**
 * Poids du carnet + compactage.
 *
 * Sans chiffre affiché, impossible de savoir si une correction mémoire a servi
 * à quelque chose : on corrigeait à l'aveugle. Ce bloc donne un avant/après.
 */
function StorageHealth() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [isScanning, setIsScanning] = useState(true)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ changed: number; saved: number } | null>(null)

  const scan = useCallback(async () => {
    setIsScanning(true)
    try {
      setStats(await storage.computeStorageStats())
    } catch (error) {
      console.error('[StorageHealth] Analyse impossible:', error)
    } finally {
      setIsScanning(false)
    }
  }, [])

  useEffect(() => { scan() }, [scan])

  const handleCompact = async () => {
    setResult(null)
    setProgress({ done: 0, total: stats?.noteCount ?? 0 })
    try {
      const report = await storage.compactNotes((done, total) => setProgress({ done, total }))
      setResult({ changed: report.changed, saved: Math.max(0, report.before - report.after) })
      await scan()
    } catch (error) {
      console.error('[StorageHealth] Compactage impossible:', error)
      toast.error('Le compactage a échoué. Réessaie après avoir rechargé l’extension.')
    } finally {
      setProgress(null)
    }
  }

  const isHeavy = !!stats && stats.totalBytes > HEAVY_THRESHOLD

  return (
    <div className="mb-6">
      <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
        <HardDrive size={16} className="mr-2" />
        Poids du carnet
      </h3>

      {isScanning && !stats ? (
        <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Analyse en cours…
        </div>
      ) : stats ? (
        <div className="space-y-3">
          <div className="p-3 rounded-lg border border-border bg-muted/30">
            <p className="text-sm text-foreground">
              <span className="font-semibold">{stats.noteCount}</span> note{stats.noteCount > 1 ? 's' : ''} ·{' '}
              <span className="font-semibold">{formatFileSize(stats.totalBytes)}</span> au total
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              dont {formatFileSize(stats.imageBytes)} d&apos;images ({stats.imageCount})
            </p>

            {stats.heaviest.length > 0 && (
              <ul className="mt-2 pt-2 border-t border-border/50 space-y-0.5">
                {stats.heaviest.map(n => (
                  <li key={n.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate flex-1">{n.title || 'Sans titre'}</span>
                    <span className="flex-shrink-0 tabular-nums">{formatFileSize(n.bytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isHeavy && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Ton carnet est lourd. À ce niveau, Chrome peut fermer le panneau sans
                prévenir. Compacte-le : les images trop grosses sont réencodées, rien
                n&apos;est supprimé.
              </p>
            </div>
          )}

          <button
            onClick={handleCompact}
            disabled={!!progress}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-60"
          >
            {progress ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm font-medium">
                  Compactage… {progress.done}/{progress.total}
                </span>
              </>
            ) : (
              <>
                <Wand2 size={16} className="text-primary" />
                <span className="text-sm font-medium">Compacter mes notes</span>
              </>
            )}
          </button>

          {result && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-green-500/30 bg-green-500/5">
              <Check size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-green-700 dark:text-green-400">
                {result.changed === 0
                  ? 'Rien à compacter, ton carnet est déjà propre.'
                  : `${result.changed} note${result.changed > 1 ? 's' : ''} allégée${result.changed > 1 ? 's' : ''} — ${formatFileSize(result.saved)} récupérés.`}
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Le compactage réencode les images les plus lourdes et retire les doublons
            internes. Tes notes, tes images et tes tags restent en place.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Analyse indisponible.</p>
      )}
    </div>
  )
}

export default StorageHealth
