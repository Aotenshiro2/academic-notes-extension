# Academic Notes Collector - Extension Chrome

> Extension Chrome pour la capture intelligente de contenu académique et synchronisation avec Journal d'Études

## 🎯 Vision du Projet

**Academic Notes Collector** est une extension Chrome moderne qui révolutionne la prise de notes académiques en capturant intelligemment le contenu web et en le synchronisant avec l'application Journal d'Études pour visualisation sous forme de mindmap.

## ✨ Fonctionnalités Principales

### 📝 **Capture Intelligente**
- ✅ **Articles académiques** avec extraction des métadonnées (auteur, DOI, journal)
- ✅ **Vidéos YouTube/Vimeo** avec extraction des sous-titres
- ✅ **Documents PDF** avec reconnaissance automatique
- ✅ **Pages web génériques** avec extraction du contenu principal
- ✅ **Captures d'écran** annotées et contextuelles

### 🧠 **Intelligence Artificielle**
- ✅ **Résumés automatiques** via Chrome AI (Gemini Nano)
- ✅ **Extraction de concepts** académiques clés
- ✅ **Génération de tags** de classification
- ✅ **Structure mindmap** automatique
- ✅ **Questions d'étude** générées

### 🔗 **Synchronisation Journal d'Études**
- ✅ **Sync bidirectionnelle** avec l'application web
- ✅ **Canvas automatique** pour organisation des notes
- ✅ **Métadonnées enrichies** pour traçabilité
- ✅ **Mode offline** avec sync différée

### 🎨 **Interface Moderne**
- ✅ **Side panel** React avec Tailwind CSS
- ✅ **Recherche intelligente** dans les notes
- ✅ **Statistiques d'usage** et analytics
- ✅ **Dark/Light mode** adaptatif

## 🛠️ Stack Technique

### **Core Technologies**
- **Chrome Extension Manifest V3** - Architecture moderne et sécurisée
- **TypeScript** - Sécurité des types et développement robuste
- **React 18** - Interface utilisateur moderne et réactive
- **Tailwind CSS** - Styling rapide et cohérent

### **Storage & Data**
- **IndexedDB** via Dexie.js - Stockage local performant
- **Chrome Storage API** - Configuration et préférences
- **Sync Queue System** - Synchronisation fiable

### **AI & Processing**
- **Chrome AI (Gemini Nano)** - Traitement local et privacy-first
- **Content Extractors** - Modules spécialisés par type de contenu
- **Mindmap Generation** - Structure hiérarchique intelligente

### **Build System**
- **Vite** - Build rapide et hot-reload
- **Multi-entrypoint** - Service worker, content script, sidepanel
- **TypeScript compilation** - Type safety

## 🚀 Installation & Développement

### Prérequis
- Node.js 18+
- Chrome/Chromium 120+ (pour Chrome AI)
- Accès à Journal d'Études (optionnel)

### Setup Développement
```bash
# Installation des dépendances
npm install

# Build de développement
npm run dev

# Build de production
npm run build

# Vérifications
npm run type-check
npm run lint
```

### Chargement dans Chrome
1. Ouvrir `chrome://extensions/`
2. Activer le "Mode développeur"
3. Cliquer "Charger l'extension non empaquetée"
4. Sélectionner le dossier `dist/`

## 📱 Utilisation

### **Captures Rapides**
- **Raccourci global** : `Ctrl+Shift+A` (ouvrir sidepanel)
- **Capture page** : `Ctrl+Shift+C` (capture rapide)
- **Menu contextuel** : Clic droit → Academic Notes

### **Types de Contenu Supportés**
- 📄 **Articles** : Blogs, actualités, articles académiques
- 🎥 **Vidéos** : YouTube, Vimeo, plateformes éducatives
- 📚 **PDF** : ArXiv, ResearchGate, Google Drive, viewers génériques
- 🌐 **Documentation** : API docs, tutoriels, guides techniques

### **Synchronisation**
1. Configurer l'URL Journal d'Études dans les paramètres
2. Activer la synchronisation automatique
3. Les notes sont automatiquement envoyées vers un canvas dédié
4. Visualisation mindmap dans l'application web

## 🔧 Architecture du Code

