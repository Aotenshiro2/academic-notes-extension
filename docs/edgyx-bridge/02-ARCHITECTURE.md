# Architecture technique et flux existants

## Vue d'ensemble

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Extension Chrome MV3       │  REST  │  Journal d'étude             │
│  (React + Vite + TS)        │──────▶ │  Next.js API routes (Vercel) │
│                             │ Bearer │        │                     │
│  Side panel (UI principale) │        │        ▼ Prisma              │
│  Service worker (background)│        │  Supabase PostgreSQL         │
│  Content script (capture)   │        │  Supabase Storage (images)   │
│                             │        │  Supabase Auth (Google)      │
│  Stockage local :           │        └──────────────────────────────┘
│  IndexedDB (source vérité)  │
│  + chrome.storage.local     │                 ┌──────────┐
│                             │   PDF / DOCX    │  Edgyx   │
│  Exports : PDF, DOCX, Drive │──── manuel ────▶│  (notes) │
└─────────────────────────────┘                 └──────────┘
```

## Points structurants

1. **Local-first.** La source de vérité des notes est l'**IndexedDB** de
   l'extension (avec backup `chrome.storage.local`). La sync vers le journal
   est non-bloquante : une note existe et fonctionne même hors connexion.

2. **Authentification.** L'élève se connecte en **Google OAuth via Supabase
   Auth** (PKCE, `chrome.identity.launchWebAuthFlow`). L'extension obtient un
   **access token Supabase (JWT)** utilisé en `Authorization: Bearer` sur
   toutes les routes API du journal. Le serveur vérifie le JWT et en déduit
   l'utilisateur — l'extension ne stocke aucun secret serveur.

3. **Sync des notes (flux existant, modèle pour le pont Edgyx).**
   `POST /api/notes` avec un payload JSON complet (voir
   `03-MODELE-DE-DONNEES.md` et `exemple-payload-note.json`).
   - **Upsert idempotent** : `extensionNoteId` (UUID généré côté extension)
     est la clé de rapprochement ; re-synchroniser la même note la met à jour.
   - Les **annotations** (jugements A/B/C) partent séparément sur
     `POST /api/annotations`, upsert idempotent par id client.
   - En-tête `X-Extension-Source: trading-notes-extension` pour tracer la
     provenance.

4. **Images.** Jamais envoyées en base64 au serveur de notes : l'extension
   compresse (OffscreenCanvas, JPEG ~1200px max), calcule un hash (dédup),
   puis uploade via un **proxy** (`POST /api/upload-image`) qui écrit dans
   Supabase Storage et renvoie une **URL publique**. Le payload de note ne
   contient donc que des URLs. Garde-fou : payload > 3 Mo → messages retirés.

5. **Restauration.** `GET /api/notes` permet de re-télécharger toutes les
   notes (nouvelle installation) ; `GET /api/folders`, `GET /api/tags` pour
   l'arborescence et la taxonomie.

## Ce que ça veut dire pour le pont Edgyx

L'extension sait déjà : s'authentifier auprès d'un backend, transformer une
note en JSON propre (images en URLs publiques), pousser en upsert idempotent
avec gestion d'erreurs et indicateur de statut de sync dans l'UI.

**Ajouter une cible « Edgyx » revient à rejouer ce flux vers votre endpoint**,
avec votre mécanisme d'auth — c'est le cœur de la discussion (voir
`04-OPTIONS-INTEGRATION.md`).
