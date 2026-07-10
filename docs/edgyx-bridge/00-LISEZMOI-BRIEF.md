# Brief — Pont « Le Carnet du Trader » ↔ Edgyx

**De :** Brice Delannay (Ao Knowledge) — partenariat avec Geoffrey (Edgyx)
**Pour :** l'assistant IA (Claude) de l'équipe Edgyx
**Date :** 10 juillet 2026

## Contexte en 30 secondes

Brice édite **Le Carnet du Trader**, une extension Chrome de prise de notes de
trading pour ses élèves (capture en 1 clic pendant la séance : screenshots,
texte, tags, concepts, trades, warmup/cooldown mental game). Les notes se
synchronisent vers son app compagnon **Journal d'étude** (Next.js + Supabase).

**Edgyx** est le journal de trading data-driven de Geoffrey : sync des trades
par connecteurs (MT4/MT5, cTrader, TopStepX, Quantower, Apex) ou CSV,
analytics, coach IA Ora. Edgyx a un onglet **Journal & Notes**.

**Aujourd'hui**, le pont entre les deux est manuel : l'élève exporte sa note en
PDF ou Word depuis l'extension, puis l'uploade à la main dans les notes Edgyx.

**Objectif du partenariat :** un bouton **« Exporter vers Edgyx »** dans
l'extension — l'élève connecté à Edgyx envoie sa note en un clic. Le contenu
qualitatif (notes, jugements, états mentaux) rejoint la data quantitative
(trades) d'Edgyx.

## Ce qu'on vous demande

1. **Analysez ce dossier** — il décrit notre architecture, notre modèle de
   données et le payload exact que nous savons déjà produire (nous avons déjà
   un flux de sync REST identique vers notre propre journal).
2. **Revenez vers nous avec vos besoins et contraintes**, idéalement :
   - Existe-t-il (ou pouvez-vous exposer) un **endpoint d'import de notes**
     côté Edgyx ? Quel format attendez-vous (HTML, Markdown, JSON structuré) ?
   - Comment gérez-vous les **images** (upload direct, URLs, base64, limites) ?
   - Quelle **authentification** pour un utilisateur final : clé API par
     compte, OAuth2, token d'app partenaire ?
   - Comment **rattacher l'identité** de l'élève (email commun ? account id ?) ?
   - Vers quoi mapper nos objets : nos `trades`/`annotations` (jugements A/B/C,
     warmup/cooldown) ont-ils un équivalent Edgyx, ou tout va dans « Notes » ?
   - Environnement de **test/sandbox** disponible ?
3. **Dites-nous qui construit quoi** — notre proposition et les options sont
   dans `04-OPTIONS-INTEGRATION.md`, avec notre recommandation. On itérera en
   plusieurs allers-retours pour trouver le chemin le plus sûr.

## Contenu du dossier

| Fichier | Contenu |
|---|---|
| `01-PRESENTATION.md` | Les deux produits, les utilisateurs, le pont actuel |
| `02-ARCHITECTURE.md` | Architecture technique et flux de sync existants |
| `03-MODELE-DE-DONNEES.md` | Modèle de données + payload d'exemple |
| `04-OPTIONS-INTEGRATION.md` | Options d'intégration, sécurité, questions ouvertes |
| `types-academic.ts` | Types TypeScript réels de l'extension (source de vérité) |
| `exemple-payload-note.json` | Exemple réaliste du payload qu'on sait émettre |

Aucun secret, clé ou donnée d'élève ne figure dans ce dossier — uniquement de
l'architecture et des formats. Merci de répondre en français.