### **Structure des Dossiers**
```
src/
├── background/           # Service worker
│   └── service-worker.ts # Orchestration centrale
├── content/             # Content scripts
│   └── content-script.ts # Injection DOM et extraction
├── sidepanel/           # Interface utilisateur
│   ├── App.tsx         # Application React principale
│   └── components/     # Composants React
├── lib/                # Bibliothèques
│   ├── storage.ts      # Dexie.js et Chrome Storage
│   ├── ai-processor.ts # Chrome AI et enrichissement
│   ├── journal-sync.ts # Synchronisation Journal d'Études
│   └── extractors/     # Extracteurs spécialisés
└── types/              # Définitions TypeScript
```

### **Composants Clés**
- **ContentExtractor** - Orchestration des extracteurs spécialisés
- **AIProcessor** - Enrichissement IA avec Chrome AI
- **JournalSync** - Synchronisation bidirectionnelle
- **Storage** - Gestion unifiée des données locales

## 📊 Fonctionnalités Avancées

### **Intelligence Artificielle**
- **Chrome AI local** - Pas d'API externe, privacy-first
- **Résumés contextuels** - Adaptés au type de contenu
- **Concepts académiques** - Extraction terminologique spécialisée
- **Mindmap automatique** - Structure hiérarchique intelligente

### **Extracteurs Spécialisés**
- **ArticleExtractor** - Métadonnées Open Graph, auteurs, citations
- **VideoExtractor** - Sous-titres, durée, métadonnées enrichies
- **PDFExtractor** - Support multi-viewer, ArXiv, Google Drive

### **Stockage Hybride**
- **IndexedDB** - Notes, captures, extraits (données volumineuses)
- **Chrome Storage** - Configuration, préférences (sync cross-device)
- **Export/Import** - Sauvegarde complète JSON

## 🌐 Intégration Journal d'Études

### **Workflow Complet**
1. **Capture** via extension → Stockage local IndexedDB
2. **Enrichissement IA** → Résumés, concepts, tags
3. **Sync automatique** → API Journal d'Études
4. **Visualisation mindmap** → Canvas interactif React Flow
5. **Organisation** → Connexions, groupements, métadonnées

### **Données Synchronisées**
- Contenu enrichi avec résumés IA
- Métadonnées complètes (URL, auteur, date, domaine)
- Tags et concepts automatiques
- Structure mindmap prégénérée
- Captures d'écran contextuelles

## 🔒 Sécurité & Privacy

### **Privacy-First**
- **Chrome AI local** - Pas de données envoyées vers des serveurs tiers
- **Stockage local** - IndexedDB chiffré côté navigateur
- **Sync optionnelle** - Contrôle utilisateur complet
- **Permissions minimales** - Seulement le nécessaire

### **Permissions Chrome**
- `sidePanel` - Interface latérale persistante
- `storage` - Configuration locale
- `activeTab` - Accès page courante uniquement
- `scripting` - Injection de scripts pour extraction
- `contextMenus` - Menus contextuels

## 🚀 Roadmap & Évolutions

### **Phase 1** (Actuelle) - MVP Fonctionnel
- [x] Architecture complète Manifest V3
- [x] Extracteurs spécialisés (articles, vidéos, PDF)
- [x] Interface React moderne
- [x] Chrome AI intégration
- [x] Synchronisation Journal d'Études

### **Phase 2** - Enrichissements
- [ ] Support Notion, Obsidian (export)
- [ ] OCR pour images et PDFs scannés
- [ ] Collaboration temps réel
- [ ] Analytics avancées d'usage

### **Phase 3** - Écosystème
- [ ] API publique pour intégrations tierces
- [ ] Plugins pour autres navigateurs
- [ ] Mobile companion app
- [ ] Marketplace d'extracteurs

## 🤝 Contribution & Support

### **Développement Local**
```bash
git clone <repository-url>
cd academic-notes-extension
npm install
npm run dev
```

### **Standards de Code**
- **TypeScript strict** obligatoire
- **ESLint** + **Prettier** pour la qualité
- **React Hooks** patterns modernes
- **Tests unitaires** avec Vitest

### **Architecture Patterns**
- **Composition over inheritance** pour les extracteurs
- **Event-driven communication** entre composants
- **Async/await** pour toutes les opérations async
- **Error boundaries** React pour la robustesse

---

**Maintenu par l'équipe AOKnowledge**  
**Version actuelle :** 1.0 Beta  
**Dernière mise à jour :** 8 novembre 2025