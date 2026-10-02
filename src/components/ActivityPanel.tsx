import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { t, locale } from '@/lib/i18n'
import { activiteDuCarnet, cleJour, niveauDuJour, type Journee } from '@/lib/activite'
import { lireConsultations, surveillerConsultations } from '@/lib/consultations'
import type { NoteSummary } from '@/types/academic'

// Le panneau d'activité de l'accueil (1.8.10) : une case par jour sur douze
// mois, plus foncée quand l'élève a noté, capturé, parlé au mentor, jugé des
// trades ou rouvert ses notes. Même
// lecture que « Mon activité » du picker hebdo de Brice, à la taille du panneau
// latéral : la grille défile à l'horizontale et s'ouvre sur les dernières
// semaines, le reste de l'année est à gauche.

const SEMAINES = 53
const CASE = 10
const ECART = 2
const COLONNE_JOURS = 26

const TEINTES = [
  'bg-muted',
  'bg-green-500/35',
  'bg-green-500/55',
  'bg-green-500/80',
  'bg-green-500',
] as const

interface ActivityPanelProps {
  notes: NoteSummary[]
}

/** Le jour, à minuit local, décalé de `n` jours (sans piège à l'heure d'été). */
function decaler(jour: Date, n: number): Date {
  return new Date(jour.getFullYear(), jour.getMonth(), jour.getDate() + n)
}

function detailDuJour(j: Journee | undefined): string {
  if (!j || niveauDuJour(j) === 0) return t('activite.rien')
  const morceaux: string[] = []
  if (j.ecrits > 0) morceaux.push(j.ecrits === 1 ? t('activite.ecrits1') : t('activite.ecrits', { n: j.ecrits }))
  if (j.mentor > 0) morceaux.push(j.mentor === 1 ? t('activite.mentor1') : t('activite.mentor', { n: j.mentor }))
  if (j.trades > 0) morceaux.push(j.trades === 1 ? t('activite.trades1') : t('activite.trades', { n: j.trades }))
  if (j.jugements > 0) morceaux.push(j.jugements === 1 ? t('activite.jugements1') : t('activite.jugements', { n: j.jugements }))
  if (j.consultees > 0) morceaux.push(j.consultees === 1 ? t('activite.consultees1') : t('activite.consultees', { n: j.consultees }))
  return morceaux.join(', ')
}

