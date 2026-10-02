// « Autres outils AOK » (28/08) : la passerelle vers le reste de l'écosystème.
import React from 'react'
import { ArrowLeft, Compass, ExternalLink } from 'lucide-react'
import { t, type CleI18n } from '@/lib/i18n'

// Des clés et pas des textes : la liste est figée au chargement du module, la
// langue, elle, peut changer pendant que le panneau est ouvert.
const TOOLS: { name: CleI18n | null; nom?: string; desc: CleI18n; url: string }[] = [
  {
    name: 'outils.journalNom',
    desc: 'outils.journalDesc',
    url: 'https://journal.aoknowledge.com',
  },
  {
    name: null,
    nom: 'AOKnowledge.com',
    desc: 'outils.siteDesc',
    url: 'https://aoknowledge.com',
  },
  {
    name: null,
    nom: 'Masterclass',
    desc: 'outils.masterclassDesc',
    url: 'https://masterclass.aoknowledge.com',
  },
]

function ToolsView({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          aria-label={t('commun.retour')}
        >
          <ArrowLeft size={16} />
        </button>
        <Compass size={16} className="text-blue-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-foreground">{t('menu.autresOutils')}</h2>
      </div>

      <div className="space-y-2">
        {TOOLS.map(outil => (
          <button
            key={outil.url}
            onClick={() => chrome.tabs.create({ url: outil.url })}
            className="w-full flex items-start gap-3 p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors text-left"
          >
            <ExternalLink size={14} className="text-muted-foreground/60 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">{outil.name ? t(outil.name) : outil.nom}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{t(outil.desc)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default ToolsView
