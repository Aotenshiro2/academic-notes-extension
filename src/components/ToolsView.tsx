// « Autres outils AOK » (28/08) : la passerelle vers le reste de l'écosystème.
import React from 'react'
import { ArrowLeft, Compass, ExternalLink } from 'lucide-react'

const TOOLS = [
  {
    name: "Journal d'Études",
    desc: 'L’espace web où tes notes se travaillent : canvas, groupes, relecture, analytics.',
    url: 'https://journal.aoknowledge.com',
  },
  {
    name: 'AOKnowledge.com',
    desc: 'Le site de l’école : articles, vidéos, podcast Trading Edge Club.',
    url: 'https://aoknowledge.com',
  },
  {
    name: 'Masterclass',
    desc: 'Les masterclass AOK, sur ton compte.',
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
          aria-label="Retour"
        >
          <ArrowLeft size={16} />
        </button>
        <Compass size={16} className="text-blue-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-foreground">Autres outils AOK</h2>
      </div>

      <div className="space-y-2">
        {TOOLS.map(t => (
          <button
            key={t.url}
            onClick={() => chrome.tabs.create({ url: t.url })}
            className="w-full flex items-start gap-3 p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors text-left"
          >
            <ExternalLink size={14} className="text-muted-foreground/60 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">{t.name}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default ToolsView
