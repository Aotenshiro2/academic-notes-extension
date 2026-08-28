// Support IA — v0 (décision Brice 28/08) : sur chaque app AOK, un bouton
// « contacter le support ». Le robot répond d'abord (backend journal,
// périmètre borné aux produits) ; « Parler à un humain » marque le fil
// escaladé en base et ouvre un email pré-rempli avec la transcription.
// Les fils sont conservés en base : matière du futur suivi par membre
// dans le cockpit.
import { toast } from '@/lib/toast'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, LifeBuoy, Send, Loader2, User } from 'lucide-react'
import { sendSupportMessage, escalateSupport } from '@/lib/sync'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function SupportView({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const threadIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setSending(true)
    const res = await sendSupportMessage(text, threadIdRef.current)
    setSending(false)
    if (res.reply) {
      threadIdRef.current = res.threadId ?? threadIdRef.current
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply! }])
    } else {
      toast.error(res.error ?? 'Support indisponible.')
    }
  }, [input, sending])

  const talkToHuman = useCallback(async () => {
    const { email } = await escalateSupport(threadIdRef.current)
    const transcript = messages
      .map(m => `${m.role === 'user' ? 'Moi' : 'Assistant'} : ${m.content}`)
      .join('\n\n')
      .slice(0, 1400)
    const body = transcript
      ? `Bonjour,\n\n[Décris ton problème ici]\n\n--- Échange avec l'assistant ---\n${transcript}`
      : 'Bonjour,\n\n[Décris ton problème ici]'
    const url = `mailto:${email}?subject=${encodeURIComponent('Support — Le Carnet du Trader')}&body=${encodeURIComponent(body)}`
    chrome.tabs.create({ url })
  }, [messages])

  return (
    <div className="flex flex-col h-full min-h-[420px] p-4 gap-3">
      {/* En-tête */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          aria-label="Retour"
        >
          <ArrowLeft size={16} />
        </button>
        <LifeBuoy size={16} className="text-blue-500 flex-shrink-0" />
        <h2 className="flex-1 text-sm font-semibold text-foreground">Support</h2>
      </div>

      {/* Fil */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground leading-relaxed p-3 bg-muted/40 rounded-lg">
            Pose ta question sur l'extension, le Journal d'Études ou ton compte AOK.
            L'assistant répond tout de suite, et « Parler à un humain » reste toujours là.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'ml-auto bg-primary text-primary-foreground rounded-br-sm'
                : 'mr-auto bg-muted/60 text-foreground/90 rounded-bl-sm'
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="mr-auto flex items-center gap-2 px-3 py-2 text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">L'assistant écrit…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* « Parler à un humain » — bandeau léger juste au-dessus de la saisie
          (placement demandé par Brice 28/08 : visible sans crier) */}
      <button
        onClick={talkToHuman}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border/60 bg-muted/30 shadow-sm text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        title="Envoyer un email à l'équipe avec la transcription de cet échange"
      >
        <User size={12} />
        Parler à un humain
      </button>

      {/* Saisie */}
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Ta question…"
          rows={1}
          className="flex-1 resize-none text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary max-h-24"
        />
        <button
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors flex-shrink-0"
          aria-label="Envoyer"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}

export default SupportView
