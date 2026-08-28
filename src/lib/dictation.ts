// Dictée vocale : enregistre le micro, décode en PCM 16 kHz mono (le format
// d'entrée de Whisper) et fait transcrire par le worker (100 % local).
// Singleton : un seul worker, un seul modèle en mémoire, réutilisé.

export type DictationProgress =
  | { phase: 'downloading'; progress: number }
  | { phase: 'transcribing' }

const WHISPER_SAMPLE_RATE = 16_000
/** Garde-fou : au-delà, la mémoire et le temps de transcription explosent */
export const MAX_RECORDING_MS = 5 * 60_000

let worker: Worker | null = null
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/whisper-worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

/** Précharge le modèle (appelable au premier survol du micro, optionnel) */
export function preloadWhisper(): void {
  // Un transcribe vide déclencherait une erreur ; le simple fait de créer le
  // worker charge déjà le module. Le vrai téléchargement part au 1er usage.
  getWorker()
}

// ── Permission micro ─────────────────────────────────────────────────────────
// Chrome n'affiche JAMAIS le prompt getUserMedia dans un side panel : tant que
// l'origine de l'extension n'a pas la permission, l'appel échoue sans rien
// montrer. La demande doit partir d'un vrai onglet → src/permission/.

export async function micPermissionState(): Promise<PermissionState | 'unknown'> {
  try {
    const st = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return st.state
  } catch {
    return 'unknown'
  }
}

/** Ouvre l'onglet d'autorisation (le seul endroit où Chrome montre le prompt) */
export function openMicPermissionPage(): void {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/permission/index.html') })
}

/** Micros disponibles (labels remplis seulement si la permission est accordée) */
export async function listMicrophones(): Promise<{ deviceId: string; label: string }[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Micro ${i + 1}` }))
}

export interface Recorder {
  stop: () => Promise<Blob>
  cancel: () => void
}

export async function startRecording(): Promise<Recorder> {
  // Micro choisi dans les Paramètres (sinon le micro système par défaut).
  // `ideal` et pas `exact` : un micro débranché ne doit pas casser la dictée.
  let deviceId: string | undefined
  try {
    const { default: storage } = await import('./storage')
    deviceId = (await storage.getSettings()).dictationDeviceId
  } catch { /* réglage indisponible : micro par défaut */ }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    },
  })
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
  const recorder = new MediaRecorder(stream, { mimeType })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
  recorder.start()

  const timeout = setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, MAX_RECORDING_MS)
  const cleanup = () => {
    clearTimeout(timeout)
    stream.getTracks().forEach(t => t.stop())
  }

  return {
    stop: () =>
      new Promise<Blob>(resolve => {
        recorder.onstop = () => {
          cleanup()
          resolve(new Blob(chunks, { type: mimeType }))
        }
        if (recorder.state === 'recording') recorder.stop()
        else recorder.onstop?.(new Event('stop'))
      }),
    cancel: () => {
      recorder.onstop = null
      if (recorder.state === 'recording') recorder.stop()
      cleanup()
    },
  }
}

/** Décode n'importe quel blob audio en Float32Array mono 16 kHz */
async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  // Décodage au sample rate natif…
  const probe = new AudioContext()
  const decoded = await probe.decodeAudioData(arrayBuffer)
  await probe.close()
  // …puis ré-échantillonnage 16 kHz mono via OfflineAudioContext
  const duration = decoded.duration
  const offline = new OfflineAudioContext(1, Math.ceil(duration * WHISPER_SAMPLE_RATE), WHISPER_SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

/**
 * Transcrit un enregistrement. onProgress reçoit le téléchargement du modèle
 * (premier usage uniquement, ~170 Mo mis en cache) puis la transcription.
 */
export async function transcribe(blob: Blob, onProgress?: (p: DictationProgress) => void): Promise<string> {
  const audio = await decodeTo16kMono(blob)
  if (audio.length < WHISPER_SAMPLE_RATE / 4) return '' // < 250 ms : rien à transcrire

  const w = getWorker()
  return new Promise<string>((resolve, reject) => {
    // Agrégat de progression multi-fichiers (encoder + decoder + tokenizer)
    const fileProgress = new Map<string, number>()
    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'progress') {
        if (msg.status === 'progress' && msg.file && typeof msg.progress === 'number') {
          fileProgress.set(msg.file, msg.progress)
          const avg = [...fileProgress.values()].reduce((s, v) => s + v, 0) / fileProgress.size
          onProgress?.({ phase: 'downloading', progress: Math.round(avg) })
        } else if (msg.status === 'transcribing') {
          onProgress?.({ phase: 'transcribing' })
        }
        return
      }
      w.removeEventListener('message', handler)
      if (msg.type === 'result') resolve(msg.text as string)
      else reject(new Error(msg.message ?? 'Transcription impossible'))
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'transcribe', audio }, [audio.buffer])
  })
}
