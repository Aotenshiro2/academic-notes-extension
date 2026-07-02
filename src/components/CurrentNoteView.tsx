import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Edit3, Check, X, Plus, Crosshair } from 'lucide-react'
import storage from '@/lib/storage'
import { sanitizeHtml } from '@/lib/sanitize'
import ImageLightbox from './ImageLightbox'
import MessageBlock from './MessageBlock'
import MessageDetailPanel from './MessageDetailPanel'
import TagPickerPopup from './TagPickerPopup'
import NotationPopover from './NotationPopover'
import type { AcademicNote, NoteMessage, Annotation, AnnotationGrade, AnnotationCause, TradeSegment, TradeOutcome } from '@/types/academic'

const REVIEW_DELAY_MS = 14 * 24 * 60 * 60 * 1000

const GRADE_BADGE_CLASS: Record<AnnotationGrade, string> = {
  A: 'bg-green-500/15 text-green-600 dark:text-green-400',
  B: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  C: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

const GRADE_TEXT_CLASS: Record<AnnotationGrade, string> = {
  A: 'text-green-600 dark:text-green-400',
  B: 'text-amber-600 dark:text-amber-400',
  C: 'text-red-600 dark:text-red-400',
}

const OUTCOME_LABEL: Record<TradeOutcome, string> = { gain: 'Gain', perte: 'Perte', be: 'BE' }
const OUTCOME_CLASS: Record<TradeOutcome, string> = {
  gain: 'text-green-600 dark:text-green-400',
  perte: 'text-red-600 dark:text-red-400',
  be: 'text-muted-foreground',
}

function formatTradeTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

interface CurrentNoteViewProps {
  noteId: string
  onNoteUpdate?: () => void
  refreshTrigger?: number
  initialLightboxIndex?: number
}

function CurrentNoteView({ noteId, onNoteUpdate, refreshTrigger, initialLightboxIndex }: CurrentNoteViewProps) {
  const [note, setNote] = useState<AcademicNote | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(initialLightboxIndex ?? null)
  const [panelMessage, setPanelMessage] = useState<NoteMessage | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [tagPickerPos, setTagPickerPos] = useState({ top: 0, bottom: 0, left: 0 })
  // Cible de notation : {} = note entière, { tradeRef } = un segment de trade
  const [notationTarget, setNotationTarget] = useState<{ tradeRef?: string } | null>(null)
  const [notationPos, setNotationPos] = useState({ top: 0, bottom: 0, left: 0 })
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null)
  const [addingConcept, setAddingConcept] = useState(false)
  const [conceptDraft, setConceptDraft] = useState('')
  const [remoteUpdatePending, setRemoteUpdatePending] = useState(false)
  const isFirstLoad = useRef(true)

  // Recharger la note quand noteId change
  useEffect(() => {
    isFirstLoad.current = true
    setRemoteUpdatePending(false)
    loadNote()
  }, [noteId])

  // Quand un refresh distant arrive, vérifier si une édition est en cours
  useEffect(() => {
    if (!refreshTrigger) return
    if (editingTitle || panelMessage !== null || tagPickerOpen || notationTarget !== null) {
      setRemoteUpdatePending(true)
    } else {
      loadNote()
    }
  }, [refreshTrigger])


  const loadNote = async () => {
    try {
      // Spinner uniquement au premier chargement — les refreshes suivants
      // mettent à jour silencieusement pour ne pas réinitialiser le scroll
      if (isFirstLoad.current) setIsLoading(true)
      const noteWithMessages = await storage.ensureNoteHasMessages(noteId)
      setNote(noteWithMessages)
      isFirstLoad.current = false
    } catch (error) {
      console.error('Error loading note:', error)
      const notes = await storage.getNotes(1000)
      const foundNote = notes.find(n => n.id === noteId)
      setNote(foundNote || null)
      isFirstLoad.current = false
    } finally {
      setIsLoading(false)
    }
  }

  // Collect all image sources from the note for lightbox navigation
  const noteImages = useMemo(() => {
    if (!note) return []
    const imgs: string[] = []

    // Images from messages
    note.messages?.forEach(msg => {
      if (msg.type === 'image' || msg.type === 'screenshot' || msg.type === 'capture') {
        imgs.push(msg.content)
      } else if (msg.type === 'text') {
        // Extract <img src="..."> from HTML content
        const matches = msg.content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)
        for (const m of matches) {
          if (m[1]) imgs.push(m[1])
        }
      }
    })

    // Images from legacy screenshots array
    note.screenshots?.forEach(s => {
      if (s.dataUrl && !imgs.includes(s.dataUrl)) {
        imgs.push(s.dataUrl)
      }
    })

    // If no messages, extract from legacy content
    if ((!note.messages || note.messages.length === 0) && note.content) {
      const matches = note.content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)
      for (const m of matches) {
        if (m[1] && !imgs.includes(m[1])) imgs.push(m[1])
      }
    }

    return imgs
  }, [note])

  const handleImageClick = useCallback((src: string) => {
    const idx = noteImages.indexOf(src)
    const index = idx >= 0 ? idx : 0

    if (window.innerWidth < 500 && note) {
      // Contexte sidepanel — ouvrir dans un onglet plein écran
      chrome.storage.session.set({
        pendingImageView: { images: noteImages, currentIndex: index }
      })
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/fullscreen/index.html') + '?imageView=1'
      })
    } else {
      setLightboxIndex(index)
    }
  }, [noteImages, note])

  // Handlers for MessageBlock
  const handleUpdateMessage = useCallback(async (messageId: string, content: string) => {
    if (!note) return
    await storage.updateMessage(noteId, messageId, { content })
    setRemoteUpdatePending(false)
    await loadNote()
    onNoteUpdate?.()
  }, [noteId, note, onNoteUpdate])

  const saveTitle = useCallback(async () => {
    if (!note || !titleDraft.trim()) { setEditingTitle(false); return }
    await storage.saveNote({ ...note, title: titleDraft.trim() })
    setEditingTitle(false)
    setRemoteUpdatePending(false)
    await loadNote()
    onNoteUpdate?.()
  }, [note, titleDraft, onNoteUpdate])

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!note) return
    await storage.deleteMessage(noteId, messageId)
    await loadNote()
    onNoteUpdate?.()
  }, [noteId, note, onNoteUpdate])

  const handleAddTag = useCallback(async (tagName: string) => {
    if (!note) return
    const newTag = tagName.trim().replace(/^#/, '')
    if (!newTag || note.tags.includes(newTag)) return
    await storage.saveNote({ ...note, tags: [...note.tags, newTag] })
    await loadNote()
    onNoteUpdate?.()
  }, [note, onNoteUpdate])

  const handleRemoveTag = useCallback(async (tag: string) => {
    if (!note) return
    await storage.saveNote({ ...note, tags: note.tags.filter(t => t !== tag) })
    await loadNote()
    onNoteUpdate?.()
  }, [note, onNoteUpdate])

  // Annotation courante de la note (ni messageRef ni tradeRef = jugement de la note entière)
  const noteAnnotation: Annotation | undefined = useMemo(() => {
    return (note?.annotations ?? [])
      .filter(a => !a.messageRef && !a.tradeRef)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
  }, [note])

  const findTradeAnnotation = useCallback((tradeId: string): Annotation | undefined => {
    return (note?.annotations ?? [])
      .filter(a => a.tradeRef === tradeId)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
  }, [note])

  const handleSaveNotation = useCallback(async (grade: AnnotationGrade, phrase: string, cause: AnnotationCause | null) => {
    if (!note || !notationTarget) return
    const tradeRef = notationTarget.tradeRef
    const existing = tradeRef ? findTradeAnnotation(tradeRef) : noteAnnotation
    const rest = (note.annotations ?? []).filter(a => a !== existing)
    // Re-jugement = même id (upsert idempotent côté journal, pas de doublon en relecture)
    const updated: Annotation = existing
      ? { ...existing, grade, phrase, causeCategory: cause ?? undefined }
      : {
          id: crypto.randomUUID(),
          noteId: note.id,
          tradeRef,
          grade,
          phrase,
          causeCategory: cause ?? undefined,
          createdAt: Date.now(),
          reviewDueAt: Date.now() + REVIEW_DELAY_MS,
        }
    await storage.saveNote({ ...note, annotations: [...rest, updated] })
    setRemoteUpdatePending(false)
    await loadNote()
    onNoteUpdate?.()
  }, [note, notationTarget, noteAnnotation, findTradeAnnotation, onNoteUpdate])

  const handleCloseTrade = useCallback(async (tradeId: string, outcome: TradeOutcome) => {
    await storage.closeTrade(noteId, tradeId, outcome)
    setClosingTradeId(null)
    await loadNote()
    onNoteUpdate?.()
  }, [noteId, onNoteUpdate])

  // ---- Concepts éditables ----
  const handleAddConcept = useCallback(async () => {
    if (!note) return
    const name = conceptDraft.trim()
    setAddingConcept(false)
    setConceptDraft('')
    if (!name || note.concepts.includes(name)) return
    await storage.saveNote({ ...note, concepts: [...note.concepts, name] })
    await loadNote()
    onNoteUpdate?.()
  }, [note, conceptDraft, onNoteUpdate])

  const handleRemoveConcept = useCallback(async (concept: string) => {
    if (!note) return
    await storage.saveNote({ ...note, concepts: note.concepts.filter(c => c !== concept) })
    await loadNote()
    onNoteUpdate?.()
  }, [note, onNoteUpdate])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground mb-4">Note introuvable</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-secondary"
        >
          Actualiser
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Bandeau : mise à jour distante en attente */}
      {remoteUpdatePending && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-400">
          <span>Note mise à jour dans une autre fenêtre.</span>
          <button
            onClick={() => { setRemoteUpdatePending(false); loadNote() }}
            className="font-medium underline underline-offset-2 hover:no-underline flex-shrink-0"
          >
            Recharger
          </button>
        </div>
      )}

      {/* Titre de la note */}
      <div className="flex items-center gap-2 group pb-1 border-b border-border/40">
        {editingTitle ? (
          <>
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); saveTitle() }
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              className="flex-1 text-sm font-semibold bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <button onClick={saveTitle} className="p-1 text-green-600 hover:text-green-700 rounded flex-shrink-0" aria-label="Sauvegarder"><Check size={13} /></button>
            <button onClick={() => setEditingTitle(false)} className="p-1 text-muted-foreground hover:text-foreground rounded flex-shrink-0" aria-label="Annuler"><X size={13} /></button>
          </>
        ) : (
          <>
            <h2 className="flex-1 text-sm font-semibold text-foreground truncate">{note.title}</h2>
            <button
              onClick={() => { setTitleDraft(note.title); setEditingTitle(true) }}
              className="p-1 text-muted-foreground hover:text-primary rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              title="Modifier le titre"
              aria-label="Modifier le titre"
            >
              <Edit3 size={13} />
            </button>
            <button
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                setNotationPos({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 })
                setNotationTarget({})
              }}
              className={`flex items-center justify-center w-[22px] h-[22px] rounded-full text-[11px] font-semibold flex-shrink-0 transition-colors ${
                noteAnnotation
                  ? GRADE_BADGE_CLASS[noteAnnotation.grade]
                  : 'border border-dashed border-muted-foreground/40 text-muted-foreground/60 hover:text-foreground hover:border-muted-foreground'
              }`}
              title={noteAnnotation ? `${noteAnnotation.grade} — ${noteAnnotation.phrase}` : 'Noter (A/B/C + une phrase)'}
              aria-label={noteAnnotation ? `Notation ${noteAnnotation.grade}, modifier` : 'Noter cette note'}
            >
              {noteAnnotation ? noteAnnotation.grade : '±'}
            </button>
          </>
        )}
      </div>

      {/* Tags de note — même taxonomie que les tags de messages (picker journal) */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1">
        {note.tags.map((tag) => (
          <span
            key={tag}
            className="group flex items-center gap-1 px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full"
          >
            #{tag}
            <button
              onClick={() => handleRemoveTag(tag)}
              className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity leading-none"
              title="Retirer ce tag"
              aria-label={`Retirer le tag ${tag}`}
            >
              <X size={9} />
            </button>
          </span>
        ))}
        <button
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            setTagPickerPos({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 })
            setTagPickerOpen(true)
          }}
          className="flex items-center gap-0.5 px-2 py-0.5 text-xs text-muted-foreground/60 hover:text-primary rounded-full hover:bg-muted transition-colors"
          title="Ajouter un tag"
        >
          <Plus size={10} />
          <span>tag</span>
        </button>
        {tagPickerOpen && (
          <TagPickerPopup
            position={tagPickerPos}
            currentTags={note.tags}
            onAdd={handleAddTag}
            onRemove={handleRemoveTag}
            onClose={() => setTagPickerOpen(false)}
          />
        )}
      </div>

      {/* Notation visible — le « pourquoi » se relit à chaque passage */}
      {noteAnnotation && (
        <button
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            setNotationPos({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 })
            setNotationTarget({})
          }}
          className="flex items-baseline gap-1.5 text-left w-full rounded hover:bg-muted/30 px-1 py-0.5 -mx-1 transition-colors"
          title="Modifier la notation"
        >
          <span className={`text-[11px] font-semibold flex-shrink-0 ${GRADE_TEXT_CLASS[noteAnnotation.grade]}`}>
            {noteAnnotation.grade}
          </span>
          <span className="text-[11px] text-muted-foreground italic leading-snug">
            « {noteAnnotation.phrase} »
          </span>
        </button>
      )}

      {/* Résumé */}
      {note.summary && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <h3 className="text-sm font-semibold text-primary mb-2">Résumé</h3>
          <p className="text-sm text-foreground/90">{note.summary}</p>
        </div>
      )}

      {/* Points clés - EN HAUT avant le contenu */}
      {note.keyPoints && note.keyPoints.length > 0 && (
        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">Points clés</h3>
          <ul className="space-y-1.5">
            {note.keyPoints.map((point, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-foreground/90">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Contenu de la note — blocs messages, segmentés par trade */}
      {(note.messages && note.messages.length > 0) || (note.trades && note.trades.length > 0) ? (
        <div className="space-y-3">
          {(() => {
            const trades = note.trades ?? []
            const tradesById = new Map(trades.map(t => [t.id, t]))
            const tradeNumber = (id: string) => trades.findIndex(t => t.id === id) + 1
            const seen = new Set<string>()
            const items: React.ReactNode[] = []

            const renderMarker = (trade: TradeSegment) => {
              const n = tradeNumber(trade.id)
              const tradeAnnotation = findTradeAnnotation(trade.id)
              return (
                <div key={`trade-${trade.id}`} className="flex items-center gap-2 pt-1">
                  <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Crosshair size={10} />
                    Trade {n} · {formatTradeTime(trade.startedAt)}
                  </span>
                  <span className="flex-1 border-t border-blue-500/20" />
                  {closingTradeId === trade.id ? (
                    <span className="flex items-center gap-1">
                      {(['gain', 'perte', 'be'] as TradeOutcome[]).map(o => (
                        <button
                          key={o}
                          onClick={() => handleCloseTrade(trade.id, o)}
                          className={`text-[10px] px-2 py-0.5 rounded-full border border-border hover:bg-muted transition-colors ${OUTCOME_CLASS[o]}`}
                        >
                          {OUTCOME_LABEL[o]}
                        </button>
                      ))}
                      <button
                        onClick={() => setClosingTradeId(null)}
                        className="p-0.5 text-muted-foreground/60 hover:text-foreground"
                        aria-label="Annuler"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ) : !trade.closedAt ? (
                    <>
                      <span className="text-[10px] text-blue-600/70 dark:text-blue-400/70">en cours</span>
                      <button
                        onClick={() => setClosingTradeId(trade.id)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        Clore
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setClosingTradeId(trade.id)}
                        className={`text-[10px] font-medium hover:underline underline-offset-2 ${trade.outcome ? OUTCOME_CLASS[trade.outcome] : 'text-muted-foreground/60'}`}
                        title="Modifier le résultat"
                      >
                        {trade.outcome ? OUTCOME_LABEL[trade.outcome] : 'Résultat ?'}
                      </button>
                      <button
                        onClick={e => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setNotationPos({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 })
                          setNotationTarget({ tradeRef: trade.id })
                        }}
                        className={`flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] font-semibold flex-shrink-0 transition-colors ${
                          tradeAnnotation
                            ? GRADE_BADGE_CLASS[tradeAnnotation.grade]
                            : 'border border-dashed border-muted-foreground/40 text-muted-foreground/60 hover:text-foreground hover:border-muted-foreground'
                        }`}
                        title={tradeAnnotation ? `${tradeAnnotation.grade} — ${tradeAnnotation.phrase}` : 'Noter ce trade'}
                        aria-label={tradeAnnotation ? `Notation ${tradeAnnotation.grade} du trade ${n}` : `Noter le trade ${n}`}
                      >
                        {tradeAnnotation ? tradeAnnotation.grade : '±'}
                      </button>
                    </>
                  )}
                </div>
              )
            }

            for (const message of note.messages ?? []) {
              const tRef = message.tradeRef
              if (tRef && !seen.has(tRef) && tradesById.has(tRef)) {
                seen.add(tRef)
                items.push(renderMarker(tradesById.get(tRef)!))
              }
              items.push(
                <div key={message.id} className={tRef && tradesById.has(tRef) ? 'border-l-2 border-blue-500/25 pl-2.5 ml-1' : undefined}>
                  <MessageBlock
                    message={message}
                    noteId={noteId}
                    onUpdate={handleUpdateMessage}
                    onDelete={handleDeleteMessage}
                    onTagsUpdate={loadNote}
                    onImageClick={handleImageClick}
                    onOpenPanel={() => setPanelMessage(message)}
                  />
                </div>
              )
            }

            // Trades sans messages (fraîchement démarrés ou vides) — marqueur en fin de fil
            for (const trade of trades) {
              if (!seen.has(trade.id)) {
                seen.add(trade.id)
                items.push(renderMarker(trade))
              }
            }

            return items
          })()}
        </div>
      ) : note.content ? (
        /* Fallback pour anciennes notes sans messages */
        <div className="prose prose-sm max-w-none">
          <div
            className="text-foreground/90 leading-relaxed p-3 [&_img]:cursor-zoom-in [&_img]:transition-opacity [&_img]:hover:opacity-80"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.content) }}
            onClick={(e) => {
              const target = e.target as HTMLElement
              if (target.tagName === 'IMG') {
                e.stopPropagation()
                const src = (target as HTMLImageElement).src
                if (src) handleImageClick(src)
              }
            }}
          />
        </div>
      ) : null}

      {/* Popover de notation — note entière ou segment de trade */}
      {notationTarget && (
        <NotationPopover
          position={notationPos}
          existing={notationTarget.tradeRef ? findTradeAnnotation(notationTarget.tradeRef) : noteAnnotation}
          outcome={notationTarget.tradeRef ? (note.trades ?? []).find(t => t.id === notationTarget.tradeRef)?.outcome : undefined}
          onSave={handleSaveNotation}
          onClose={() => setNotationTarget(null)}
        />
      )}

      {/* Message Detail Panel overlay */}
      {panelMessage && (
        <MessageDetailPanel
          message={panelMessage}
          onClose={() => setPanelMessage(null)}
          onUpdate={async (id, content) => {
            await handleUpdateMessage(id, content)
            setPanelMessage(null)
          }}
          onDelete={async (id) => {
            await handleDeleteMessage(id)
            setPanelMessage(null)
          }}
        />
      )}

      {/* Image Lightbox with navigation */}
      {lightboxIndex !== null && noteImages.length > 0 && (
        <ImageLightbox
          src={noteImages[lightboxIndex]}
          alt="Note image"
          onClose={() => setLightboxIndex(null)}
          images={noteImages}
          currentIndex={lightboxIndex}
          onNavigate={setLightboxIndex}
        />
      )}

      {/* Concepts — extraits par la smart capture, corrigeables à la main */}
      {note.concepts.length > 0 && (
        <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">Concepts</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {note.concepts.map((concept) => (
              <span
                key={concept}
                className="group flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-full"
              >
                {concept}
                <button
                  onClick={() => handleRemoveConcept(concept)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity leading-none"
                  title="Retirer ce concept"
                  aria-label={`Retirer le concept ${concept}`}
                >
                  <X size={9} />
                </button>
              </span>
            ))}
            {addingConcept ? (
              <input
                autoFocus
                value={conceptDraft}
                onChange={e => setConceptDraft(e.target.value)}
                onBlur={handleAddConcept}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleAddConcept() }
                  if (e.key === 'Escape') { setAddingConcept(false); setConceptDraft('') }
                }}
                placeholder="concept…"
                className="px-2 py-0.5 text-xs bg-blue-500/10 rounded-full border border-blue-500/30 focus:outline-none focus:ring-1 focus:ring-blue-500/20 w-24 text-blue-700 dark:text-blue-300"
              />
            ) : (
              <button
                onClick={() => setAddingConcept(true)}
                className="flex items-center gap-0.5 px-2 py-0.5 text-xs text-blue-600/50 dark:text-blue-400/50 hover:text-blue-600 dark:hover:text-blue-400 rounded-full hover:bg-blue-500/10 transition-colors"
                title="Ajouter un concept"
              >
                <Plus size={10} />
              </button>
            )}
          </div>
        </div>
      )}


      {/* Screenshots si présentes */}
      {note.screenshots && note.screenshots.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Captures d'écran</h3>
          <div className="grid grid-cols-2 gap-3">
            {note.screenshots.map((screenshot, index) => (
              <img
                key={index}
                src={screenshot.dataUrl}
                alt={`Capture ${index + 1}`}
                className="rounded-lg border border-border cursor-zoom-in hover:opacity-80 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  handleImageClick(screenshot.dataUrl)
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default CurrentNoteView
