// « Configurer son IA » — extrait des Paramètres (retour Brice 28/08 : le
// rouage devient un hub, chaque sujet a son écran court au lieu d'un
// écran-fleuve). On y règle les threads d'analyse : l'URL d'une conversation
// ouverte (Claude, ChatGPT…) où l'extension envoie les notes directement.
import React, { useState, useEffect } from 'react'
import { ArrowLeft, Link2, Info, Lock, Check } from 'lucide-react'
import type { Settings as SettingsType, AnalysisProvider } from '@/types/academic'
import { PROVIDER_LIST } from '@/lib/analysis-providers'
import { fetchAccesCaptureIA, type ModeleEtudeAffiche, type NiveauIA } from '@/lib/sync'

/** Ce qu'on écrit sur le cadenas d'un modèle hors palier. */
const LIBELLE_PALIER: Record<'libre' | 'premium' | 'club', string> = {
  libre: 'Membre',
  premium: 'Carnet Premium',
  club: 'Live Club',
}

interface AiConfigViewProps {
  settings: SettingsType
  onChange: (newSettings: Partial<SettingsType>) => void
  onBack: () => void
}

function AiConfigView({ settings, onChange, onBack }: AiConfigViewProps) {
  const [tabUrlErrors, setTabUrlErrors] = useState<Partial<Record<AnalysisProvider, boolean>>>({})

  // Le catalogue vient du serveur : c'est LUI qui sait ce que le forfait
  // débloque et ce qu'il reste dans le quota. L'extension ne fait qu'afficher.
  const [modeles, setModeles] = useState<ModeleEtudeAffiche[]>([])
  const [niveau, setNiveau] = useState<NiveauIA>('aucun')
  const [etudeOuverte, setEtudeOuverte] = useState(false)
  const [modeleDefaut, setModeleDefaut] = useState<string>('')
  const [chargementModeles, setChargementModeles] = useState(true)

  useEffect(() => {
    let vivant = true
    fetchAccesCaptureIA(settings.modeleEtude ?? null)
      .then(({ acces }) => {
        if (!vivant || !acces) return
        setModeles(acces.modeles ?? [])
        setNiveau(acces.niveau)
        setEtudeOuverte(Boolean(acces.etude))
        setModeleDefaut(acces.modeleDefaut ?? acces.modeleActif ?? '')
      })
      .catch(() => { /* hors ligne : la section reste vide, rien de cassé */ })
      .finally(() => { if (vivant) setChargementModeles(false) })
    return () => { vivant = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setThreadUrlFromCurrentTab = async (providerId: AnalysisProvider, baseUrl: string) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const domain = new URL(baseUrl).hostname
      if (tab?.url?.includes(domain)) {
        onChange({ providerThreadUrls: { ...settings.providerThreadUrls, [providerId]: tab.url } })
        setTabUrlErrors(prev => ({ ...prev, [providerId]: false }))
      } else {
        setTabUrlErrors(prev => ({ ...prev, [providerId]: true }))
      }
    } catch {
      setTabUrlErrors(prev => ({ ...prev, [providerId]: true }))
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          aria-label="Retour"
        >
          <ArrowLeft size={16} />
        </button>
        <Link2 size={16} className="text-purple-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-foreground">Configurer son IA</h2>
      </div>

      {/* ── Modèle employé par « Étudier la note » ──────────────────────────
          Deux fonctions : montrer ce que débloque le palier au-dessus (les
          modèles hors palier restent visibles, cadenassés), et permettre de
          DESCENDRE volontairement. Le second point est le vrai service : sur
          une étude, l'écart de qualité entre les modèles est mince, l'écart de
          coût est d'un facteur cinq. D'où le nombre d'études restantes affiché
          en face de chacun — c'est ça qui rend le choix informé.
          La CAPTURE n'apparaît pas ici : elle tourne sur le même modèle pour
          tout le monde, il n'y a rien à y choisir. */}
      <section className="mb-4">
        <h3 className="text-xs font-semibold text-foreground mb-1">Modèle pour « Étudier la note »</h3>
        <p className="text-[11px] text-muted-foreground mb-2">
          {chargementModeles
            ? 'Lecture de ton forfait…'
            : niveau === 'aucun'
              ? 'Connecte-toi à ton compte AOKnowledge pour voir ce que ton forfait débloque.'
              : etudeOuverte
                ? 'Tu peux descendre en gamme quand tu veux : c’est moins fin, mais ça multiplie le nombre d’études qui tiennent dans ton quota.'
                : 'L’étude fait partie du Carnet Premium. La capture, elle, reste à toi.'}
        </p>

        <div className="space-y-2">
          {modeles.map(m => {
            const actif = m.debloque && (settings.modeleEtude ?? modeleDefaut) === m.id
            return (
              <button
                key={m.id}
                type="button"
                disabled={!m.debloque}
                onClick={() => onChange({ modeleEtude: m.id })}
                className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                  !m.debloque
                    ? 'border-border/60 bg-muted/30 opacity-60 cursor-not-allowed'
                    : actif
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : 'border-border hover:bg-muted'
                }`}
                title={m.debloque ? `Utiliser ${m.nom}` : `${m.nom} fait partie du forfait ${LIBELLE_PALIER[m.requis]}`}
              >
                <span className="flex items-center gap-2">
                  {m.debloque
                    ? <Check size={13} className={actif ? 'text-amber-600 dark:text-amber-400 flex-shrink-0' : 'text-transparent flex-shrink-0'} />
                    : <Lock size={13} className="text-muted-foreground flex-shrink-0" />}
                  <span className="text-xs font-medium text-foreground">{m.nom}</span>
                  {!m.debloque && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {LIBELLE_PALIER[m.requis]}
                    </span>
                  )}
                  {m.debloque && m.etudesRestantes !== null && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      ≈ {m.etudesRestantes} étude{m.etudesRestantes > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-1 pl-[21px]">{m.detail}</span>
              </button>
            )
          })}
        </div>

        {etudeOuverte && modeles.some(m => m.debloque && m.etudesRestantes !== null) && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Ordres de grandeur, calculés sur ce qu’il te reste dans les 30 derniers jours. Une page avec capture d’écran coûte un peu plus qu’un article court.
          </p>
        )}
      </section>

      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg mb-3">
        <div className="flex items-start space-x-2">
          <Info size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Colle ici l'URL d'une conversation ouverte — tes notes y seront envoyées directement au lieu d'ouvrir une nouvelle fenêtre. Astuce : ouvre ta conversation dans un onglet, puis clique 📎.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {PROVIDER_LIST.map(p => (
          <div key={p.id} className="p-3 border rounded-lg">
            <p className="text-sm font-medium text-foreground mb-2">{p.label}</p>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder={`URL d'une conversation ${p.label}`}
                value={settings.providerThreadUrls?.[p.id] || ''}
                onChange={e => onChange({ providerThreadUrls: { ...settings.providerThreadUrls, [p.id]: e.target.value } })}
                className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/20 placeholder:text-muted-foreground"
              />
              <button
                title={`Définir depuis l'onglet ${p.label} actif`}
                onClick={() => setThreadUrlFromCurrentTab(p.id, p.url)}
                className="px-2 py-1.5 rounded border border-border bg-muted hover:bg-muted/80 text-sm transition-colors"
              >
                📎
              </button>
              {settings.providerThreadUrls?.[p.id] && (
                <button
                  onClick={() => onChange({ providerThreadUrls: { ...settings.providerThreadUrls, [p.id]: '' } })}
                  className="px-2 py-1.5 rounded border border-border bg-muted hover:bg-muted/80 text-muted-foreground text-xs transition-colors"
                  title="Effacer"
                >
                  ✕
                </button>
              )}
            </div>
            {tabUrlErrors[p.id] && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                Ouvre d'abord une conversation {p.label} dans le navigateur.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AiConfigView
