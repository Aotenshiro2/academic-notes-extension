import { toast } from '../lib/toast'
import React, { useState, useEffect, useRef } from 'react'
import {
  Settings,
  User,
  GraduationCap,
  LifeBuoy,
  BookOpen,
  Star,
  Link2,
  Clock,
  BadgeCheck,
  UserPlus,
  Compass,
  Globe,
  FileUp,
  Stethoscope,
  Lightbulb,
  X,
} from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import ImportTradesDialog from '@/components/ImportTradesDialog'
import { LigneBesoin } from '@/components/BesoinForm'
import { t, tp, getLangue, setLangue, subscribeLangue, langueSuivante, infoLangue, type Langue } from '@/lib/i18n'
import { LIGNES_FRICTION, etatPastilleSync, notesEnAttenteDeSync, type EcranCarnet } from '@/lib/ecrans-carnet'
import type { EcransCarnetEtat } from '@/lib/use-ecrans-carnet'
import type { NoteSummary } from '@/types/academic'

// Le pied du Carnet et le menu de la roue, les mêmes dans le panneau latéral
// et le plein écran (1.8.15). Sortis de sidepanel/App.tsx : le plein écran
// n'avait ni la langue, ni l'état de la synchronisation, ni le thème, ni le
// compte, ni le Guide, ni l'import des trades. Un ajout ici vaut pour les deux.
//
// Au-dessus du pied : la ligne d'une friction (besoins des membres, piste C)
// et la bulle de découverte de « Aide et idées » (piste B).

const LIEN_STORE = 'https://chromewebstore.google.com/detail/trading-notes-by-aoknowle/phajegonlmgnjkkfdooedoddnmgpheic'

interface PiedCarnetProps {
  ecrans: EcransCarnetEtat
  /** null : session pas encore lue. */
  connecte: boolean | null
  email: string | null
  /** Résumés des notes : la pastille compte celles qui attendent la synchronisation. */
  notes: NoteSummary[]
  /** Marges et largeur, posées par la vue (le panneau et le plein écran n'ont pas la même). */
  className?: string
}

