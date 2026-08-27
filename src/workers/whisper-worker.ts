/// <reference lib="webworker" />
// Dictée vocale 100 % locale : Whisper (small, multilingue) via
// @huggingface/transformers, dans un Web Worker pour ne jamais bloquer l'UI.
//
// Conformité Chrome Web Store MV3 : AUCUN code distant. Le runtime
// onnxruntime (wasm + mjs) est embarqué dans le bundle (dist/ort/, copié au
// build par scripts/copy-ort-wasm.mjs). Les POIDS du modèle, eux, sont de la
// donnée : téléchargés une fois depuis huggingface.co puis mis en cache
// navigateur (Cache API) — plus aucun réseau ensuite.
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

// Runtime onnx local (jamais le CDN)
env.allowLocalModels = false
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = new URL('/ort/', self.location.origin).href
}

// Whisper small : le meilleur compromis qualité française / taille pour un
// navigateur (~170 Mo quantisé q8, téléchargé une seule fois). Les modèles
// plus récents en tête des benchmarks 2026 (Canary, Parakeet…) sont
// anglais-centrés et taillés pour du GPU serveur, pas pour une extension.
const MODEL_ID = 'Xenova/whisper-small'

type InMessage = { type: 'transcribe'; audio: Float32Array }
type OutMessage =
  | { type: 'progress'; status: string; file?: string; progress?: number }
  | { type: 'result'; text: string }
  | { type: 'error'; message: string }

const post = (m: OutMessage) => self.postMessage(m)

let asrPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null

function loadPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!asrPromise) {
    // WebGPU quand la machine l'a (transcription en quelques secondes),
    // sinon wasm CPU (plus lent mais fonctionnel partout)
    const device = 'gpu' in navigator ? 'webgpu' : 'wasm'
    asrPromise = pipeline('automatic-speech-recognition', MODEL_ID, {
      dtype: 'q8',
      device,
      progress_callback: (p: { status: string; file?: string; progress?: number }) => {
        post({ type: 'progress', status: p.status, file: p.file, progress: p.progress })
      },
    }).catch(err => {
      asrPromise = null // permettre un nouvel essai (réseau coupé pendant le téléchargement…)
      throw err
    }) as Promise<AutomaticSpeechRecognitionPipeline>
  }
  return asrPromise
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data
  if (msg.type !== 'transcribe') return
  try {
    const asr = await loadPipeline()
    post({ type: 'progress', status: 'transcribing' })
    const output = await asr(msg.audio, {
      language: 'french',
      task: 'transcribe',
      // Dictées longues : découpage standard Whisper 30 s avec recouvrement
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    const text = (Array.isArray(output) ? output.map(o => o.text).join(' ') : output.text ?? '').trim()
    post({ type: 'result', text })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