function ActivityPanel({ notes }: ActivityPanelProps) {
  const defileRef = useRef<HTMLDivElement>(null)
  const [survol, setSurvol] = useState<string | null>(null)

  const [consultations, setConsultations] = useState<Record<string, number>>({})
  useEffect(() => {
    let vivant = true
    void lireConsultations().then(c => { if (vivant) setConsultations(c) })
    const stop = surveillerConsultations(setConsultations)
    return () => { vivant = false; stop() }
  }, [])

  const parJour = useMemo(() => activiteDuCarnet(notes, consultations), [notes, consultations])

  const { semaines, mois, actifs, serie, aujourdhui } = useMemo(() => {
    const maintenant = new Date()
    const auj = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
    // Semaines du lundi au dimanche, la dernière colonne est celle d'aujourd'hui
    const lundiCourant = decaler(auj, -((auj.getDay() + 6) % 7))
    const premierLundi = decaler(lundiCourant, -(SEMAINES - 1) * 7)

    const cols: { cle: string; date: Date; futur: boolean }[][] = []
    for (let s = 0; s < SEMAINES; s++) {
      const col: { cle: string; date: Date; futur: boolean }[] = []
      for (let j = 0; j < 7; j++) {
        const date = decaler(premierLundi, s * 7 + j)
        col.push({ cle: cleJour(date), date, futur: date > auj })
      }
      cols.push(col)
    }

    // Un nom de mois au-dessus de la semaine où il commence. La toute première
    // colonne n'en porte pas si le mois suivant arrive tout de suite : les deux
    // libellés se chevaucheraient.
    const fmtMois = new Intl.DateTimeFormat(locale(), { month: 'short' })
    const etiquettes: { col: number; nom: string }[] = []
    for (let s = 0; s < SEMAINES; s++) {
      const m = cols[s][0].date.getMonth()
      const avant = s > 0 ? cols[s - 1][0].date.getMonth() : null
      if (avant === null || m !== avant) etiquettes.push({ col: s, nom: fmtMois.format(cols[s][0].date) })
    }
    if (etiquettes.length > 1 && etiquettes[1].col - etiquettes[0].col < 3) etiquettes.shift()

    let nbActifs = 0
    for (const col of cols) for (const c of col) if (!c.futur && niveauDuJour(parJour.get(c.cle)) > 0) nbActifs++

    // Série : jours consécutifs jusqu'à aujourd'hui. Une journée pas encore
    // notée ne la casse pas : elle compte à partir d'hier tant qu'on y est.
    let jour = niveauDuJour(parJour.get(cleJour(auj))) > 0 ? auj : decaler(auj, -1)
    let nbSerie = 0
    while (niveauDuJour(parJour.get(cleJour(jour))) > 0) {
      nbSerie++
      jour = decaler(jour, -1)
    }

    return { semaines: cols, mois: etiquettes, actifs: nbActifs, serie: nbSerie, aujourdhui: cleJour(auj) }
  }, [parJour])

  // S'ouvrir sur les dernières semaines : c'est là que l'élève se situe
  useLayoutEffect(() => {
    const el = defileRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [semaines])

  const fmtJour = useMemo(
    () => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }),
    []
  )
  const fmtJourSemaine = useMemo(() => new Intl.DateTimeFormat(locale(), { weekday: 'short' }), [])

  const resume = actifs === 0
    ? null
    : actifs === 1 ? t('activite.joursActifs1') : t('activite.joursActifs', { n: actifs })

  let pied: string | null
  if (survol) {
    const [a, m, j] = survol.split('-').map(Number)
    pied = `${fmtJour.format(new Date(a, m - 1, j))} : ${detailDuJour(parJour.get(survol))}`
  } else if (actifs === 0) {
    pied = t('activite.vide')
  } else if (serie >= 2) {
    pied = t('activite.serie', { n: serie })
  } else {
    pied = null
  }

  const pas = CASE + ECART
  const lignes = `14px repeat(7, ${CASE}px)`

  return (
    <div className="w-full rounded-lg border border-border px-3 pt-2.5 pb-2">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-sm font-medium text-foreground">{t('activite.titre')}</span>
        {resume && <span className="text-[11px] text-muted-foreground tabular-nums">{resume}</span>}
      </div>

      <div
        ref={defileRef}
        className="overflow-x-auto overflow-y-hidden pb-1"
        style={{ scrollbarWidth: 'thin' }}
        onMouseLeave={() => setSurvol(null)}
      >
        <div
          role="img"
          aria-label={resume ? `${t('activite.aria')}, ${resume}` : t('activite.aria')}
          className="grid"
          style={{
            gridTemplateColumns: `${COLONNE_JOURS}px repeat(${SEMAINES}, ${CASE}px)`,
            gridTemplateRows: lignes,
            columnGap: ECART,
            rowGap: ECART,
            width: COLONNE_JOURS + SEMAINES * pas,
          }}
        >
          {/* Jours de la semaine : colonne collée à gauche pendant le défilement */}
          <div
            className="sticky left-0 z-[1] bg-background grid"
            style={{ gridColumn: 1, gridRow: '1 / span 8', gridTemplateRows: lignes, rowGap: ECART }}
          >
            <span />
            {semaines[0].map((c, i) => (
              <span key={i} className="text-[9px] leading-[10px] text-muted-foreground/70">
                {i % 2 === 0 && i < 6 ? fmtJourSemaine.format(c.date) : ''}
              </span>
            ))}
          </div>

          {mois.map(m => (
            <span
              key={`m-${m.col}`}
              className="text-[9.5px] leading-[14px] text-muted-foreground/70 whitespace-nowrap"
              style={{ gridColumn: m.col + 2, gridRow: 1 }}
            >
              {m.nom}
            </span>
          ))}

          {semaines.map((col, s) =>
            col.map((c, j) => c.futur ? null : (
              <span
                key={c.cle}
                onMouseEnter={() => setSurvol(c.cle)}
                onClick={() => setSurvol(prev => (prev === c.cle ? null : c.cle))}
                className={`block rounded-[2px] cursor-default ${TEINTES[niveauDuJour(parJour.get(c.cle))]} ${c.cle === aujourdhui ? 'ring-1 ring-foreground/40' : ''}`}
                style={{ gridColumn: s + 2, gridRow: j + 2, width: CASE, height: CASE }}
              />
            ))
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-1 min-h-[16px]">
        <span className="text-[11px] text-muted-foreground truncate" aria-live="polite">{pied}</span>
        <span className="flex items-center gap-[3px] flex-shrink-0 text-[10px] text-muted-foreground/70" aria-hidden="true">
          <span className="mr-0.5">{t('activite.moins')}</span>
          {TEINTES.map((teinte, i) => (
            <span key={i} className={`block rounded-[2px] ${teinte}`} style={{ width: CASE, height: CASE }} />
          ))}
          <span className="ml-0.5">{t('activite.plus')}</span>
        </span>
      </div>
    </div>
  )
}

export default ActivityPanel
