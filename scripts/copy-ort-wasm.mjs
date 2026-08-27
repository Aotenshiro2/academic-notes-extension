// Copie le runtime onnxruntime-web dans dist/ort/ après le build Vite.
// Obligatoire pour le Chrome Web Store (MV3) : le code exécuté (wasm + son
// chargeur mjs) doit être DANS le bundle, jamais chargé depuis un CDN.
// Les poids du modèle Whisper, eux, sont de la donnée : téléchargés une fois
// depuis huggingface.co et mis en cache navigateur.
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'node_modules/onnxruntime-web/dist')
const dest = resolve(root, 'dist/ort')

// jsep = WebGPU (+ CPU) ; plain = CPU seul (fallback machines sans WebGPU)
const FILES = [
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
]

mkdirSync(dest, { recursive: true })
let total = 0
for (const f of FILES) {
  const from = resolve(src, f)
  if (!existsSync(from)) {
    console.error(`✗ ${f} introuvable dans onnxruntime-web/dist — version du paquet changée ?`)
    process.exit(1)
  }
  copyFileSync(from, resolve(dest, f))
  total += statSync(from).size
}
console.log(`✓ Runtime onnx copié dans dist/ort/ (${FILES.length} fichiers, ${(total / 1024 / 1024).toFixed(1)} Mo)`)
