# Options d'intégration — proposition et questions

## Ce qu'on veut obtenir (rappel)

Dans l'extension, un bouton **« Exporter vers Edgyx »** : si l'élève a
connecté son compte Edgyx, la note part en un clic (contenu + images + trades
+ jugements) vers l'onglet Journal & Notes de son compte Edgyx.

## Option A — Edgyx expose un endpoint d'import (notre recommandation)

Edgyx expose une petite API REST d'import, l'extension pousse directement :

```
POST https://api.edgyx.ai/…/notes   (nom à définir)
Authorization: <token de l'élève>
Body: JSON (format défini ensemble, à partir de notre payload existant)
```

- **Qui construit quoi :** Edgyx = endpoint + auth + mapping vers ses notes ;
  nous = bouton UI, connexion du compte, adaptateur de payload, statut de sync.
- **Pourquoi on la recommande :** c'est exactement le flux que l'extension
  fait déjà vers notre journal (upsert idempotent par UUID client, images en
  URLs). Pas de nouveau backend, la donnée va du poste de l'élève chez Edgyx
  sans intermédiaire — le plus simple et le plus « safe » en RGPD (pas de
  copie chez un tiers).
- **Auth élève, deux variantes :**
  1. **Clé API personnelle** générée dans les réglages Edgyx, collée une fois
     dans l'extension (rapide à livrer, bon pour une V1) ;
  2. **OAuth2 Authorization Code + PKCE** (l'extension sait déjà faire —
     c'est notre flux Supabase actuel) — plus propre à terme.

## Option B — Pont serveur-à-serveur via notre journal

L'élève connecte Edgyx dans notre app journal ; notre backend (Vercel) pousse
vers Edgyx (à l'envoi ou en batch).

- ✅ Secrets côté serveur, retries, throttling centralisés.
- ❌ Nous devient un intermédiaire de données (RGPD), dépendance à notre
  backend, et l'élève doit avoir activé la sync journal. À garder si Edgyx
  préfère un seul client API partenaire plutôt que N extensions.

## Option C — Fichier structuré (fallback minimal)

Nous produisons un export JSON/CSV au format d'import déjà supporté par Edgyx
(comme vos imports CSV brokers). Pas de vrai « un clic », mais mieux que le
PDF actuel. Utile en attendant A ou B — dites-nous quels formats votre import
manuel accepte déjà.

## Et un MCP ?

Un MCP (Model Context Protocol) sert à donner des **outils à un agent IA**,
pas à faire un flux utilisateur en un clic — ce n'est pas la bonne brique pour
le pont élève. En revanche, une fois le pont en place, un MCP Edgyx pourrait
être une suite intéressante (ex. Ora, ou le Claude d'un élève, qui lit ses
notes/trades). À discuter plus tard, hors périmètre V1.

## Sécurité / RGPD (nos exigences de départ, à challenger)

- Token **par élève**, révocable, scope minimal (écriture de notes uniquement).
- Consentement explicite dans l'extension (connexion Edgyx = opt-in).
- Aucun partage de nos tokens Supabase avec Edgyx, ni des vôtres avec nous.
- Données élèves : hébergement UE si possible ; vous annoncez AES-256 + RGPD,
  parfait — préciser le DPA si l'option B (nous intermédiaire) était retenue.
- Idempotence obligatoire (re-clic = mise à jour, pas de doublon).

## Questions ouvertes pour l'équipe Edgyx

1. Endpoint d'import de notes : existant ? à créer ? nom/spec pressentis ?
2. Format de contenu accepté : HTML ? Markdown ? blocs structurés ?
3. Images : upload chez vous (multipart ? presigned URL ?) ou vous allez
   chercher nos URLs publiques Supabase ?
4. Auth : clé API perso dispo aujourd'hui ? OAuth2 prévu ? token d'app
   partenaire ?
5. Identité : rattachement par email ? account id ? que se passe-t-il si
   l'email extension ≠ email Edgyx ?
6. Mapping : nos `trades` (avec cooldown) et `annotations` A/B/C ont-ils une
   place dans votre modèle (rattachement aux trades importés du broker ?) ou
   tout atterrit en « note » ?
7. Limites : taille max payload, rate limits, nombre d'images ?
8. Sandbox/compte de test pour développer sans polluer un vrai compte ?
9. Versionnement : comment gérez-vous l'évolution du format (header de
   version ? endpoint versionné ?) ?

**Format de retour idéal :** un doc (même court) qui répond à ces 9 points +
votre option préférée (A/B/C ou autre). On itère ensuite sur la spec exacte du
payload, puis chacun implémente sa moitié.
