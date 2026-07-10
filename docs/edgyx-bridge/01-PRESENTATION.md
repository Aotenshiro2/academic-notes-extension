# Présentation des produits

## Le Carnet du Trader (extension Chrome)

Extension Chrome **Manifest V3** (React + Vite + TypeScript), v1.6.0,
distribuée aux élèves d'Ao Knowledge (formation trading Smart Money Concepts).

**Usage type :** l'élève trade avec le side panel ouvert à côté de ses
graphiques. Il capture en 1 clic :

- **Messages** dans un fil chronologique par note : texte, images collées,
  screenshots de page, captures d'écran externes (app de trading / bureau via
  `getDisplayMedia`).
- **Segments de trade** : « je prends un trade » ouvre un segment (une idée de
  trade A→B) ; les messages suivants s'y rattachent ; à la clôture, résultat
  gain/perte/BE + **cooldown** (débrief mental : émotion, erreur, leçon —
  approche Jared Tendler).
- **Warmup de séance** : check-in avant de trader (état physique, émotionnel,
  pensée dominante, objectif du jour, niveau d'émotion 0–100).
- **Jugements A/B/C** (« annotations ») : note qualitative découplée du
  résultat — grade + phrase + cause (technique / connaissance / émotionnel),
  avec échéance de relecture.
- **Tags et concepts** : taxonomie unifiée (ex. « Breaker », « FVG », « DOL »).
- **Dossiers** pour organiser les notes.

**Exports actuels :** PDF et Word (.docx) mis en page (titre, méta, messages,
images, trades) — c'est ce que les élèves uploadent aujourd'hui manuellement
dans Edgyx. Un export Google Drive existe aussi.

## Journal d'étude (app compagnon)

App web Next.js (App Router) + Prisma + Supabase (PostgreSQL + Storage +
Auth), déployée sur Vercel : `https://journal-d-etude-beta.vercel.app`
(domaine cible : journal.aoknowledge.com).

C'est le « second cerveau » de l'élève : les notes de l'extension s'y
synchronisent automatiquement, puis l'élève y travaille la **rétention** :
canvas de réorganisation (type mind-map), cycle de relecture A/B/C, émergence
des concepts, pattern map, analytics d'apprentissage.

## Le pont visé avec Edgyx

- **Extension = capture qualitative** (notes, états mentaux, jugements).
- **Edgyx = data quantitative** (trades réels via connecteurs brokers, 40+
  métriques, coach IA).

Un élève qui utilise les deux devrait pouvoir, depuis l'extension, cliquer
**« Exporter vers Edgyx »** et retrouver sa note (contenu + images + contexte
trade) dans l'onglet Journal & Notes d'Edgyx — rattachée à son compte Edgyx,
idéalement à la bonne journée/séance, sans export manuel PDF/Word.
