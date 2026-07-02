import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://ujdqrtjanmmwidnfhkxg.supabase.co'
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHFydGphbm1td2lkbmZoa3hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM1MTY0MTUsImV4cCI6MjA0OTA5MjQxNX0.suzqKZkSjMon7cX38Cc_r5RUmGuFJe1OzURszVW11B4'

// Chrome extension : pas d'accès localStorage → stockage manuel dans chrome.storage.local
const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const result = await chrome.storage.local.get([`sb_${key}`])
      return result[`sb_${key}`] ?? null
    } catch {
      return null
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await chrome.storage.local.set({ [`sb_${key}`]: value })
    } catch {
      console.error('[Supabase] setItem error')
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await chrome.storage.local.remove([`sb_${key}`])
    } catch {
      console.error('[Supabase] removeItem error')
    }
  },
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

export type { Session, User }
