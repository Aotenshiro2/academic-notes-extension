# Trading Notes by AOKnowledge

![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Version](https://img.shields.io/badge/Version-1.2.4-blue)

Une extension Chrome pour capturer, organiser et analyser vos notes de trading directement pendant votre navigation web.

## Fonctionnalités

- **Prise de notes rapide** - Interface style messagerie avec panneau latéral
- **Captures d'écran** - Screenshots intégrés directement dans les notes
- **Mode plein écran** - Édition avancée avec sidebar de navigation
- **Export PDF** - Exportez vos notes en PDF fidèle au contenu
- **Analyse IA** - Envoyez vos notes vers ChatGPT, Claude, Gemini, Perplexity ou Grok en un clic
- **Organisation** - Tags, concepts, historique et recherche
- **Stockage local** - Toutes vos données restent privées sur votre appareil
- **Mode sombre** - Interface adaptée à tous les environnements

## Raccourcis clavier

| Raccourci | Mac | Action |
|-----------|-----|--------|
| `Ctrl+Shift+A` | `Cmd+Shift+A` | Ouvrir / fermer le panneau latéral |
| `Alt+Shift+C` | `Opt+Shift+C` | Capture rapide de la page courante |
| `Ctrl+B` | `Cmd+B` | Gras |
| `Ctrl+I` | `Cmd+I` | Italique |
| `Ctrl+U` | `Cmd+U` | Souligner |
| `Ctrl+Shift+S` | `Cmd+Shift+S` | Capture d'écran |
| `Ctrl+Shift+I` | `Cmd+Shift+I` | Insérer une image |
| `Entrée` | `Entrée` | Envoyer le message |
| `Shift+Entrée` | `Shift+Entrée` | Nouvelle ligne |

## Installation

### Depuis le Chrome Web Store (Recommandé)
1. Visitez le [Chrome Web Store](https://chromewebstore.google.com/detail/trading-notes-by-aoknowle/phajegonlmgnjkkfdooedoddnmgpheic)
2. Cliquez sur "Ajouter à Chrome"
3. Confirmez l'installation

### Installation manuelle (Développeurs)
1. Clonez le dépôt
2. Ouvrez Chrome > Extensions > Mode développeur
3. "Charger l'extension non empaquetée"
4. Sélectionnez le dossier `dist/`

## Développement

### Prérequis
- Node.js 18+
- npm

### Scripts
```bash
npm install            # Installer les dépendances
npm run dev            # Mode développement
npm run build          # Build production
npm run type-check     # Vérification TypeScript
```

### Architecture
- **Frontend** : React + TypeScript + Tailwind CSS
- **Stockage** : Chrome Storage API + IndexedDB (Dexie.js)
- **Build** : Vite avec configuration Chrome Extension MV3
- **Analyse IA** : Injection DOM dans les providers (aucune API, aucune clé)

## Permissions

- `sidePanel` — Affichage de l'interface latérale
- `storage` — Sauvegarde locale de vos notes
- `activeTab` — Contexte de la page courante
- `tabs` — Accès aux informations des onglets
- `contextMenus` — Menu contextuel (clic droit)
- `scripting` — Injection du contexte dans les providers IA

## Confidentialité

- Aucune collecte de données personnelles
- Stockage local uniquement — vos notes ne quittent jamais votre appareil
- Aucun tracking ni analytics
- L'analyse IA ouvre le provider dans un nouvel onglet — aucune donnée ne transite par nos serveurs

[Politique de confidentialité](https://aotenshiro2.github.io/academic-notes-extension/privacy-policy.html)

## Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

Développé par **AOKnowledge**.
