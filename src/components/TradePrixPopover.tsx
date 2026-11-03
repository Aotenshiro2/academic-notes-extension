import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Crosshair, Link2, Unlink, Loader2 } from 'lucide-react'
import type { TradePrix, TradeSegment } from '@/types/academic'
import { t, locale, type CleI18n } from '@/lib/i18n'
import { fetchPositionsImportees, lierPositionImportee, type PositionImportee } from '@/lib/sync'

/**
 * Prix d'un trade lancé dans une note (1.8.12, demande de Flow) et lien avec
 * le trade importé du broker.
 *
 * Deux choses distinctes, dans le même petit panneau parce qu'elles parlent du
 * même trade :
 * 1. les prix saisis à la main (entrée, sortie, taille) : ils restent dans le
 *    Carnet. Pilotage ne reçoit que les vrais trades du broker (règle de Brice) ;
 * 2. le lien avec une position importée (CSV, capture, PDF du broker, dans
 *    Pilotage ou le journal) : le Carnet ne crée rien là-bas, il pose ou retire
 *    seulement le lien, par la route que Pilotage utilise déjà à l'import.
 */

interface TradePrixPopoverProps {
  position: { top: number; bottom: number; left: number }
  trade: TradeSegment
  numero: number
  onSave: (prix: TradePrix | undefined) => void
  onClose: () => void
}

const POPUP_WIDTH = 288
const POPUP_HEIGHT = 380
// L'heure d'une position sans fuseau est « telle qu'affichée » par la
// plateforme, stockée comme de l'UTC : on cherche large autour du trade.
const FENETRE_MS = 14 * 3600e3

const CHAMPS: { cle: keyof TradePrix; label: CleI18n }[] = [
  { cle: 'entree', label: 'prix.entree' },
  { cle: 'sortie', label: 'prix.sortie' },
  { cle: 'taille', label: 'prix.taille' },
]

function ecrire(n: number | undefined): string {
  return n === undefined ? '' : String(n).replace('.', locale() === 'fr-FR' ? ',' : '.')
}

/** Virgule ou point ; vide = absent ; null = illisible. */
function lire(brut: string): number | undefined | null {
  const s = brut.trim().replace(/\s/g, '').replace(',', '.')
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function heurePosition(p: PositionImportee): string {
  const d = new Date(p.entreLe)
  return d.toLocaleString(locale(), {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    ...(p.fuseau ? {} : { timeZone: 'UTC' }),
  })
}

const nombre = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 6 })

function decrirePosition(p: PositionImportee): string {
  const sens = p.direction === 'long' ? t('prix.long') : p.direction === 'short' ? t('prix.short') : ''
  const prix = p.prixEntree !== null
    ? ` · ${nombre(p.prixEntree)}${p.prixSortie !== null ? ` → ${nombre(p.prixSortie)}` : ''}`
    : ''
  return `${p.symbole} ${sens} ${nombre(p.quantite)}${prix}`.replace(/\s+/g, ' ').trim()
}

