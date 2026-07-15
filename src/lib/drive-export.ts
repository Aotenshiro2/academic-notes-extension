import type { AcademicNote } from '@/types/academic'
import { buildDocxBlob } from './docx-export'

// client_id public (pas un secret). L'échange code→token se fait côté serveur
// (proxy journal) pour ne PAS embarquer de client_secret dans le bundle.
const GOOGLE_DRIVE_CLIENT_ID = '963294596205-jvg0o7mi11ngfvqcq6thncmboemnalmq.apps.googleusercontent.com'
const JOURNAL_API = 'https://journal-d-etude-beta.vercel.app'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// --- PKCE helpers ---

function generateCodeVerifier(): string {
  const array = new Uint8Array(48)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// --- OAuth ---

async function getDriveToken(): Promise<string> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const redirectUrl = chrome.identity.getRedirectURL('drive/callback')

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', GOOGLE_DRIVE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUrl)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', DRIVE_SCOPE)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'select_account consent')

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (url) => {
        if (chrome.runtime.lastError || !url) {
          reject(new Error(chrome.runtime.lastError?.message ?? 'Auth annulée'))
        } else {
          resolve(url)
        }
      }
    )
  })

  const code = new URL(responseUrl).searchParams.get('code')
  if (!code) throw new Error('Aucun code retourné par Google')

  // Échange code→token via le proxy journal : le client_secret vit sur le serveur
  // (Vercel), jamais dans le bundle. PKCE (code_verifier) transmis pour l'échange.
  const tokenRes = await fetch(`${JOURNAL_API}/api/drive-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier, redirectUri: redirectUrl }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => tokenRes.statusText)
    throw new Error(`Erreur échange token : ${tokenRes.status} ${text}`)
  }

  const { access_token } = await tokenRes.json()
  if (!access_token) throw new Error('Pas d\'access_token dans la réponse')
  return access_token
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
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`Google Drive : ${response.status} ${text}`)
  }

  const data = await response.json()
  const fileUrl = `https://drive.google.com/file/d/${data.id}/view`

  chrome.notifications?.create({
    type: 'basic',
    iconUrl: '/icons/icon-48.png',
    title: 'Envoyé vers Google Drive',
    message: filename,
  })

  chrome.tabs.create({ url: fileUrl })
}
