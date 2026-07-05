import { getBearerToken } from './auth'

// Même base que la sync (cf. sync.ts). Le rituel remonte dans le journal (/session).
const JOURNAL_API = 'https://journal-d-etude-beta.vercel.app'

export type Ritual = {
  id: string
  physical: string | null
  emotional: string | null
  dominantThought: string | null
  objective: string | null
  emotionLevel: number | null
  errors: string | null
  lesson: string | null
  recenter: string | null
  closed: boolean
  createdAt: string
}

export type RitualPatch = Partial<{
  physical: string; emotional: string; dominantThought: string; objective: string
  emotionLevel: number; errors: string; lesson: string; recenter: string; closed: boolean
}>

async function authedFetch(path: string, init: RequestInit): Promise<unknown | null> {
  const token = await getBearerToken()
  if (!token) return null
  try {
    const res = await fetch(`${JOURNAL_API}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getRituals(): Promise<Ritual[]> {
  const data = await authedFetch('/api/rituals', { method: 'GET' })
  return Array.isArray(data) ? (data as Ritual[]) : []
}

export async function createRitual(seed: RitualPatch = {}): Promise<Ritual | null> {
  return (await authedFetch('/api/rituals', { method: 'POST', body: JSON.stringify(seed) })) as Ritual | null
}

export async function updateRitual(id: string, patch: RitualPatch): Promise<Ritual | null> {
  return (await authedFetch('/api/rituals', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) })) as Ritual | null
}
