import type { SiteStrategy, SiteExtractResult } from '../types'

function extractGmail(): SiteExtractResult {
  try {
    // Sujet de l'email
    const subject =
      document.querySelector('h2[data-thread-perm-id]')?.textContent?.trim() ||
      document.querySelector('h2[data-legacy-thread-id]')?.textContent?.trim() ||
      document.querySelector('[role="main"] h2')?.textContent?.trim() ||
      document.querySelector('.hP')?.textContent?.trim() ||
      ''

    // Expéditeur — nom
    // Prefer stable attribute-based selectors; avoid obfuscated classes like .gD
    const senderNameEl =
      document.querySelector('[email][name]') ||
      document.querySelector('[data-hovercard-id]')
    let senderName =
      senderNameEl?.getAttribute('name') ||
      senderNameEl?.textContent?.trim() ||
      ''

    // Expéditeur — adresse email
    const senderEmail =
      senderNameEl?.getAttribute('email') ||
      senderNameEl?.getAttribute('data-hovercard-id') ||
      ''

    // Expéditeur fallback: parse innerText for "De : Name" / "From: Name"
    if (!senderName) {
      const fromMatch = document.body?.innerText?.match(/(?:De\s*:|From\s*:)\s*([^\n<(]{1,80})/i)
      if (fromMatch) senderName = fromMatch[1].trim()
    }

    // Date d'envoi — avoid obfuscated .g3
    const dateEl =
      document.querySelector('[data-tooltip*=":"]') ||
      document.querySelector('.gH .gK span[title]') ||
      document.querySelector('[title*=":"][aria-label]') ||
      document.querySelector('span[title][data-thread-perm-id]')
    const emailDate = dateEl?.getAttribute('title') || dateEl?.textContent?.trim() || ''

    // Corps de l'email — avoid obfuscated .a3s.aiL
    const bodyEl =
      document.querySelector('[role="main"] .ii.gt div') ||
      document.querySelector('.gs .ii') ||
      document.querySelector('[data-legacy-message-id] div[dir]') ||
      document.querySelector('[data-message-id] div[dir]')
    let bodyText = ''
    let bodyHtml = ''
    if (bodyEl) {
      // Cloner pour nettoyer
      const clone = bodyEl.cloneNode(true) as HTMLElement
      clone.querySelectorAll('style, script, .gmail_quote, blockquote').forEach(el => el.remove())
      bodyText = clone.textContent?.trim() || ''
      bodyHtml = clone.innerHTML || ''
    }
    // Fallback: use [role="main"] innerText (strips noise from heading/nav elements)
    if (!bodyText) {
      const mainEl = document.querySelector('[role="main"]')
      if (mainEl) {
        const clone = mainEl.cloneNode(true) as HTMLElement
        clone.querySelectorAll('style, script, .gmail_quote, blockquote, [role="heading"], nav').forEach(el => el.remove())
        bodyText = clone.textContent?.trim().slice(0, 8000) || ''
      }
    }

    // Construire le contenu
    const parts: string[] = []
    if (subject) parts.push(`<p><strong>Sujet :</strong> ${subject}</p>`)
    if (senderName || senderEmail) {
      const sender = senderName && senderEmail
        ? `${senderName} (${senderEmail})`
        : senderName || senderEmail
      parts.push(`<p><strong>De :</strong> ${sender}</p>`)
    }
    if (emailDate) parts.push(`<p><strong>Date :</strong> ${emailDate}</p>`)
    if (bodyHtml) {
      parts.push(`<hr><div>${bodyHtml.slice(0, 8000)}</div>`)
    } else if (bodyText) {
      parts.push(`<hr><p>${bodyText.slice(0, 8000)}</p>`)
    }

    const content = parts.join('\n')

    // Résumé
    const summaryParts: string[] = []
    if (subject) summaryParts.push(subject)
    if (senderName) summaryParts.push(`de ${senderName}`)
    const summary = summaryParts.join(' — ') || 'Email Gmail'

    // Tags
    const tags = ['newsletter']
    if (senderName) tags.push(senderName.toLowerCase().slice(0, 30))

    // Key points
    const keyPoints: string[] = []
    if (subject) keyPoints.push(`Sujet: ${subject}`)
    if (senderName) keyPoints.push(`De: ${senderName}`)
    if (emailDate) keyPoints.push(`Date: ${emailDate}`)

    return {
      success: content.length >= 50,
      pageTitle: subject || 'Email Gmail',
      content,
      summary,
      keyPoints,
      concepts: [],
      tags,
      description: bodyText.slice(0, 300),
      author: senderName,
      siteName: 'Gmail',
      extras: { senderEmail, emailDate }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

function extractOutlook(): SiteExtractResult {
  try {
    // Sujet
    const subject =
      document.querySelector('[role="main"] [class*="subject"]')?.textContent?.trim() ||
      document.querySelector('[aria-label*="Message"]')?.getAttribute('aria-label') ||
      document.querySelector('span[id*="Subject"]')?.textContent?.trim() ||
      ''

    // Expéditeur
    const senderEl =
      document.querySelector('[class*="sender"] [class*="name"]') ||
      document.querySelector('[class*="FromContainer"] span') ||
      document.querySelector('[aria-label*="De"]') ||
      document.querySelector('[aria-label*="From"]')
    const senderName = senderEl?.textContent?.trim() || ''

    // Date
    const dateEl =
      document.querySelector('[class*="DateTimeSent"]') ||
      document.querySelector('time') ||
      document.querySelector('[class*="sentTime"]')
    const emailDate = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || ''

    // Corps
    const bodyEl =
      document.querySelector('[role="main"] [class*="ItemBody"]') ||
      document.querySelector('[aria-label*="corps"]') ||
      document.querySelector('[aria-label*="body"]') ||
      document.querySelector('[class*="ReadingPaneContent"]')
    let bodyText = ''
    let bodyHtml = ''
    if (bodyEl) {
      const clone = bodyEl.cloneNode(true) as HTMLElement
      clone.querySelectorAll('style, script').forEach(el => el.remove())
      bodyText = clone.textContent?.trim() || ''
      bodyHtml = clone.innerHTML || ''
    }

    // Construire
    const parts: string[] = []
    if (subject) parts.push(`<p><strong>Sujet :</strong> ${subject}</p>`)
    if (senderName) parts.push(`<p><strong>De :</strong> ${senderName}</p>`)
    if (emailDate) parts.push(`<p><strong>Date :</strong> ${emailDate}</p>`)
    if (bodyHtml) {
      parts.push(`<hr><div>${bodyHtml.slice(0, 8000)}</div>`)
    } else if (bodyText) {
      parts.push(`<hr><p>${bodyText.slice(0, 8000)}</p>`)
    }

    const content = parts.join('\n')

    const tags = ['newsletter']
    if (senderName) tags.push(senderName.toLowerCase().slice(0, 30))

    return {
      success: content.length >= 50,
      pageTitle: subject || 'Email Outlook',
      content,
      summary: subject ? `${subject} — de ${senderName}` : 'Email Outlook',
      keyPoints: [
        subject ? `Sujet: ${subject}` : '',
        senderName ? `De: ${senderName}` : '',
        emailDate ? `Date: ${emailDate}` : '',
      ].filter(Boolean),
      concepts: [],
      tags,
      description: bodyText.slice(0, 300),
      author: senderName,
      siteName: 'Outlook',
      extras: { emailDate }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const gmailStrategy: SiteStrategy = {
  id: 'gmail',
  label: 'Gmail',
  match: (url: string) => /mail\.google\.com/i.test(url),
  priority: 10,
  func: extractGmail
}

export const outlookStrategy: SiteStrategy = {
  id: 'outlook',
  label: 'Outlook',
  match: (url: string) => /outlook\.(live|office|com)/i.test(url),
  priority: 10,
  func: extractOutlook
}
