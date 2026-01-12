import React, { useState } from 'react'
import { Download, Upload, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'
import storage, { db } from '@/lib/storage'

interface OldNote {
  id: string
  title: string
  content: string
  url?: string
  timestamp: number
  [key: string]: any
}

function DataMigration() {
  const [isScanning, setIsScanning] = useState(false)
  const [foundDatabases, setFoundDatabases] = useState<string[]>([])
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [migratedCount, setMigratedCount] = useState(0)

  // Scanner les bases de données IndexedDB existantes
  const scanForOldDatabases = async () => {
    setIsScanning(true)
    try {
      // Noms de bases de données possibles pour l'ancienne version
      const possibleDbNames = [
        'AcademicNotesExtension',
        'NotesCollector', 
        'WebNotes',
        'ChromeNotes',
        'Academic Notes',
        'academic-notes',
        'notes-db',
        'extension-notes',
        'trading-notes',
        'aoknowledge-notes'
      ]

      const existingDatabases: string[] = []

      // Tester chaque nom de base possible
      for (const dbName of possibleDbNames) {
        try {
          const request = indexedDB.open(dbName)
          await new Promise((resolve, reject) => {
            request.onerror = () => resolve(null) // DB n'existe pas
            request.onsuccess = () => {
              existingDatabases.push(dbName)
              request.result.close()
              resolve(null)
            }
            request.onupgradeneeded = () => {
              // DB n'existait pas
              request.result.close()
              indexedDB.deleteDatabase(dbName) // Nettoyer
              resolve(null)
            }
          })
        } catch (error) {
          console.log(`Database ${dbName} not found:`, error)
        }
      }

      setFoundDatabases(existingDatabases)
    } catch (error) {
      console.error('Error scanning databases:', error)
    } finally {
      setIsScanning(false)
    }
  }

  // Migrer depuis une base de données spécifique
  const migrateFromDatabase = async (dbName: string) => {
    try {
      const request = indexedDB.open(dbName)
      
      return new Promise((resolve, reject) => {
        request.onerror = () => reject(new Error(`Cannot open database ${dbName}`))
        
        request.onsuccess = async () => {
          const oldDb = request.result
          const transaction = oldDb.transaction(oldDb.objectStoreNames, 'readonly')
          
          let migratedNotes = 0
          
          // Parcourir tous les object stores pour trouver les notes
          for (const storeName of Array.from(oldDb.objectStoreNames)) {
            try {
              const store = transaction.objectStore(storeName)
              const getAllRequest = store.getAll()
              
              getAllRequest.onsuccess = async () => {
                const items = getAllRequest.result
                
                for (const item of items) {
                  // Détecter si c'est une note (heuristiques)
                  if (isValidNote(item)) {
                    const note = convertOldNoteToNew(item)
                    await storage.saveNote(note)
                    migratedNotes++
                  }
                }
                
                setMigratedCount(prev => prev + migratedNotes)
              }
            } catch (error) {
              console.log(`Error reading store ${storeName}:`, error)
            }
          }
          
          oldDb.close()
          resolve(migratedNotes)
        }
      })
    } catch (error) {
      console.error(`Migration failed for ${dbName}:`, error)
      throw error
    }
  }

  // Vérifier si un objet est une note valide
  const isValidNote = (item: any): item is OldNote => {
    return (
      item &&
      typeof item === 'object' &&
      (item.title || item.content) &&
      (item.timestamp || item.date || item.created_at)
    )
  }

  // Convertir ancienne note vers nouveau format
  const convertOldNoteToNew = (oldNote: OldNote) => {
    const timestamp = oldNote.timestamp || oldNote.date || oldNote.created_at || Date.now()
    const url = oldNote.url || oldNote.source_url || ''
    
    let domain = ''
    try {
      if (url) domain = new URL(url).hostname
    } catch {}

    return {
      id: oldNote.id || crypto.randomUUID(),
      title: oldNote.title || 'Note migrée',
      content: oldNote.content || '',
      url,
      favicon: oldNote.favicon || '',
      timestamp: typeof timestamp === 'number' ? timestamp : Date.parse(timestamp) || Date.now(),
      type: 'manual' as const,
      tags: oldNote.tags || [],
      concepts: oldNote.concepts || [],
      screenshots: oldNote.screenshots || [],
      metadata: {
        domain,
        title: oldNote.title || '',
        language: 'fr',
        ...oldNote.metadata
      },
      summary: oldNote.summary || oldNote.ai_summary
    }
  }

  // Migrer toutes les bases trouvées
  const migrateAllDatabases = async () => {
    setMigrationStatus('idle')
    setMigratedCount(0)
    
    try {
      for (const dbName of foundDatabases) {
        await migrateFromDatabase(dbName)
      }
      
      setMigrationStatus('success')
    } catch (error) {
      console.error('Migration failed:', error)
      setMigrationStatus('error')
    }
  }

  // Scanner au chargement du composant
  React.useEffect(() => {
    scanForOldDatabases()
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <h2 className="text-xl font-semibold text-foreground mb-2">Migration des données</h2>
        <p className="text-sm text-muted-foreground">
          Scanner et récupérer les notes de l'ancienne version de l'extension
        </p>
      </div>

      {/* Scanner les bases de données */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Bases de données détectées</h3>
          <button
            onClick={scanForOldDatabases}
            disabled={isScanning}
            className="flex items-center space-x-2 px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isScanning ? 'animate-spin' : ''} />
            <span>Scanner</span>
          </button>
        </div>

        {foundDatabases.length > 0 ? (
          <div className="space-y-2">
            {foundDatabases.map((dbName) => (
              <div key={dbName} className="flex items-center p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <p className="font-medium">{dbName}</p>
                  <p className="text-sm text-muted-foreground">Base de données trouvée</p>
                </div>
              </div>
            ))}
            
            <button
              onClick={migrateAllDatabases}
              className="w-full mt-4 flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              <Upload size={16} />
              <span>Migrer {foundDatabases.length} base(s) de données</span>
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <AlertCircle size={48} className="mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              {isScanning ? 'Scanner en cours...' : 'Aucune ancienne base de données trouvée'}
            </p>
          </div>
        )}
      </div>

      {/* Statut de migration */}
      {migrationStatus !== 'idle' && (
        <div className={`p-4 rounded-lg flex items-center space-x-3 ${
          migrationStatus === 'success' 
            ? 'bg-green-50 text-green-800' 
            : 'bg-red-50 text-red-800'
        }`}>
          {migrationStatus === 'success' ? (
            <CheckCircle size={20} className="text-green-600" />
          ) : (
            <AlertCircle size={20} className="text-red-600" />
          )}
          <div>
            <p className="font-medium">
              {migrationStatus === 'success' 
                ? `Migration réussie ! ${migratedCount} note(s) récupérée(s)` 
                : 'Erreur lors de la migration'
              }
            </p>
            {migrationStatus === 'success' && (
              <p className="text-sm">Rechargez l'extension pour voir vos notes migrées.</p>
            )}
          </div>
        </div>
      )}

      {/* Import/Export manuel */}
      <div className="border-t border-border pt-4 space-y-4">
        <h3 className="font-medium">Import/Export manuel</h3>
        <div className="grid grid-cols-2 gap-3">
          <button className="flex items-center justify-center space-x-2 px-4 py-2 border border-border rounded-md hover:bg-muted">
            <Download size={16} />
            <span>Exporter</span>
          </button>
          <label className="flex items-center justify-center space-x-2 px-4 py-2 border border-border rounded-md hover:bg-muted cursor-pointer">
            <Upload size={16} />
            <span>Importer</span>
            <input 
              type="file" 
              accept=".json" 
              className="hidden"
              onChange={(e) => {
                // TODO: Implémenter l'import de fichier JSON
              }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}

export default DataMigration