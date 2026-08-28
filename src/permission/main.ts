// Demande la permission micro depuis un VRAI onglet : Chrome n'affiche
// jamais le prompt dans le side panel (getUserMedia y échoue tant que
// l'origine de l'extension n'a pas déjà la permission). Une fois accordée
// ici, elle vaut pour toute l'extension, side panel compris.
const statusEl = document.getElementById('status')!

async function requestMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(t => t.stop())
    statusEl.innerHTML = '<span class="ok">C’est bon, le micro est autorisé.</span><br />Retourne dans le panneau et relance la dictée. Cet onglet se ferme tout seul.'
    setTimeout(() => window.close(), 2500)
  } catch (err) {
    const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
    statusEl.innerHTML = denied
      ? '<span class="err">L’accès a été refusé.</span><br />Clique sur l’icône 🎤 ou ⓘ dans la barre d’adresse de CET onglet et passe le micro sur « Autoriser », puis recharge la page.'
      : `<span class="err">Micro introuvable.</span><br />Vérifie qu’un micro est branché et non utilisé en exclusivité par une autre application. (${err instanceof Error ? err.name : 'erreur'})`
  }
}

requestMic()

export {}
