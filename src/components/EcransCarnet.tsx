import { toast } from '../lib/toast'
import React from 'react'
import { ArrowLeft } from 'lucide-react'
import SupportView from '@/components/SupportView'
import MentoratView from '@/components/MentoratView'
import AiConfigView from '@/components/AiConfigView'
import PlansView from '@/components/PlansView'
import ToolsView from '@/components/ToolsView'
import DiagnosticView from '@/components/DiagnosticView'
import AccountView from '@/components/AccountView'
import SettingsView from '@/components/SettingsView'
import storage from '@/lib/storage'
import { forceSyncAll, verifySyncStatus, pullFromJournal, deleteJournalNotes } from '@/lib/sync'
import { codeDeSync } from '@/lib/besoins-decouverte'
import { t } from '@/lib/i18n'
import type { EcransCarnetEtat } from '@/lib/use-ecrans-carnet'
import type { NoteSummary, NoteFolder, Settings as SettingsType } from '@/types/academic'

// Les écrans du Carnet, les mêmes dans le panneau latéral et le plein écran
// (1.8.15). Sortis de sidepanel/App.tsx : le plein écran n'en avait aucun
// (pas de Compte, pas de Paramètres, pas de Mentorat, pas de « Mon forfait »).
// Un ajout ici vaut pour les deux vues. Quel écran est ouvert : use-ecrans-carnet.

interface EcransCarnetProps {
  ecrans: EcransCarnetEtat
  /** Résumés des notes : l'écran Compte les synchronise et les compte. */
  notes: NoteSummary[]
  folders: NoteFolder[]
  settings: SettingsType
  /** Réglages enregistrés et relus : la vue les reprend. */
  onReglages: (reglages: SettingsType) => void
  /** Relire les notes après une synchronisation ou un import. */
  recharger: () => Promise<void>
  /** Relire la session au retour de l'écran Compte. */
  relireSession: () => void
}

