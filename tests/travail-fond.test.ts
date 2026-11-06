// Le travail de fond (1.8.15) : une seule vue le fait à la fois, la suivante
// prend la relève quand la première se ferme. Le vrai verrou est navigator.locks ;
// ici un faux LockManager qui en suit les règles (file d'attente par nom, verrou
// rendu quand le rappel finit, demande retirée par son signal).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { VERROU_TRAVAIL_FOND, prendreTravailDeFond, type Verrous } from '../src/lib/travail-fond.ts'

type Demande = { rappel: () => Promise<void>; servie: boolean; finir: (v?: unknown) => void; echouer: (e: unknown) => void }

class FauxVerrous implements Verrous {
  files = new Map<string, Demande[]>()
  tenus = new Set<string>()
  noms: string[] = []

  request(nom: string, options: { signal?: AbortSignal }, rappel: () => Promise<void>): Promise<unknown> {
    this.noms.push(nom)
    return new Promise((finir, echouer) => {
      if (options.signal?.aborted) { echouer(new Error('AbortError')); return }
      const demande: Demande = { rappel, servie: false, finir, echouer }
      options.signal?.addEventListener('abort', () => {
        const file = this.files.get(nom) ?? []
        const i = file.indexOf(demande)
        // Le signal ne retire qu'une demande pas encore servie (règle de Web Locks)
        if (i >= 0 && !demande.servie) { file.splice(i, 1); echouer(new Error('AbortError')) }
      })
      if (!this.files.has(nom)) this.files.set(nom, [])
      this.files.get(nom)!.push(demande)
      this.servir(nom)
    })
  }

  private servir(nom: string) {
    if (this.tenus.has(nom)) return
    const file = this.files.get(nom) ?? []
    const demande = file[0]
    if (!demande) return
    demande.servie = true
    this.tenus.add(nom)
    Promise.resolve()
      .then(() => demande.rappel())
      .then(v => demande.finir(v), e => demande.echouer(e))
      .finally(() => {
        file.shift()
        this.tenus.delete(nom)
        this.servir(nom)
      })
  }
}

const tick = () => new Promise(r => setImmediate(r))

test('la première vue ouverte fait le travail de fond, la seconde attend', async () => {
  const verrous = new FauxVerrous()
  const travail: string[] = []
  prendreTravailDeFond(verrous, () => travail.push('panneau'))
  prendreTravailDeFond(verrous, () => travail.push('plein écran'))
  await tick(); await tick()
  assert.deepEqual(travail, ['panneau'])
  assert.deepEqual(verrous.noms, [VERROU_TRAVAIL_FOND, VERROU_TRAVAIL_FOND], 'un seul verrou, le même nom pour les deux vues')
})

test('la vue qui attend prend la relève quand l\'autre se ferme, une seule fois', async () => {
  const verrous = new FauxVerrous()
  const travail: string[] = []
  const fermerPanneau = prendreTravailDeFond(verrous, () => travail.push('panneau'))
  prendreTravailDeFond(verrous, () => travail.push('plein écran'))
  await tick(); await tick()
  fermerPanneau()
  await tick(); await tick(); await tick()
  assert.deepEqual(travail, ['panneau', 'plein écran'])
})

test('une vue fermée avant son tour ne travaille jamais, la suivante passe', async () => {
  const verrous = new FauxVerrous()
  const travail: string[] = []
  const fermerPanneau = prendreTravailDeFond(verrous, () => travail.push('panneau'))
  const fermerPleinEcran = prendreTravailDeFond(verrous, () => travail.push('plein écran 1'))
  prendreTravailDeFond(verrous, () => travail.push('plein écran 2'))
  await tick()
  fermerPleinEcran()
  await tick()
  fermerPanneau()
  await tick(); await tick(); await tick()
  assert.deepEqual(travail, ['panneau', 'plein écran 2'])
})

test('lâcher deux fois le verrou ne casse rien', async () => {
  const verrous = new FauxVerrous()
  const travail: string[] = []
  const fermer = prendreTravailDeFond(verrous, () => travail.push('panneau'))
  await tick()
  fermer(); fermer()
  prendreTravailDeFond(verrous, () => travail.push('plein écran'))
  await tick(); await tick(); await tick()
  assert.deepEqual(travail, ['panneau', 'plein écran'])
})

test('sans Web Locks : la vue travaille, comme le panneau avant la 1.8.15', () => {
  const travail: string[] = []
  const fermer = prendreTravailDeFond(undefined, () => travail.push('panneau'))
  assert.deepEqual(travail, ['panneau'])
  fermer()
})

test('le panneau et le plein écran passent tous deux par le verrou, et plus rien ne tourne en dehors', () => {
  for (const chemin of ['src/sidepanel/App.tsx', 'src/fullscreen/FullscreenApp.tsx']) {
    const source = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    assert.ok(source.includes('useTravailDeFond({'), `${chemin} ne passe pas par useTravailDeFond`)
    assert.ok(!source.includes('envoyerActivite('), `${chemin} envoie l'activité hors du verrou`)
    assert.ok(!source.includes('obtenirNoteMentorat('), `${chemin} crée la note du mentorat hors du verrou`)
    assert.ok(!source.includes('[AOK AutoSync]'), `${chemin} rattrape la sync hors du verrou`)
  }
})
