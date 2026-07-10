# TODO — Le Carnet du Trader (extension)

## Mise à jour du 10 juillet 2026 — à faire avant le packaging v1.6.0

> Ne pas générer le zip v1.6.0 tant que ces deux éléments ne sont pas traités
> (les derniers packages datent de la v1.5.0).

### 1. Fonctionnalité DOL — Draw on Liquidity

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

### 2. Warmup à la demande, multi-séances

**Constat actuel :** le warmup s'affiche en haut de la note, une seule fois.

**Voulu :**
- [ ] Le warmup s'affiche à l'endroit et au moment où on décide de le lancer
      (inline dans le fil de la note, comme un segment de trade), pas figé en
      haut de note.
- [ ] Plusieurs warmups possibles dans une même note : une journée peut
      contenir plusieurs séances de trading journalées dans la même note —
      un warmup par séance, lancé à la demande.

---
**Dernière mise à jour :** 10 juillet 2026
