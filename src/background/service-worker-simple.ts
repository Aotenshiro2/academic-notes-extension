// Service Worker simplifié pour Academic Notes Extension

// Garder le service worker actif
function keepAlive() {
  setInterval(() => {
    chrome.runtime.getPlatformInfo()
  }, 20000)
}

// Initialisation
chrome.runtime.onStartup.addListener(() => {
  console.log('Academic Notes Extension started')
  keepAlive()
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('Academic Notes Extension installed')
  setupContextMenus()
  keepAlive()
})

// Menus contextuels
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'open-sidebar',
      title: 'Ouvrir Academic Notes',
      contexts: ['page']
    })

    chrome.contextMenus.create({
      id: 'capture-page',
      title: 'Capturer cette page',
      contexts: ['page']
    })
  })
}

// Gestion des menus
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return

  switch (info.menuItemId) {
    case 'open-sidebar':
      await chrome.sidePanel.open({ tabId: tab.id })
      break
    case 'capture-page':
      await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_PAGE' })
      break
  }
})

// Commandes clavier
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return

  switch (command) {
    case 'toggle-sidebar':
      await chrome.sidePanel.open({ tabId: tab.id })
      break
    case 'quick-capture':
      await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_PAGE' })
      break
  }
})

// Action sur l'icône
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id })
  }
})

// Messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse)
  return true
})

async function handleMessage(message: any, sender: any, sendResponse: any) {
  try {
    switch (message.type) {
      case 'CAPTURE_SCREENSHOT':
        const dataUrl = await chrome.tabs.captureVisibleTab()
        sendResponse({ success: true, dataUrl })
        break
      default:
        sendResponse({ error: 'Unknown message type' })
    }
  } catch (error) {
    sendResponse({ error: 'Error processing message' })
  }
}

keepAlive()