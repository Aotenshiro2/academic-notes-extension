// Thème (1.8.15) : le plein écran reprend le réglage du panneau.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CLE_THEME, estSombre, themeDepuis } from '../src/lib/theme.ts'

test('valeur stockée ramenée à un thème connu, « system » par défaut comme le panneau', () => {
  assert.equal(themeDepuis('dark'), 'dark')
  assert.equal(themeDepuis('light'), 'light')
  assert.equal(themeDepuis('system'), 'system')
  assert.equal(themeDepuis(null), 'system')
  assert.equal(themeDepuis('nimporte'), 'system')
})

test('sombre : réglé sombre, ou système quand l\'appareil est sombre', () => {
  assert.equal(estSombre('dark', false), true)
  assert.equal(estSombre('light', true), false)
  assert.equal(estSombre('system', true), true)
  assert.equal(estSombre('system', false), false)
})

test('le panneau et le plein écran lisent le même réglage', () => {
  assert.equal(CLE_THEME, 'theme')
  const bouton = readFileSync(new URL('../src/components/ThemeToggle.tsx', import.meta.url), 'utf8')
  assert.match(bouton, /from '@\/lib\/theme'/)
  assert.match(bouton, /CLE_THEME/)
  const pleinEcran = readFileSync(new URL('../src/fullscreen/index.tsx', import.meta.url), 'utf8')
  assert.match(pleinEcran, /suivreTheme\(\)/)
})
