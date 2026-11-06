import { toast } from '../lib/toast'
import React, { useState } from 'react'
import { Loader2, Sunrise, Sparkles, Lock } from 'lucide-react'
import DolBar from '@/components/DolBar'
import storage from '@/lib/storage'
import { etudierNote } from '@/lib/capture-ia'
import { blocEtude, contenuAEtudier, noteAvecDol, noteAvecWarmup, noteEnrichieParEtude } from '@/lib/outils-note'
import { t } from '@/lib/i18n'
import type { DolLevel } from '@/types/academic'

// La rangée d'outils de la note : « Poser un DOL », « Lancer un warmup »,
// « Approfondir ». Un seul composant pour le panneau latéral ET le plein écran
// (1.8.15) : Brice, le 06/11, ne trouvait aucun de ces boutons en plein écran,
// parce que la rangée vivait dans sidepanel/App.tsx. Un ajout ici vaut pour les
// deux vues.
//
// Tout part d'un clic, rien ne tourne en fond. Chaque geste relit la note
// fraîche avant d'écrire, pour ne rien écraser de ce qu'une autre vue vient
// d'enregistrer.

interface OutilsNoteRangeeProps {
  noteId: string
  /** Le compte a droit à l'étude. Sert SEULEMENT à l'affichage (aura ou cadenas) :
   *  le serveur re-vérifie le droit et le budget à chaque appel. */
  etudeOuverte: boolean
  /** Modèle d'étude préféré (Paramètres), transmis tel quel au serveur. */
  modeleEtude?: string | null
  /** Après chaque écriture : relire les notes et rafraîchir la vue de la note. */
  onChange: () => void | Promise<void>
  /** Étude refusée parce que réservée au forfait : la vue montre l'explication
   *  (le panneau latéral ouvre l'écran mentorat). Le message part en toast dans tous les cas. */
  onEtudeReservee?: () => void
  className?: string
}

const BOUTON = 'inline-flex items-center gap-1.5 px-2.5 py-1 [@media(max-width:400px)]:px-1.5 [@media(max-width:400px)]:gap-1 rounded-md text-[11px] font-medium transition-colors'

export default function OutilsNoteRangee({ noteId, etudeOuverte, modeleEtude, onChange, onEtudeReservee, className }: OutilsNoteRangeeProps) {
  const [etudeEnCours, setEtudeEnCours] = useState(false)

  // « Poser un DOL » : ajoute le niveau à la note ouverte
  const poserDol = async (dol: Omit<DolLevel, 'id' | 'createdAt' | 'status'>) => {
    const fresh = await storage.getNote(noteId)
    if (!fresh) return
    await storage.saveNote(noteAvecDol(fresh, dol, crypto.randomUUID(), Date.now()))
    await onChange()
  }

  // « Lancer un warmup » : il s'ajoute au fil au moment du clic
  const lancerWarmup = async () => {
    const fresh = await storage.getNote(noteId)
    if (!fresh) return
    await storage.saveNote(noteAvecWarmup(fresh, crypto.randomUUID(), Date.now()))
    await onChange()
  }

  // « Approfondir » (1.8.0) : l'étude. Relit la note dans le cadre de
  // l'académie et écrit la lecture DANS la note, contrairement à « Analyser »
  // qui envoie la note vers l'IA personnelle de l'élève. Volontairement à la
  // main : la lecture vaut le plus à la relecture, pas dans la seconde qui suit.
  const approfondir = async () => {
    if (etudeEnCours) return
    const full = await storage.getNote(noteId)
    if (!full) return

    setEtudeEnCours(true)
    try {
      // Le contenu BRUT de la note, pas un résumé : au banc, la meilleure
      // trouvaille venait de la lecture du tableau brut.
      const image = full.messages?.find(m => m.type === 'image')?.content ?? null
      const { sortie, refus, message } = await etudierNote(
        {
          url: full.url,
          pageTitle: full.title,
          content: contenuAEtudier(full),
          summary: full.summary,
          keyPoints: full.keyPoints,
          concepts: full.concepts,
          tags: full.tags,
        },
        image,
        noteId,
        modeleEtude ?? null
      )

      if (refus === 'reservee') {
        toast.info(message || t('note.approfondirRefus'))
        onEtudeReservee?.()
        return
      }
      if (refus || !sortie) {
        toast.error(message || t('note.etudeIndisponible'))
        return
      }

      await storage.addMessageToNote(noteId, { type: 'text', content: blocEtude(sortie) })

      // Relire après l'ajout du bloc : saveNote réécrit tout l'enregistrement,
      // repartir de `full` effacerait le bloc qu'on vient de poser.
      const apresBloc = await storage.getNote(noteId)
      const enrichie = apresBloc ? noteEnrichieParEtude(apresBloc, sortie) : null
      if (enrichie) await storage.saveNote(enrichie)

      await onChange()
      toast.success(t('note.etudeAjoutee'))
    } catch (e) {
      console.error('[etude]', e)
      toast.error(t('note.etudeIndisponible'))
    } finally {
      setEtudeEnCours(false)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ''}`}>
      <DolBar
        dols={[]}
        onAdd={(dol) => { void poserDol(dol) }}
        onCycleStatus={() => {}}
        onDelete={() => {}}
      />
      <button
        onClick={() => { void lancerWarmup() }}
        className={`${BOUTON} text-blue-600/80 dark:text-blue-400/80 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10`}
        title={t('panneau.warmupAide')}
      >
        <Sunrise size={13} className="flex-shrink-0" />
        {t('capture.warmup')}
      </button>
      {/* « Approfondir » : l'action d'étude en dernier. Libellé court pour tenir
          sur la ligne à 360 px ; le texte complet et l'aide sont dans le title.
          Verrouillé, il reste visible (voir la fonction convertit mieux qu'un
          bouton absent) : le clic passe quand même, le serveur refuse et la vue
          montre l'explication du forfait. */}
      <button
        onClick={() => { if (!etudeEnCours) void approfondir() }}
        disabled={etudeEnCours}
        className={`${BOUTON} ${
          etudeEnCours
            ? 'text-muted-foreground cursor-wait'
            : etudeOuverte
              ? 'aura-ia aura-ia-discrete text-foreground/80 hover:text-foreground hover:bg-muted'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
        title={etudeEnCours
          ? t('note.approfondirEnCours')
          : etudeOuverte
            ? `${t('note.approfondir')}\n${t('note.approfondirAide')}`
            : `${t('note.approfondirVerrouille')}\n${t('note.approfondirRefus')}`}
        aria-label={etudeOuverte || etudeEnCours ? t('note.approfondir') : t('note.approfondirVerrouille')}
        aria-busy={etudeEnCours}
      >
        {etudeEnCours
          ? <Loader2 size={13} className="animate-spin flex-shrink-0" />
          : etudeOuverte
            ? <Sparkles size={13} className="flex-shrink-0" />
            : <Lock size={13} className="flex-shrink-0" />}
        {t('note.approfondirCourt')}
      </button>
    </div>
  )
}
