# TODO — Le Carnet du Trader (extension)

## Priorités (ordre validé par Brice le 10 juillet 2026)

0. **Pont Edgyx** — dossier d'analyse envoyé à Geoffrey (voir
   `docs/edgyx-bridge/`), en attente de son retour de besoins. L'implémentation
   suivra les allers-retours.
1. ~~🐛 Bug content-script~~ ✅ **corrigé le 10/07/2026** (voir ci-dessous)
2. ~~Warmup à la demande, multi-séances~~ ✅ **fait le 10/07/2026** (voir ci-dessous)
3. *(côté journal : homogénéisation du shell UI — voir TODO du journal)*
4. **Fonctionnalité DOL — Draw on Liquidity** ← prochaine tâche extension
5. *(côté journal : compteur de journalisation des concepts)*

> Le zip v1.6.0 peut maintenant être généré (points 1 et 2 traités) —
> à faire après validation manuelle dans Brave/Chrome.

### ✅ 1. Bug content script ESM — corrigé le 10/07/2026

Diagnostic Codex confirmé : le content script buildé commençait par un import
ESM alors que Chrome/Brave l'injecte en script classique.

Correctif appliqué (option propre de Codex) :
- Le content script n'importe plus `storage` (l'`await import(...)` est
  supprimé) — il ne fait plus que de l'extraction DOM et du messaging. En
  bonus, ça corrige un second bug latent : Dexie dans un content script
  ouvrait l'IndexedDB de l'ORIGINE DE LA PAGE (notes éparpillées par site),
  pas celle de l'extension.
- Les 3 flux de capture du service worker (page, sélection, screenshot) qui
  déléguaient la sauvegarde au content script (`tabs.sendMessage SAVE_NOTE`)
  sauvegardent maintenant directement via `storage.saveNote()` dans le SW
  (même origine que le sidepanel → même IndexedDB).
- Le SW gère aussi le message `SAVE_NOTE` (sélection de zone du content script).
- `manifest.json` : `"background.type": "module"` (le SW peut charger ses
  chunks ES — supporté Chrome/Brave MV3).
- Vérifié après build : `dist/content/content-script.js` sans aucun `import`
  ni référence `chunks/`.
- [ ] Reste : recharger l'extension dans Brave et vérifier que l'erreur de
      `brave://extensions` a disparu + tester une capture de page (menu
      contextuel) et une sélection de zone (Ctrl+Shift+glisser).

### ✅ 2. Warmup à la demande, multi-séances — fait le 10/07/2026

- Nouveau modèle : `note.warmups[]` (chaque entrée a `id` + `startedAt`) ;
  `note.warmup` legacy toujours lu/éditable (affiché en haut si rempli),
  plus alimenté.
- Le bouton « Lancer mon warmup » (haut de note) crée une entrée ancrée à
  l'instant du clic : la carte apparaît DANS le fil, à sa position
  chronologique (comme un segment de trade), dépliée, avec l'heure de
  lancement dans l'en-tête.
- Plusieurs lancements = plusieurs cartes = plusieurs séances dans la même
  note.
- ✅ Sync journal (10/07/2026) : les warmups remontent via `/api/notes`
      (colonne `Note.warmups` JSONB créée et migration appliquée en base) ;
      le pull les restaure. Les cooldowns remontaient déjà (dans `trades`).
- ✅ Exports (10/07/2026) : PDF/DOCX/Drive reconstruisent le fil complet
      (module `export-flow.ts`) — marqueurs Trade 1/2/3 avec heure + résultat,
      jugement A/B/C, cooldown, warmups à leur position chronologique.
- ✅ Version 1.6.1 (package.json + manifest).
- [ ] Reste : valider l'UX en réel (Brave) puis générer le zip v1.6.1.

### 4. Fonctionnalité DOL — Draw on Liquidity

**Problème à résoudre :** pendant l'analyse HTF (avant la séance), on identifie la
direction et le niveau qui attire le prix. Une fois en séance, absorbé par les
petites unités de temps, on perd cette vision HTF — ou du moins la direction
qu'on s'était fixée.

**Rappel du concept (ICT / Smart Money) :** le DOL est le niveau ou la zone de
liquidité vers lequel le prix est « aspiré » — anciens highs/lows, equal
highs/lows, FVG. Buy-side liquidity au-dessus du prix, sell-side liquidity en
dessous. Définir le DOL avant le trade donne une cible logique et un biais
directionnel à ne pas perdre.

**Comportement voulu dans la note :**
- [ ] Définir un ou plusieurs niveaux DOL au moment de l'analyse HTF :
      prix + biais/direction + instrument + commentaire court.
- [ ] Le DOL reste visible en permanence pendant la séance (épinglé dans le
      header du sidepanel / en haut de la note) pour ne jamais perdre la
      direction HTF en étant plongé dans les LTF.
- [ ] Statut d'un niveau : actif / atteint / invalidé.
- [ ] (à discuter) Sync vers le journal, comme les tags et concepts.

---
**Dernière mise à jour :** 10 juillet 2026
