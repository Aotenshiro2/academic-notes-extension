import React from 'react'
import {
  Keyboard,
  BookOpen,
  Lightbulb,
  Clock,
  Shield,
  ArrowLeft,
  Command,
} from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'

const version = chrome.runtime.getManifest().version

const SHORTCUTS = [
  { keys: ['Ctrl', 'Shift', 'A'], mac: ['Cmd', 'Shift', 'A'], desc: 'Ouvrir / fermer le panneau latéral' },
  { keys: ['Alt', 'Shift', 'C'], mac: ['Opt', 'Shift', 'C'], desc: 'Capture rapide de la page courante' },
  { keys: ['Ctrl', 'B'], mac: ['Cmd', 'B'], desc: 'Mettre en gras' },
  { keys: ['Ctrl', 'I'], mac: ['Cmd', 'I'], desc: 'Mettre en italique' },
  { keys: ['Ctrl', 'U'], mac: ['Cmd', 'U'], desc: 'Souligner' },
  { keys: ['Ctrl', 'Shift', 'S'], mac: ['Cmd', 'Shift', 'S'], desc: 'Capture d\'\u00e9cran' },
  { keys: ['Ctrl', 'Shift', 'I'], mac: ['Cmd', 'Shift', 'I'], desc: 'Ins\u00e9rer une image' },
  { keys: ['Entr\u00e9e'], mac: ['Entr\u00e9e'], desc: 'Envoyer le message' },
  { keys: ['Shift', 'Entr\u00e9e'], mac: ['Shift', 'Entr\u00e9e'], desc: 'Nouvelle ligne' },
  { keys: ['\u00c9chap'], mac: ['\u00c9chap'], desc: 'Fermer un dialog' },
]

const WORKFLOWS = [
  {
    title: 'Capturer une note',
    steps: [
      'Ouvrez le panneau avec Ctrl+Shift+A',
      'Tapez votre texte dans l\'éditeur en bas',
      'Ajoutez un screenshot si besoin (icône appareil photo)',
      'Appuyez sur Entrée pour enregistrer',
    ],
  },
  {
    title: 'Mode plein écran',
    steps: [
      'Cliquez sur l\'icône d\'agrandissement dans l\'en-tête',
      'Naviguez entre vos notes dans la sidebar gauche',
      'Éditez le titre, ajoutez des messages, exportez en PDF',
    ],
  },
  {
    title: 'Analyse IA',
    steps: [
      'Ouvrez une note puis cliquez sur l\'icône Sparkles (violet)',
      'Choisissez un type d\'analyse (neutre, mentor, action, libre)',
      'Sélectionnez le provider (ChatGPT, Claude, Gemini, Perplexity, Grok)',
      'Le contexte est envoyé automatiquement — le prompt est aussi copié en backup',
    ],
  },
]

const TIPS = [
  'Titrez chaque note clairement pour la retrouver facilement dans l\'historique.',
  'Utilisez les tags pour organiser vos notes par thème ou par session.',
  'Capturez d\'abord, analysez ensuite — ne perdez pas le momentum.',
  'Exportez en PDF pour archiver une version figée de vos notes.',
  'L\'analyse IA copie toujours le prompt dans le presse-papier en backup.',
]