function TradePrixPopover({ position, trade, numero, onSave, onClose }: TradePrixPopoverProps) {
  const [valeurs, setValeurs] = useState<Record<keyof TradePrix, string>>({
    entree: ecrire(trade.prix?.entree),
    sortie: ecrire(trade.prix?.sortie),
    taille: ecrire(trade.prix?.taille),
  })
  const [positions, setPositions] = useState<PositionImportee[] | null>(null)
  const [etatBroker, setEtatBroker] = useState<'chargement' | 'pret' | 'non-connecte' | 'reseau'>('chargement')
  const [action, setAction] = useState<string | null>(null)
  const [erreurLien, setErreurLien] = useState<CleI18n | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const charger = useCallback(async () => {
    const r = await fetchPositionsImportees(trade.startedAt - FENETRE_MS, (trade.closedAt ?? trade.startedAt) + FENETRE_MS)
    if (r.error) { setEtatBroker(r.error); return }
    const proches = (r.positions ?? [])
      .slice()
      .sort((a, b) => Math.abs(Date.parse(a.entreLe) - trade.startedAt) - Math.abs(Date.parse(b.entreLe) - trade.startedAt))
    setPositions(proches)
    setEtatBroker('pret')
  }, [trade.startedAt, trade.closedAt])

  useEffect(() => { void charger() }, [charger])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose])

  const lus = CHAMPS.map(c => [c.cle, lire(valeurs[c.cle])] as const)
  const illisible = lus.some(([, v]) => v === null)

  const enregistrer = useCallback(() => {
    if (illisible) return
    const prix: TradePrix = {}
    for (const [cle, v] of lus) if (typeof v === 'number') prix[cle] = v
    onSave(Object.keys(prix).length ? prix : undefined)
    onClose()
  }, [illisible, lus, onSave, onClose])

  // Ce trade du Carnet déjà lié à une position hors de la plage : on propose
  // de déplacer le lien (délier l'autre, puis lier celle-ci).
  const [remplacement, setRemplacement] = useState<{ cible: PositionImportee; autre: string } | null>(null)

  const lier = useCallback(async (p: PositionImportee, lien: boolean, remplacer?: string) => {
    setAction(p.positionId)
    setErreurLien(null)
    setRemplacement(null)
    if (remplacer) {
      const d = await lierPositionImportee(remplacer, null)
      if (!d.ok) { setAction(null); setErreurLien('prix.erreurReseau'); return }
    }
    const r = await lierPositionImportee(p.positionId, lien ? trade.id : null)
    setAction(null)
    if (!r.ok && r.error === 'deja-lie' && r.autrePositionId) {
      setErreurLien('prix.erreurDejaLie')
      setRemplacement({ cible: p, autre: r.autrePositionId })
      return
    }
    if (!r.ok) {
      setErreurLien(r.error === 'introuvable' ? 'prix.erreurIntrouvable'
        : r.error === 'deja-lie' ? 'prix.erreurDejaLie'
        : r.error === 'non-connecte' ? 'prix.nonConnecte'
        : 'prix.erreurReseau')
      return
    }
    await charger()
  }, [trade.id, charger])

  const liee = positions?.find(p => p.segmentRef === trade.id) ?? null
  const candidates = (positions ?? []).filter(p => !p.segmentRef).slice(0, 5)

  const spaceBelow = window.innerHeight - position.bottom - 8
  const showAbove = spaceBelow < POPUP_HEIGHT && position.top > POPUP_HEIGHT
  const style: React.CSSProperties = {
    position: 'fixed',
    top: showAbove ? Math.max(8, position.top - 4) : position.bottom + 4,
    left: Math.max(8, Math.min(position.left - POPUP_WIDTH / 2, window.innerWidth - POPUP_WIDTH - 8)),
    transform: showAbove ? 'translateY(-100%)' : 'none',
    zIndex: 9999,
    width: POPUP_WIDTH,
  }

  return (
    <div
      ref={popupRef}
      style={style}
      className="bg-background border border-border rounded-xl shadow-lg p-3 space-y-2.5"
      onMouseDown={e => e.stopPropagation()}
      role="dialog"
      aria-label={t('prix.titre', { n: numero })}
    >
      <div className="flex items-center gap-1.5">
        <Crosshair size={13} className="text-blue-500" />
        <span className="text-xs font-medium text-foreground">{t('prix.titre', { n: numero })}</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {CHAMPS.map(c => (
          <label key={c.cle} className="block">
            <span className="block text-[10px] font-medium text-muted-foreground mb-0.5">{t(c.label)}</span>
            <input
              value={valeurs[c.cle]}
              onChange={e => setValeurs(v => ({ ...v, [c.cle]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enregistrer() } }}
              inputMode="decimal"
              className={`w-full px-2 py-1 text-xs bg-muted/40 border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/50 ${
                lire(valeurs[c.cle]) === null ? 'border-red-500/60' : 'border-border'
              }`}
            />
          </label>
        ))}
      </div>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] leading-snug text-muted-foreground/70">{t('prix.resteIci')}</span>
        <button
          onClick={enregistrer}
          disabled={illisible}
          className="px-3 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {t('prix.enregistrer')}
        </button>
      </div>

      <div className="border-t border-border pt-2 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Link2 size={12} className="text-muted-foreground" />
          <span className="text-[11px] font-medium text-foreground">{t('prix.broker')}</span>
        </div>
        {etatBroker === 'chargement' && (
          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 size={10} className="animate-spin" />{t('prix.chargement')}</p>
        )}
        {etatBroker === 'non-connecte' && <p className="text-[10px] leading-snug text-muted-foreground">{t('prix.nonConnecte')}</p>}
        {etatBroker === 'reseau' && <p className="text-[10px] leading-snug text-muted-foreground">{t('prix.erreurReseau')}</p>}
        {etatBroker === 'pret' && liee && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-500/10">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-foreground truncate">{decrirePosition(liee)}</p>
              <p className="text-[10px] text-muted-foreground">{t('prix.lieA', { heure: heurePosition(liee) })}</p>
            </div>
            <button
              onClick={() => lier(liee, false)}
              disabled={action !== null}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              {action === liee.positionId ? <Loader2 size={10} className="animate-spin" /> : <Unlink size={10} />}
              {t('prix.delier')}
            </button>
          </div>
        )}
        {etatBroker === 'pret' && !liee && candidates.length === 0 && (
          <p className="text-[10px] leading-snug text-muted-foreground">{t('prix.aucunImport')}</p>
        )}
        {etatBroker === 'pret' && !liee && candidates.length > 0 && (
          <>
            <p className="text-[10px] leading-snug text-muted-foreground">{t('prix.choisir')}</p>
            <ul className="space-y-1">
              {candidates.map(p => (
                <li key={p.positionId} className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-foreground truncate">{decrirePosition(p)}</p>
                    <p className="text-[10px] text-muted-foreground">{heurePosition(p)}</p>
                  </div>
                  <button
                    onClick={() => lier(p, true)}
                    disabled={action !== null}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                  >
                    {action === p.positionId ? <Loader2 size={10} className="animate-spin" /> : <Link2 size={10} />}
                    {t('prix.lier')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {erreurLien && <p className="text-[10px] leading-snug text-red-600 dark:text-red-400">{t(erreurLien)}</p>}
        {remplacement && (
          <button
            onClick={() => lier(remplacement.cible, true, remplacement.autre)}
            disabled={action !== null}
            className="w-full px-2 py-1 text-[10px] font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            {t('prix.remplacer')}
          </button>
        )}
      </div>
    </div>
  )
}

export default TradePrixPopover