export default function PiedCarnet({ ecrans, connecte, email, notes, className = '' }: PiedCarnetProps) {
  const { ecran, ouvrir, friction, bulleAide, fermerBulleAide } = ecrans

  // Langue d'usage. Le globe la fait tourner ; toutes les vues ouvertes
  // suivent sans rechargement.
  const [langue, setLangueLocale] = useState<Langue>(getLangue)
  useEffect(() => subscribeLangue(setLangueLocale), [])

  // Menu pop-up du bouton de la roue : le hub des écrans secondaires (retour
  // Brice 28/08) : un petit menu plutôt qu'un écran-fleuve à faire défiler.
  const [menuOuvert, setMenuOuvert] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOuvert) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOuvert(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOuvert])

  // « Importer mes trades » (1.8.13) : une ligne du menu de la roue. Pas un
  // écran : la boîte s'ouvre par-dessus ce qui est affiché.
  const [importOuvert, setImportOuvert] = useState(false)

  const enAttente = notesEnAttenteDeSync(notes)
  const pastille = etatPastilleSync(connecte, enAttente)

  const item = 'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left rounded-md text-foreground hover:bg-muted transition-colors'
  const ouvrirDepuisMenu = (cible: EcranCarnet, options?: { supportBesoin?: boolean }) => () => { setMenuOuvert(false); ouvrir(cible, options) }
  const onglet = (url: string) => () => { setMenuOuvert(false); chrome.tabs.create({ url }) }

  return (
    <>
      {/* Piste C (06/11) : la ligne d'une friction (capture, synchronisation, export), au-dessus du pied. */}
      {friction && ecran !== 'support' && (
        <div className={`pb-2 ${className}`}>
          <LigneBesoin
            phrase={t(LIGNES_FRICTION[friction].phrase)}
            onOuvrir={() => ecrans.ouvrirBesoinPrerempli(friction)}
            onMasquer={ecrans.masquerFriction}
          />
        </div>
      )}

      <div className={`relative pb-2 flex items-center justify-between ${className}`}>
        {/* Piste B (06/11) : la bulle de découverte, une seule fois, au-dessus
            de « Aide et idées ». Dessinée à la main dans le langage du menu
            de la roue (bg-popover, border, shadow-lg), apparition en CSS. */}
        {bulleAide && ecran !== 'support' && !menuOuvert && (
          <div
            id="aide-bulle"
            role="note"
            className="aide-bulle absolute bottom-full right-4 mb-1 z-40 w-56 rounded-lg border border-border bg-popover py-2 pl-3 pr-7 text-xs leading-snug text-foreground shadow-lg"
          >
            <span aria-hidden="true" className="absolute -bottom-[5px] right-16 w-2.5 h-2.5 rotate-45 border-b border-r border-border bg-popover" />
            {t('besoin.aideBulle')}
            <button
              onClick={fermerBulleAide}
              className="absolute top-1.5 right-1.5 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={t('commun.fermer')}
              aria-label={t('commun.fermer')}
            >
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60 select-none">v{chrome.runtime.getManifest().version}</span>
          <span className="text-muted-foreground/30">|</span>
          {/* Le globe fait tourner les langues disponibles : un cycle plutôt
              qu'une bascule, pour que le geste reste juste quand il y en aura
              quatre. Pas de drapeau emoji : les indicateurs régionaux n'ont pas
              de police sur Windows et retombent sur leurs deux lettres. */}
          <button
            onClick={() => setLangue(langueSuivante())}
            className="flex items-center gap-1 px-1 py-0.5 text-[10px] text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded transition-colors"
            title={`${t('sync.langue')} : ${infoLangue(langue).nom} — ${infoLangue(langueSuivante(langue)).nom}`}
            aria-label={`${t('sync.langue')} : ${infoLangue(langue).nom}`}
          >
            <Globe size={11} className="flex-shrink-0" aria-hidden="true" />
            {langue.toUpperCase()}
          </button>
          <span className="text-muted-foreground/30">|</span>
          {/* État de sync : l'échec silencieux de sync ne doit plus JAMAIS être invisible */}
          <button
            onClick={() => ouvrir('compte')}
            className={`px-1.5 py-0.5 text-[10px] rounded-full transition-colors ${
              pastille === 'horsLigne'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium'
                : pastille === 'aFaire'
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
            title={
              pastille === 'horsLigne'
                ? t('sync.nonConnecteAide')
                : pastille === 'aFaire'
                  ? tp('sync.enAttenteUn', 'sync.enAttentePlur', enAttente)
                  : t('sync.toutEstLa')
            }
          >
            {pastille === 'horsLigne'
              ? t('sync.horsLigne')
              : pastille === 'aFaire'
                ? `${enAttente} ${t('sync.aFaire')}`
                : `✓ ${t('sync.ok')}`}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle compact />
          {/* Piste A (06/11) : l'icône et le mot « Aide et idées » ; le mot se
              retire seulement si le panneau est plus étroit que 340 px. */}
          <button
            onClick={ecrans.basculerSupport}
            className={`flex items-center gap-1 p-1.5 hover:text-foreground hover:bg-muted rounded-md transition-colors ${ecran === 'support' ? 'text-blue-500 bg-muted' : 'text-muted-foreground'}`}
            title={t('besoin.aideLibelle')}
            aria-label={t('besoin.aideLibelle')}
            aria-describedby={bulleAide && ecran !== 'support' ? 'aide-bulle' : undefined}
          >
            <LifeBuoy size={14} className="flex-shrink-0" />
            <span className="hidden min-[340px]:inline text-[11px] leading-none whitespace-nowrap">{t('besoin.aideLibelle')}</span>
          </button>
          <button
            onClick={() => ecrans.basculer('mentorat')}
            className={`p-1.5 hover:text-foreground hover:bg-muted rounded-md transition-colors ${ecran === 'mentorat' ? 'text-foreground bg-muted' : 'text-muted-foreground'}`}
            title={`${t('mentorat.titre')}
${t('mentorat.entreeAide')}`}
            aria-label={t('mentorat.titre')}
          >
            <GraduationCap size={14} />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOuvert(o => !o)}
              className={`p-1.5 hover:text-foreground hover:bg-muted rounded-md transition-colors ${ecran === 'reglages' || menuOuvert ? 'text-foreground bg-muted' : 'text-muted-foreground'}`}
              title={t('menu.aide')}
              aria-label={t('menu.aide')}
              aria-haspopup="menu"
              aria-expanded={menuOuvert}
            >
              <Settings size={14} />
            </button>
            {menuOuvert && (
              <div className="absolute bottom-8 right-0 z-50 w-52 rounded-lg border border-border bg-popover shadow-lg p-1" role="menu">
                {/* Qui est connecté. En tête de menu parce que c'est la question
                    qu'on se pose avant de cliquer sur quoi que ce soit ici :
                    plusieurs comptes coexistent, et se tromper veut dire
                    synchroniser dans le mauvais journal. Cliquer ouvre le compte. */}
                <button
                  onClick={ouvrirDepuisMenu('compte')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors text-left"
                  role="menuitem"
                  title={email ?? t('menu.seConnecter')}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${connecte ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] leading-tight text-foreground truncate">
                      {email ?? t('menu.visiteur')}
                    </span>
                    <span className="block text-[10px] leading-tight text-muted-foreground">
                      {connecte ? t('menu.connecte') : t('menu.nonConnecte')}
                    </span>
                  </span>
                </button>
                <div className="my-1 border-t border-border/60" />
                <button onClick={ouvrirDepuisMenu('reglages')} className={item} role="menuitem">
                  <Settings size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.parametres')}
                </button>
                <button onClick={ouvrirDepuisMenu('configIA')} className={item} role="menuitem">
                  <Link2 size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.configurerIA')}
                </button>
                <button onClick={ouvrirDepuisMenu('compte')} className={item} role="menuitem">
                  <User size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.compte')}
                </button>
                <button
                  onClick={() => { setMenuOuvert(false); setImportOuvert(true) }}
                  className={item}
                  role="menuitem"
                >
                  <FileUp size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.importerTrades')}
                </button>
                <div className="my-1 border-t border-border/60" />
                <button onClick={onglet(chrome.runtime.getURL('src/guide/index.html'))} className={item} role="menuitem">
                  <BookOpen size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.bonnesPratiques')}
                </button>
                <button onClick={onglet(chrome.runtime.getURL('src/guide/index.html') + '#versions')} className={item} role="menuitem">
                  <Clock size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.versions')}
                </button>
                {/* 1.8.14 : les infos de la machine et le déroulé du dernier envoi IA, à l'équipe au geste du membre */}
                <button onClick={ouvrirDepuisMenu('diagnostic')} className={item} role="menuitem">
                  <Stethoscope size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.diagnostic')}
                </button>
                {/* Besoins des membres (lot 2, 06/11) : à côté du diagnostic, le même formulaire que la bande du Support */}
                <button onClick={ouvrirDepuisMenu('support', { supportBesoin: true })} className={item} role="menuitem">
                  <Lightbulb size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.besoin')}
                </button>
                <div className="my-1 border-t border-border/60" />
                <button onClick={ouvrirDepuisMenu('forfait')} className={item} role="menuitem">
                  <BadgeCheck size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.forfait')}
                </button>
                <button
                  onClick={async () => {
                    setMenuOuvert(false)
                    try {
                      await navigator.clipboard.writeText(LIEN_STORE)
                      toast.success(t('panneau.lienCopie'))
                    } catch {
                      toast.error(t('mentorat.copieImpossible'))
                    }
                  }}
                  className={item}
                  role="menuitem"
                >
                  <UserPlus size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.inviter')}
                </button>
                <button onClick={ouvrirDepuisMenu('outils')} className={item} role="menuitem">
                  <Compass size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.autresOutils')}
                </button>
                <button onClick={onglet(`${LIEN_STORE}/reviews`)} className={item} role="menuitem">
                  <Star size={13} className="text-muted-foreground flex-shrink-0" />
                  {t('menu.evaluer')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Boîte « Importer mes trades », ouverte depuis le menu de la roue (1.8.13) */}
      {importOuvert && <ImportTradesDialog onClose={() => setImportOuvert(false)} />}
    </>
  )
}