const CHANGELOG = [
  {
    version: '1.2.4',
    title: 'Analyse IA multi-provider',
    items: [
      'Support de 5 providers : ChatGPT, Claude, Gemini, Perplexity, Grok',
      'Injection automatique du texte et upload PDF sur chaque provider',
      'Dropdown neutre de sélection du provider',
      'Upload dynamique : clics automatiques pour révéler le champ d\'upload (Gemini, Claude, Grok)',
    ],
  },
  {
    version: '1.2.3',
    title: 'Analyse IA ChatGPT + Stabilisation',
    items: [
      'Analyse IA ChatGPT avec 3 prompts + prompt libre',
      'Pré-remplissage automatique via ?q= pour les notes texte',
      'Tab Picker pour capture plein écran',
      'Utilitaires de formatage de date (formatSmartDate, formatCompactDate)',
      'Stabilisation UI et corrections de style',
    ],
  },
  {
    version: '1.2.0',
    title: 'Pipeline analyse IA',
    items: [
      'Génération PDF en mémoire (aucun téléchargement)',
      'Injection automatique dans ChatGPT via DataTransfer',
      'Callout images détectées avec feedback visuel',
      'Fallback clipboard + téléchargement PDF',
    ],
  },
  {
    version: '1.1.0',
    title: 'Refonte UI + Mode plein écran',
    items: [
      'Interface style messagerie (messages individuels)',
      'Mode plein écran avec sidebar de notes',
      'Éditeur enrichi (gras, italique, images)',
      'Export/Import JSON des données',
    ],
  },
  {
    version: '1.0.x',
    title: 'Fondations',
    items: [
      'Capture intelligente de pages web',
      'Screenshots intégrés',
      'Stockage local IndexedDB',
      'Mode sombre / clair',
      'Raccourcis clavier',
    ],
  },
]

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 text-xs font-mono font-medium bg-muted border border-border rounded shadow-sm">
      {children}
    </kbd>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Keyboard; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-muted rounded-lg">
          <Icon size={18} className="text-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

export default function GuideApp() {
  const isMac = navigator.platform.toUpperCase().includes('MAC')

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.close()}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Fermer"
              aria-label="Fermer"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Trading Notes</h1>
              <p className="text-xs text-muted-foreground">Guide d'utilisation — v{version}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Raccourcis clavier */}
        <Section icon={Keyboard} title="Raccourcis clavier">
          <div className="space-y-3">
            {SHORTCUTS.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">{s.desc}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(isMac ? s.mac : s.keys).map((k, j) => (
                    <React.Fragment key={j}>
                      {j > 0 && <span className="text-muted-foreground/40 text-xs">+</span>}
                      <Kbd>{k === 'Cmd' ? '\u2318' : k}</Kbd>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Utilisation typique */}
        <Section icon={BookOpen} title="Utilisation typique">
          <div className="space-y-5">
            {WORKFLOWS.map((w, i) => (
              <div key={i}>
                <h3 className="text-sm font-semibold text-foreground mb-2">{w.title}</h3>
                <ol className="space-y-1.5 ml-4">
                  {w.steps.map((step, j) => (
                    <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-xs font-medium text-muted-foreground/60 mt-0.5 flex-shrink-0">{j + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Section>

        {/* Bonnes pratiques */}
        <Section icon={Lightbulb} title="Bonnes pratiques">
          <ul className="space-y-2.5">
            {TIPS.map((tip, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Command size={14} className="text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Changelog */}
        <Section icon={Clock} title="Historique des versions">
          <div className="space-y-5">
            {CHANGELOG.map((entry, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-foreground">v{entry.version}</span>
                  <span className="text-xs text-muted-foreground">— {entry.title}</span>
                </div>
                <ul className="space-y-1 ml-4">
                  {entry.items.map((item, j) => (
                    <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-muted-foreground/40 mt-1.5 w-1 h-1 rounded-full bg-current flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Confidentialité */}
        <Section icon={Shield} title="Confidentialit\u00e9">
          <div className="space-y-2.5">
            {[
              'Toutes vos notes sont stockées localement sur votre appareil (IndexedDB).',
              'Aucune donnée personnelle n\'est collectée ni transmise.',
              'Aucun tracker, aucun analytics, aucun cookie tiers.',
              'L\'analyse IA ouvre le provider dans un nouvel onglet — vos données ne transitent pas par nos serveurs.',
            ].map((text, i) => (
              <p key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Shield size={14} className="text-green-500/60 flex-shrink-0 mt-0.5" />
                <span>{text}</span>
              </p>
            ))}
          </div>
        </Section>

        {/* Footer */}
        <div className="text-center py-6 text-xs text-muted-foreground/60">
          Trading Notes by AOKnowledge — v{version}
        </div>
      </main>
    </div>
  )
}