export default function EcransCarnet({ ecrans, notes, folders, settings, onReglages, recharger, relireSession }: EcransCarnetProps) {
  const { ecran, fermer, ouvrir, frictionIci, suivreSync } = ecrans

  const enregistrerReglages = async (nouveaux: Partial<SettingsType>) => {
    await storage.saveSettings(nouveaux)
    onReglages(await storage.getSettings())
  }

  switch (ecran) {
    case null:
      return null

    case 'support':
      return (
        <SupportView
          key={`${ecrans.supportBesoin ? 'besoin' : 'chat'}-${ecrans.ouvertureBesoin}`}
          vueInitiale={ecrans.supportBesoin ? 'besoin' : 'chat'}
          onBack={fermer}
          onOpenAccount={() => ouvrir('compte')}
          signal={ecrans.signalBesoin}
          onSignalEnvoye={ecrans.oublierSignal}
        />
      )

    case 'mentorat':
      return (
        <MentoratView
          onBack={fermer}
          onOpenAccount={() => ouvrir('compte')}
          onOpenSupport={() => ouvrir('support')}
          onOpenPlans={() => ouvrir('forfait')}
        />
      )

    case 'configIA':
      return <AiConfigView settings={settings} onChange={enregistrerReglages} onBack={fermer} />

    case 'forfait':
      return <PlansView onBack={fermer} />

    case 'outils':
      return <ToolsView onBack={fermer} />

    case 'diagnostic':
      return (
        <DiagnosticView
          onBack={fermer}
          onOpenSettings={() => ouvrir('reglages', { focusReglage: 'affichageSecours' })}
          onOpenAccount={() => ouvrir('compte')}
        />
      )

    case 'compte':
      return (
        <AccountView
          notes={notes}
          settings={settings}
          onSettingsChange={enregistrerReglages}
          onSyncAll={async () => {
            const result = await forceSyncAll(notes, (id) => storage.updateNote(id, { lastSyncAt: Date.now() }))
            await recharger()
            return suivreSync(result)
          }}
          onVerifySync={async () => {
            const result = await verifySyncStatus(notes, (id, changes) => storage.updateNote(id, changes))
            await recharger()
            return result
          }}
          onResyncMissing={(missingNotes) => {
            // Reset lastSyncAt sur les notes manquantes puis les synquer
            return Promise.all(missingNotes.map(n => storage.updateNote(n.id, { lastSyncAt: undefined })))
              .then(() => forceSyncAll(
                missingNotes.map(n => ({ ...n, lastSyncAt: undefined })),
                (id) => storage.updateNote(id, { lastSyncAt: Date.now() })
              ))
              .then(suivreSync)
          }}
          onForceResyncAll={async () => {
            // Reset lastSyncAt sur TOUTES les notes (inclut les exclues via includeExcluded)
            await Promise.all(notes.map(n => storage.updateNote(n.id, { lastSyncAt: undefined })))
            const freshNotes = notes.map(n => ({ ...n, lastSyncAt: undefined }))
            const result = await forceSyncAll(freshNotes, (id) => storage.updateNote(id, { lastSyncAt: Date.now() }), { includeExcluded: true })
            await recharger()
            return suivreSync(result)
          }}
          onRebuildJournal={async () => {
            // Supprime toutes les notes dans le journal, reset les flags, re-sync complet
            const { ok, error } = await deleteJournalNotes()
            if (!ok) {
              frictionIci('carnet.sync_echec', { code: codeDeSync(error) })
              return { synced: 0, failed: 0, errors: [{ title: 'Journal', error: error ?? 'Erreur inconnue' }] }
            }
            await Promise.all(notes.map(n => storage.updateNote(n.id, { lastSyncAt: undefined, syncExcluded: false })))
            const freshNotes = notes.map(n => ({ ...n, lastSyncAt: undefined, syncExcluded: false }))
            const result = await forceSyncAll(freshNotes, (id) => storage.updateNote(id, { lastSyncAt: Date.now() }))
            await recharger()
            return suivreSync(result)
          }}
          onPullFromJournal={async () => {
            const { notes: journalNotes, folders: journalFolders, error } = await pullFromJournal()
            if (error) {
              frictionIci('carnet.sync_echec', { code: codeDeSync(error) })
              return { imported: 0, skipped: 0, error }
            }
            // Restaurer d'abord l'arborescence des dossiers (ids stables).
            // Racines AVANT sous-dossiers : saveFolder refuse un parentId
            // dont le parent n'existe pas encore localement.
            const knownFolders = new Map(folders.map(f => [f.id, f]))
            const sortedFolders = [...(journalFolders ?? [])].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0))
            for (const folder of sortedFolders) {
              const known = knownFolders.get(folder.id)
              if (!known) {
                await storage.saveFolder(folder)
              } else if ((known.parentId ?? null) !== (folder.parentId ?? null)) {
                // Hiérarchie changée côté journal (autre appareil) → répercuter
                await storage.saveFolder({ ...known, parentId: folder.parentId })
              }
            }
            const existingIds = new Set(notes.map(n => n.id))
            const existingUrls = new Set(notes.map(n => n.url).filter(Boolean))
            let imported = 0
            let skipped = 0
            for (const note of journalNotes) {
              if (existingIds.has(note.id) || (note.url && existingUrls.has(note.url))) {
                skipped++
              } else {
                await storage.saveNote(note)
                imported++
              }
            }
            await recharger()
            return { imported, skipped }
          }}
          onBack={() => { fermer(); relireSession() }}
        />
      )

    case 'reglages':
      return (
        <div className="space-y-4">
          {/* Header avec bouton retour */}
          <div className="flex items-center space-x-3 pb-3 border-b border-border">
            <button
              onClick={fermer}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title={t('commun.retour')}
              aria-label={t('commun.retour')}
            >
              <ArrowLeft size={18} />
            </button>
            <h2 className="text-lg font-semibold text-foreground">{t('menu.parametres')}</h2>
          </div>
          <SettingsView
            settings={settings}
            onChange={enregistrerReglages}
            onExport={async () => {
              const data = await storage.exportData()
              const blob = new Blob([data], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `carnet-du-trader-backup-${new Date().toISOString().split('T')[0]}.json`
              a.click()
              URL.revokeObjectURL(url)
            }}
            onImport={async (e) => {
              const file = e.target.files?.[0]
              if (file) {
                const text = await file.text()
                const result = await storage.importData(text)
                if (result.success) {
                  toast.success(t('reglages.importReussi'))
                  await recharger()
                } else {
                  toast.error(t('reglages.importErreur', { erreur: String(result.error) }))
                }
              }
            }}
            onSyncToJournal={() => {
              toast.info(t('reglages.syncNonImplemente'))
            }}
            focus={ecrans.focusReglage}
          />
        </div>
      )
  }
}
