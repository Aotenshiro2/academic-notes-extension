// « Envoyer un diagnostic » (1.8.14) : les règles pures. Collecte sans contenu,
// anneau d'erreurs, déroulé d'envoi, drapeau de rendu logiciel, bornes, cadence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ajouterErreur, bornerDiagnostic, cadenceLocale, codeToast, compterFichiers, construireDiagnostic, erreursSures,
  MAX_ERREURS, nettoyerMessage, normaliserTrace, OCTETS_MAX, premiereFrame, renduLogiciel, sourceSure, typePage, zoomEstime,
  type EntreesDiagnostic, type ErreurNotee,
} from '../src/lib/diagnostic-pur.ts'
import { cleDuTexte } from '../src/lib/i18n.ts'

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
const NOTE = 'Biais haussier, DOL au-dessus du high de la veille'
const TITRE = 'Séance NQ secrète'

const erreur = (champs: Partial<ErreurNotee> = {}): ErreurNotee => ({
  le: 1_000, ou: 'panneau', genre: 'erreur', message: 'TypeError: x is not a function', source: 'chunks/a.js', ligne: 3, colonne: 9, fois: 1, ...champs,
})

test('message nettoyé : adresses, emails, jetons, textes entre guillemets, data URL', () => {
  assert.equal(nettoyerMessage("TypeError: Cannot read properties of undefined (reading 'map')"), "TypeError: Cannot read properties of undefined (reading 'map')")
  const json = nettoyerMessage(`SyntaxError: Unexpected token 'B', "${NOTE}" is not valid JSON`)
  assert.ok(!json.includes('Biais'), json)
  assert.ok(json.includes('<texte>'))
  assert.equal(nettoyerMessage('Failed to fetch https://journal-d-etude-beta.vercel.app/api/notes?id=42'), 'Failed to fetch <adresse>')
  assert.equal(nettoyerMessage(`boom at ${EXT}/chunks/index-x.js:3:4`), 'boom at ext:chunks/index-x.js:3:4')
  assert.equal(nettoyerMessage('mauvais compte brice@example.com'), 'mauvais compte <email>')
  assert.ok(!nettoyerMessage('jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc').includes('eyJ'))
  assert.ok(!nettoyerMessage('Failed to load image: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB').includes('iVBOR'))
  assert.ok(!nettoyerMessage('compte 12345678 et note 0f8fad5b-d9cb-469f-a165-70867728950e').match(/12345678|0f8fad5b/))
  assert.equal(nettoyerMessage(new Error('rien')), 'Error: rien')
  assert.equal(nettoyerMessage(null), '')
  assert.ok(nettoyerMessage('x'.repeat(500)).length <= 200)
  // Une ligne seulement : la suite d'une pile reste sur l'appareil.
  assert.equal(nettoyerMessage('premiere\nseconde'), 'premiere')
})

test("source : le fichier de l'extension, jamais une adresse de page", () => {
  assert.equal(sourceSure(`${EXT}/chunks/index-x.js?v=2`), 'chunks/index-x.js')
  assert.equal(sourceSure('https://www.tradingview.com/chart/AbCd/'), '<page>')
  assert.equal(sourceSure(''), undefined)
  assert.deepEqual(premiereFrame(`Error: x\n    at f (${EXT}/chunks/b.js:12:34)`), { source: 'chunks/b.js', ligne: 12, colonne: 34 })
  assert.deepEqual(premiereFrame(undefined), {})
})

test("anneau d'erreurs : 30 au plus, la plus récente en dernier, la même erreur compte ses fois", () => {
  let anneau: ErreurNotee[] = []
  for (let i = 0; i < 40; i++) anneau = ajouterErreur(anneau, erreur({ le: i, message: `erreur ${i}` }))
  assert.equal(anneau.length, MAX_ERREURS)
  assert.equal(anneau[0].message, 'erreur 10')
  assert.equal(anneau.at(-1)?.message, 'erreur 39')
  anneau = ajouterErreur(anneau, erreur({ le: 100, message: 'erreur 12' }))
  assert.equal(anneau.length, MAX_ERREURS)
  assert.equal(anneau.at(-1)?.message, 'erreur 12')
  assert.equal(anneau.at(-1)?.fois, 2)
  assert.equal(anneau.filter(e => e.message === 'erreur 12').length, 1)
  // Un stockage abîmé ne casse rien.
  assert.deepEqual(ajouterErreur('n importe quoi', erreur()).length, 1)
  assert.deepEqual(erreursSures([{ le: 'x' }, erreur(), null]).length, 1)
})

test('toast : la clé du message, jamais son texte', () => {
  assert.equal(codeToast('mentorat.copieImpossible'), 'mentorat.copieImpossible')
  assert.equal(codeToast(null), 'hors-dictionnaire')
  assert.equal(codeToast('Un texte avec des espaces'), 'hors-dictionnaire')
  // Le texte affiché retrouve sa clé, remplacements compris (en FR comme en EN).
  assert.equal(cleDuTexte('Erreur lors de la capture de la page'), 'panneau.erreurCapturePage')
  assert.equal(cleDuTexte(`Ce fichier ne se lit pas.`), 'import.illisible')
  assert.equal(cleDuTexte('Retirer Mon relevé secret.pdf'), 'import.retirer')
  assert.equal(cleDuTexte('un message du serveur'), null)
})

