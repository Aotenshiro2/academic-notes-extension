# Modèle de données

Les types TypeScript réels de l'extension sont dans `types-academic.ts`
(copie exacte du source). Un payload d'exemple est dans
`exemple-payload-note.json`. Résumé :

## AcademicNote — l'objet central

| Champ | Type | Rôle |
|---|---|---|
| `id` | UUID | **Clé d'idempotence** (`extensionNoteId` côté serveur) |
| `title` | string | Titre de la note |
| `content` | HTML | Contenu riche (legacy + fallback) |
| `messages[]` | NoteMessage | Fil chronologique : `text` \| `image` \| `capture` \| `screenshot` |
| `tags[]` / `concepts[]` | string[] | Taxonomie (ex. « Breaker », « FVG ») |
| `trades[]` | TradeSegment | Segments de trade de la séance |
| `annotations[]` | Annotation | Jugements A/B/C |
| `warmup` | NoteWarmup | Check-in d'avant-séance |
| `url`, `favicon`, `timestamp`, `folderId` | — | Contexte et rangement |

## Les objets « trading » (la vraie valeur pour Edgyx)

**TradeSegment** — une idée de trade dans la séance :
```ts
{ id, startedAt, closedAt?, outcome?: 'gain'|'perte'|'be',
  cooldown?: { emotion?, error?, lesson?, doneAt? } }
```
Les messages de la note portent un `tradeRef` optionnel → on sait quels
textes/images appartiennent à quel trade.

**Annotation** — jugement de qualité découplé du résultat :
```ts
{ id, grade: 'A'|'B'|'C', phrase,
  causeCategory?: 'technique'|'connaissance'|'emotionnel',
  messageRef?, tradeRef?, reviewDueAt?, reviewedAt? }
```

**NoteWarmup** — état mental au démarrage de séance :
```ts
{ physical?, emotional?, dominantThought?, objective?,
  emotionLevel?: number /* 0–100 */, doneAt? }
```

À venir côté extension : niveaux **DOL** (Draw on Liquidity) — niveau de prix
+ biais directionnel défini pendant l'analyse HTF, statut actif/atteint/
invalidé. À anticiper dans le mapping.

## Payload de sync émis aujourd'hui (`POST /api/notes`)

```jsonc
{
  "title": "...",
  "content": "<p>HTML…</p>",           // images = URLs publiques (jamais base64)
  "source": "extension",
  "sourceUrl": "https://…" | null,
  "favicon": "https://…" | null,
  "messages": [ { "id", "type", "content", "timestamp", "tags": [], "tradeRef"? } ],
  "tags": ["…"], "concepts": ["…"],
  "trades": [ /* TradeSegment[] */ ],
  "folderId": "uuid" | null, "folderName": "…" | null,
  "createdAt": "ISO-8601", "lastSyncAt": "ISO-8601",
  "extensionVersion": "1.6.0",
  "extensionNoteId": "uuid"            // clé d'upsert
}
```

## Côté journal (pour information)

PostgreSQL (Supabase) via Prisma — modèles : `Note`, `Message`, `Canvas`,
`CanvasNode`, `CanvasEdge`, `Tag`, `MessageTag`, `NoteTag`, `Folder`,
`Annotation`, `Ritual`, `AbcGame`, `Pattern`. Le pont Edgyx n'a pas besoin de
toucher à cette base : la source des exports peut être l'extension elle-même
(local-first) ou notre backend, selon l'option retenue.
