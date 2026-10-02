// Demande la permission micro depuis un VRAI onglet : Chrome n'affiche
// jamais le prompt dans le side panel (getUserMedia y échoue tant que
// l'origine de l'extension n'a pas déjà la permission). Une fois accordée
// ici, elle vaut pour toute l'extension, side panel compris.
//
// Langue (01/10/2026) : la page est une page de l'extension, elle lit la même
// langue que le panneau (localStorage, même origine). Le HTML porte le texte
// français par défaut ; on le remplace au chargement, avant la demande.
import { t, getLangue } from '@/lib/i18n'

const statusEl = document.getElementById('status')!

document.documentElement.lang = getLangue()
document.title = t('micro.titrePage')
const titre = document.querySelector('h1')
if (titre) titre.textContent = t('micro.titre')
statusEl.textContent = t('micro.consigne')

/** Une ligne colorée puis une ligne d'explication : les deux viennent du
 *  dictionnaire, sans HTML dedans, et passent par textContent. */
function afficher(classe: 'ok' | 'err', tete: string, suite: string) {
  statusEl.textContent = ''
  const span = document.createElement('span')
  span.className = classe
  span.textContent = tete
  statusEl.append(span, document.createElement('br'), suite)
}

async function requestMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(piste => piste.stop())
    afficher('ok', t('micro.okTete'), t('micro.okSuite'))
    setTimeout(() => window.close(), 2500)
  } catch (err) {
    const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
    if (denied) afficher('err', t('micro.refusTete'), t('micro.refusSuite'))
    else afficher('err', t('micro.introuvableTete'), t('micro.introuvableSuite', { erreur: err instanceof Error ? err.name : t('micro.erreur') }))
  }
}

requestMic()

export {}