test('rendu logiciel : SwiftShader, llvmpipe, Microsoft Basic Render', () => {
  assert.equal(renduLogiciel('Google Inc. (Google)', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'), true)
  assert.equal(renduLogiciel('Mesa', 'llvmpipe (LLVM 15.0.7, 256 bits)'), true)
  assert.equal(renduLogiciel('Google Inc. (Microsoft)', 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)'), true)
  assert.equal(renduLogiciel('Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)'), false)
  assert.equal(renduLogiciel(null, undefined), false)
})

test('zoom estimé depuis devicePixelRatio', () => {
  assert.deepEqual(zoomEstime(1), { zoom: 1, echelle: 1 })
  assert.deepEqual(zoomEstime(1.25), { zoom: 1, echelle: 1.25 })
  assert.deepEqual(zoomEstime(1.1), { zoom: 1.1, echelle: 1 })
  assert.deepEqual(zoomEstime(1.375), { zoom: 1.1, echelle: 1.25 })
  assert.deepEqual(zoomEstime(0.9), { zoom: 0.9, echelle: 1 })
  assert.equal(zoomEstime(Number.NaN), null)
})

test("type de page : conversation existante ou nouvelle, jamais l'identifiant", () => {
  assert.deepEqual(typePage('https://chatgpt.com/c/6721a9f0-1234-8000-aaaa-0123456789ab'), { page: 'conversation', projet: false })
  assert.deepEqual(typePage('https://chatgpt.com/g/g-p-67aa-trading/c/abc'), { page: 'conversation', projet: true })
  assert.deepEqual(typePage('https://chatgpt.com/'), { page: 'nouvelle', projet: false })
  assert.deepEqual(typePage('https://claude.ai/new'), { page: 'nouvelle', projet: false })
  assert.deepEqual(typePage('https://claude.ai/chat/0f8f'), { page: 'conversation', projet: false })
  assert.deepEqual(typePage('https://gemini.google.com/app/12ab'), { page: 'conversation', projet: false })
  assert.deepEqual(typePage('pas une adresse'), { page: 'autre', projet: false })
})

test("déroulé d'envoi : borné, sans nom de fichier ni identifiant de conversation", () => {
  const brut = {
    le: 2_000, fournisseur: 'chatgpt', mode: 'fil', page: 'conversation', projet: false,
    fichiers: compterFichiers([{ mime: 'application/pdf' }, { mime: 'text/markdown' }]),
    stabilite: { ms: 2400, atteinte: true }, declencheurs: null,
    champsVus: [{ id: 'upload-files', accept: '' }, { id: 'x y z <script>', accept: 'image/*,.png' }, ...Array(10).fill({ id: 'a', accept: '' })],
    voies: [{ voie: 'champ', donne: true, vu: false, ms: 6012 }, { voie: 'champ-remplace', donne: true, vu: true, ms: 1200 }, { voie: 'inconnue', donne: true }],
    pdfUploaded: true, pdfNonVu: false, imageOnly: false, promptFilled: true,
    durees: { chargement: 3200, attente: 2500, injection: 9100, total: 15800 },
    erreur: null, repli: false,
    // Ce qui ne doit pas sortir, même glissé dans l'objet :
    nom: 'Seance-NQ-secrete.pdf', adresse: 'https://chatgpt.com/c/6721a9f0', prompt: NOTE,
  }
  const t = normaliserTrace(brut)
  assert.ok(t)
  assert.equal(t.fichiers.pdf, 1)
  assert.equal(t.fichiers.autres, 1)
  assert.equal(t.champsVus.length, 8)
  assert.equal(t.champsVus[1].id, '')
  assert.equal(t.voies.length, 2)
  assert.deepEqual(t.voies[0], { voie: 'champ', donne: true, vu: false, ms: 6012 })
  const texte = JSON.stringify(t)
  for (const interdit of ['Seance', '6721a9f0', 'Biais', 'adresse', '"nom"']) assert.ok(!texte.includes(interdit), interdit)
  assert.equal(normaliserTrace(null), null)
  assert.equal(normaliserTrace({ fournisseur: 'chatgpt' }), null)
})

const entrees = (champs: Partial<EntreesDiagnostic> = {}): EntreesDiagnostic => ({
  maintenant: Date.UTC(2026, 10, 5, 19, 0),
  version: '1.8.14',
  langue: 'fr',
  theme: 'dark',
  sombre: true,
  mouvementReduit: false,
  reglages: {
    autoCapture: true, captureScreenshots: true, extractMainContent: false, captureGraphiqueTrade: undefined, notationJusquaD: false,
    analysisProvider: 'chatgpt',
    providerThreadUrls: { chatgpt: 'https://chatgpt.com/c/6721a9f0-secret', claude: '' },
    aiConfig: { provider: 'openai', apiKey: 'sk-proj-SECRETSECRETSECRET' },
    journalSync: { syncCoupee: false, apiKey: 'cle-du-journal-SECRET', journalAppUrl: 'https://x' },
    defaultTags: [TITRE], folders: [{ id: 'f1', name: 'Dossier perso' }], dictationDeviceId: 'micro-123',
    mentoratDossiers: ['f1'],
  },
  affichageSecours: true,
  metadonnees: false,
  navigateur: {
    marques: [{ brand: 'Not_A Brand', version: '8.0.0.0' }, { brand: 'Chromium', version: '131.0.6778.86' }, { brand: 'Google Chrome', version: '131.0.6778.86' }],
    brave: false, plateforme: 'Windows', versionPlateforme: '15.0.0', architecture: 'x86', bits: '64', mobile: false, userAgent: 'Mozilla/5.0 ...',
  },
  gpu: { contexte: 'webgl2', vendeur: 'Google Inc. (NVIDIA)', rendu: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  ecran: { dpr: 1.25, zoomOnglet: 1, panneau: { l: 420, h: 900 }, fenetre: { l: 1920, h: 1040 }, ecran: { l: 1920, h: 1080 }, profondeur: 24 },
  compte: { connecte: true, email: 'membre@example.com' },
  erreurs: [erreur(), { ...erreur({ genre: 'toast', message: 'import.illisible' }) }],
  dernierEnvoi: null,
  ...champs,
})

test('collecte sans contenu : ni note, ni titre, ni dossier, ni clé, ni adresse de fil', () => {
  const d = construireDiagnostic(entrees())
  const texte = JSON.stringify(d)
  for (const interdit of ['SECRET', 'sk-proj', TITRE, 'Dossier perso', '6721a9f0', 'micro-123', 'journalAppUrl', 'apiKey', 'Mozilla']) {
    assert.ok(!texte.includes(interdit), `${interdit} est sorti`)
  }
  assert.deepEqual(d.carnet.reglages, {
    captureAuto: true, captures: true, captureGraphiqueTrade: true, extraction: false, metadonnees: false, affichageSecours: true,
    noterD: false, syncCoupee: false, fournisseurIA: 'chatgpt', filsIA: ['chatgpt'],
  })
  assert.deepEqual(d.navigateur.marques.map(m => m.marque), ['Chromium', 'Google Chrome'])
  assert.equal(d.navigateur.userAgent, null)
  assert.equal(d.gpu.renduLogiciel, false)
  assert.equal(d.ecran.zoomEstime, 1)
  assert.equal(d.ecran.echelleSysteme, 1.25)
  assert.equal(d.compte.email, 'membre@example.com')
  assert.equal(d.carnet.theme, 'sombre')
  assert.equal(d.erreurs.length, 2)
  // Non connecté : pas d'email, même si la session en avait laissé un.
  assert.equal(construireDiagnostic(entrees({ compte: { connecte: false, email: 'vieux@example.com' } })).compte.email, null)
  // Sans userAgentData : l'user agent, borné.
  const ancien = construireDiagnostic(entrees({ navigateur: { userAgent: 'U'.repeat(500) } }))
  assert.ok((ancien.navigateur.userAgent ?? '').length <= 300)
  // Rendu logiciel signalé.
  assert.equal(construireDiagnostic(entrees({ gpu: { contexte: 'webgl', vendeur: 'Google Inc. (Google)', rendu: 'ANGLE (Google, SwiftShader Device)' } })).gpu.renduLogiciel, true)
})

test('borne de taille : les erreurs les plus anciennes tombent', () => {
  const lourdes = Array.from({ length: 30 }, (_, i) => erreur({ le: i, message: `erreur ${i} ${'mot '.repeat(45)}`, source: `chunks/${'f'.repeat(140)}${i}.js` }))
  const d = construireDiagnostic(entrees({ erreurs: lourdes }))
  const borne = bornerDiagnostic(d, 6 * 1024)
  assert.ok(new TextEncoder().encode(JSON.stringify(borne)).length <= 6 * 1024)
  assert.ok(borne.erreurs.length < 30)
  assert.equal(borne.erreurs.at(-1)?.le, 29)
  assert.ok(new TextEncoder().encode(JSON.stringify(bornerDiagnostic(d))).length <= OCTETS_MAX)
})

test('cadence locale : 5 envois sur 24 h glissantes', () => {
  const maintenant = 10 * 86_400_000
  assert.deepEqual(cadenceLocale([], maintenant), { autorise: true, restants: 5, envois: [] })
  const quatre = [1, 2, 3, 4].map(h => maintenant - h * 3_600_000)
  assert.equal(cadenceLocale(quatre, maintenant).restants, 1)
  const cinq = [...quatre, maintenant - 60_000]
  assert.equal(cadenceLocale(cinq, maintenant).autorise, false)
  // Un envoi d'hier (plus de 24 h) ne compte plus.
  const hier = [...quatre, maintenant - 86_400_000 - 1]
  assert.equal(cadenceLocale(hier, maintenant).autorise, true)
  assert.equal(cadenceLocale('abime', maintenant).autorise, true)
})
