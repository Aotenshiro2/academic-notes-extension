import type { AcademicNote } from '@/types/academic'
import { buildDocxBlob } from './docx-export'

// Authentification Google via chrome.identity.getAuthToken.
// Le client OAuth (type "Chrome Extension") et les scopes sont declares dans
// public/manifest.json (bloc "oauth2"). AUCUN client_id ni client_secret ne vit
// dans ce code : rien de sensible n'est embarque dans le bundle (contrairement a
// l'ancien flux PKCE qui inline-ait VITE_GOOGLE_DRIVE_CLIENT_SECRET au build).
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

async function getDriveToken(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // interactive: true -> ouvre le consentement Google si besoin, sinon renvoie
    // un token cache. Les scopes viennent du manifest ("oauth2".scopes).
    chrome.identity.getAuthToken({ interactive: true }, (result) => {
      const token = typeof result === 'string' ? result : (result as { token?: string } | undefined)?.token
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Autorisation Google Drive annulee'))
      } else {
        resolve(token)
      }
    })
  })
}

// --- Export ---

export async function exportNoteToDrive(note: AcademicNote): Promise<void> {
  const { blob, filename } = await buildDocxBlob(note)
  const token = await getDriveToken()

  const metadata = JSON.stringify({ name: filename, mimeType: DOCX_MIME })
  const body = new FormData()
  body.append('metadata', new Blob([metadata], { type: 'application/json' }))
  body.append('file', blob, filename)

  const response = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  })

  if (!response.ok) {
    // Si le token en cache est invalide (revoque/expire), le purger pour forcer
    // une nouvelle demande au prochain export.
    if (response.status === 401) {
      chrome.identity.removeCachedAuthToken({ token }, () => {})
    }
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`Google Drive : ${response.status} ${text}`)
  }

  const data = await response.json()
  const fileUrl = `https://drive.google.com/file/d/${data.id}/view`

  chrome.notifications?.create({
    type: 'basic',
    iconUrl: '/icons/icon-48.png',
    title: 'Envoye vers Google Drive',
    message: filename,
  })

  chrome.tabs.create({ url: fileUrl })
}
