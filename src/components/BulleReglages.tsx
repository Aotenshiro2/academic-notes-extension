import React, { useEffect, useState } from 'react'
import { MessageSquare, Plus, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { t } from '@/lib/i18n'
import {
  CLE_BULLE, ajouterSite, departComplet, hoteDansListe, lireReglagesBulle, nomSite,
  normaliserHote, reglagesBulleDefaut, remettreDepart, retirerSite, type ReglagesBulle,
} from '@/lib/bulle-carnet'

// La bulle « Ouvrir le Carnet » (1.9.2) : l'interrupteur, la liste des sites
// et « Ajouter ce site ». Lu à l'ouverture des réglages, écrit au geste.
// Les règles : lib/bulle-carnet.ts.

const INTERRUPTEUR = "w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"

export default function BulleReglages() {
  const [reglages, setReglages] = useState<ReglagesBulle | null>(null)

  useEffect(() => {
    let vivant = true
    chrome.storage.local.get(CLE_BULLE)
      .then(lu => { if (vivant) setReglages(lireReglagesBulle(lu[CLE_BULLE])) })
      .catch(() => { if (vivant) setReglages(reglagesBulleDefaut()) })
    return () => { vivant = false }
  }, [])

  if (!reglages) return null

  const ecrire = (r: ReglagesBulle) => {
    setReglages(r)
    chrome.storage.local.set({ [CLE_BULLE]: r }).catch(error => console.warn('[Réglages] Bulle non enregistrée :', error))
  }

  // Le site de l'onglet actif de la fenêtre, lu au clic
  const ajouterCeSite = async () => {
    let hote: string | null = null
    try {
      const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true })
      hote = onglet?.url ? normaliserHote(onglet.url) : null
    } catch { /* onglet illisible */ }
    if (!hote) { toast.info(t('reglages.bullePasDePage')); return }
    if (hoteDansListe(hote, reglages.sites)) { toast.info(t('reglages.bulleDejaLa', { site: hote })); return }
    ecrire(ajouterSite(reglages, hote))
    toast.success(t('reglages.bulleAjoute', { site: hote }))
  }

  return (
    <div className="mb-6" id="reglage-bulle">
      <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
        <MessageSquare size={16} className="mr-2" />
        {t('reglages.bulle')}
      </h3>
      <div className="p-3 bg-muted/50 rounded-lg space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('reglages.bulleDesc')}</p>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={reglages.actif}
              onChange={(e) => ecrire({ ...reglages, actif: e.target.checked })}
              className="sr-only peer"
              aria-label={t('reglages.bulle')}
            />
            <div className={INTERRUPTEUR}></div>
          </label>
        </div>

        {reglages.actif && (
          <>
            {reglages.sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('reglages.bulleAucun')}</p>
            ) : (
              <ul className="space-y-1">
                {reglages.sites.map(hote => (
                  <li key={hote} data-site-bulle={hote} className="flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-foreground">{nomSite(hote)}</span>
                      {nomSite(hote) !== hote && <span className="ml-1.5 text-muted-foreground">{hote}</span>}
                    </span>
                    <button
                      onClick={() => ecrire(retirerSite(reglages, hote))}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted flex-shrink-0"
                      aria-label={t('reglages.bulleRetirer', { site: hote })}
                      title={t('reglages.bulleRetirer', { site: hote })}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                onClick={ajouterCeSite}
                data-ajouter-site
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                {t('reglages.bulleAjouter')}
              </button>
              {!departComplet(reglages.sites) && (
                <button
                  onClick={() => ecrire(remettreDepart(reglages))}
                  className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {t('reglages.bulleDefaut')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
