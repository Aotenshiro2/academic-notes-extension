/**
 * Capture une frame depuis une source externe (app desktop, fenêtre, écran entier)
 * via l'API getDisplayMedia. L'utilisateur choisit ce qu'il partage dans le sélecteur Chrome.
 * Doit être appelée depuis un contexte de page visible avec un geste utilisateur.
 */
export async function captureExternalScreen(): Promise<string | null> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })

  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true

  await new Promise<void>(resolve => { video.onloadedmetadata = () => resolve() })
  await video.play()

  // Attendre une frame rendue
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)

  stream.getTracks().forEach(t => t.stop())

  return canvas.toDataURL('image/png')
}
