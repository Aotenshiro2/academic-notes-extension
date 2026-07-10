# TODO — Le Carnet du Trader (extension)

## Priorités (ordre validé par Brice le 10 juillet 2026)

0. **Pont Edgyx** — dossier d'analyse envoyé à Geoffrey (voir
   `docs/edgyx-bridge/`), en attente de son retour de besoins. L'implémentation
   suivra les allers-retours.
1. **🐛 Bug content-script (bloquant, repéré par Codex — HANDOFF 2026-07-10 14:43)**
2. **Warmup à la demande, multi-séances**
3. *(côté journal : homogénéisation du shell UI — voir TODO du journal)*
4. **Fonctionnalité DOL — Draw on Liquidity**
5. *(côté journal : compteur de journalisation des concepts)*

> Ne pas générer le zip v1.6.0 tant que les points 1 et 2 ne sont pas traités
> (les derniers packages datent de la v1.5.0).

### 1. 🐛 Bug : content script buildé en ESM (erreur Brave/Chrome)

Diagnostic Codex (2026-07-10) : `dist/manifest.json` déclare
`content/content-script.js` dans `content_scripts`, mais le fichier généré
commence par `import{_ as v}from"../chunks/preload-helper-….js"`. Chrome/Brave
injecte les content scripts en **scripts classiques**, pas en modules ES →
`Cannot use import statement outside a module`.

Racine : `src/content/content-script.ts` fait `await import('../lib/storage.js')`
et la config Vite/Rollup garde du code-splitting (`chunkFileNames: 'chunks/…'`).

Correctifs possibles :
- [ ] Option propre : ne plus importer `storage` dans le content script —
      extraire le DOM côté content script et envoyer au service worker
      (qui gère le stockage).
- [ ] Alternative : build séparé du content script en IIFE single-file.
- [ ] Vérifier après rebuild : plus de `import` top-level ni de `../chunks/`
      dans `dist/content/content-script.js`, recharger dans Brave.

### 2. Warmup à la demande, multi-séances

**Constat actuel :** le warmup s'affiche en haut de la note, une seule fois.

**Voulu :**
- [ ] Le warmup s'affiche à l'endroit et au moment où on décide de le lancer
      (inline dans le fil de la note, comme un segment de trade), pas figé en
      haut de note.
- [ ] Plusieurs warmups possibles dans une même note : une journée peut
      contenir plusieurs séances de trading journalées dans la même note —
      un warmup par séance, lancé à la demande.

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
