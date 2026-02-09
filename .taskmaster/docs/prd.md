# PRD - Trading Notes Extension v1.1

## Vue d'ensemble

Extension Chrome pour la prise de notes de trading/études avec interface sidepanel, stockage local IndexedDB, et synchronisation optionnelle avec Journal d'Études.

## État actuel

### Fonctionnalités implémentées ✅
- Interface React sidepanel avec éditeur riche (React Quill)
- Stockage local IndexedDB (Dexie.js) + Chrome Storage
- Capture de screenshots
- Menu contextuel et raccourcis clavier (Ctrl+Shift+A, Ctrl+Shift+C)
- Export/Import JSON
- Mode sombre
- Extraction de contenu web basique

### En attente de validation ⏳
- Publication Chrome Web Store (soumis, en attente review)

## Objectifs v1.1

### 1. Corrections post-review Chrome Store

#### 1.1 Mise à jour documentation
- Mettre à jour README.md pour refléter les permissions actuelles (supprimer mention de `scripting`)
- Mettre à jour BUILD_STATUS.md section permissions
- Vérifier cohérence de toute la documentation

#### 1.2 Corrections mineures
- Vérifier que toutes les permissions listées sont utilisées
- Audit de sécurité basique du code

### 2. Tests et Stabilité

#### 2.1 Tests manuels
- Tester sur différents types de sites (articles, vidéos YouTube, PDF viewers)
- Tester les raccourcis clavier sur différents OS
- Tester le mode offline
- Tester l'export/import de données

#### 2.2 Tests automatisés (optionnel)
- Configurer Vitest pour tests unitaires
- Tests des fonctions utilitaires (storage.ts, image-utils.ts)
- Tests des extracteurs de contenu

### 3. Fonctionnalités à compléter

#### 3.1 Synchronisation Journal d'Études
Le code existe mais nécessite validation :
- Tester la connexion API avec Journal d'Études
- Valider le flow d'authentification
- Tester la sync bidirectionnelle
- Gérer les conflits de sync

#### 3.2 AI Processing
Le module existe (`ai-processor.ts`) mais dépend de Chrome AI :
- Documenter les prérequis Chrome AI
- Implémenter fallback si Chrome AI indisponible
- Tester les résumés automatiques
- Tester l'extraction de concepts

#### 3.3 Extraction de contenu avancée
Le service-worker.ts complet existe mais n'est pas utilisé :
- Évaluer si on active le service-worker complet (nécessite permission `scripting`)
- Ou améliorer le content-script actuel
- Support PDF amélioré
- Support vidéo (YouTube, Vimeo) avec métadonnées

### 4. Optimisations

#### 4.1 Performance
- Lazy loading des modules non essentiels
- Optimisation de la compression d'images
- Cache des extractions de contenu

#### 4.2 UX
- Améliorer les messages d'erreur
- Ajouter des tooltips
- Améliorer l'onboarding première utilisation
- Feedback visuel lors des actions (saves, captures)

### 5. Documentation

#### 5.1 Documentation utilisateur
- Guide d'utilisation complet
- FAQ
- Tutoriel vidéo (optionnel)

#### 5.2 Documentation technique
- Architecture du code
- Guide de contribution
- Changelog

### 6. Publication

#### 6.1 Chrome Web Store
- Suivre le status de la review
- Préparer les assets marketing (screenshots, description)
- Répondre aux éventuels retours Google

#### 6.2 GitHub
- Créer les releases
- Configurer les GitHub Actions pour CI/CD
- Badges et documentation repo

## Priorités

| Priorité | Tâches |
|----------|--------|
| P0 (Critique) | Corrections post-review Chrome |
| P1 (Haute) | Tests manuels, Documentation utilisateur |
| P2 (Moyenne) | Sync Journal d'Études, Optimisations UX |
| P3 (Basse) | Tests automatisés, AI Processing, CI/CD |

## Contraintes techniques

- Manifest V3 (pas de remote code execution)
- Chrome AI availability limitée
- Stockage local uniquement (privacy-first)
- Build avec Vite

## Métriques de succès

- Extension approuvée sur Chrome Web Store
- 0 crash reporté
- Temps de capture < 2 secondes
- Toutes les fonctionnalités documentées

---

## Objectifs v1.2 (Nouvelles fonctionnalités)

### 7. Capture Améliorée ✅
- Screenshot automatique lors de la capture de page
- Le contenu de la note inclut : titre, URL, et screenshot
- Fallback gracieux si la capture échoue

### 8. Carte Conversation Récente ✅
- Afficher la dernière conversation sur l'écran d'accueil
- Accès rapide en un clic sous le bouton "Capturer"
- Affichage du titre, temps relatif et domaine

### 9. Extraction de Description (v1.3 - Futur)
- Extraire la méta-description ou premiers paragraphes
- Utiliser message passing avec le content-script
- Éviter la permission `scripting`

### 10. Analyse IA (v1.4 - Futur)
- Bouton "Analyser avec IA" dans les notes
- Export vers ChatGPT, Claude ou Gemini
- Ouvre un nouvel onglet avec le contenu pré-rempli
- Configuration du service IA préféré dans les settings
- Prompt personnalisable

---

## Objectifs v1.3 - Bugs Techniques et Securite

### 11. Correction XSS via dangerouslySetInnerHTML (CRITIQUE)

Le contenu HTML des notes est rendu sans sanitisation dans 4 fichiers. Un titre de page malveillant ou du contenu injecte pourrait executer du JavaScript dans le contexte de l'extension.

**Fichiers concernes :**
- `src/components/CurrentNoteView.tsx:185`
- `src/components/NoteDetailModal.tsx:231`
- `src/components/NotesList.tsx:102`
- `src/fullscreen/FullscreenApp.tsx:367`

**Solution :** Installer `dompurify`, creer `src/lib/sanitize.ts`, et appliquer `sanitizeHTML()` partout ou `dangerouslySetInnerHTML` est utilise. Echapper aussi `pageTitle` dans `App.tsx:265` avant interpolation HTML.

### 12. Correction web_accessible_resources manifest (HIGH)

**Fichier :** `public/manifest.json:54-62`

Le manifest declare `src/content/*` dans `web_accessible_resources` mais ce path n'existe pas dans le build. Les content scripts injectes par le manifest n'ont pas besoin d'etre web-accessible.

**Solution :** Retirer `src/content/*`, garder seulement `src/fullscreen/*`.

### 13. Correction Promise non geree dans sync (MEDIUM)

**Fichier :** `src/lib/journal-sync.ts`

Le constructeur appelle `loadAuthToken()` sans await. Le token pourrait ne pas etre charge avant les appels API.

**Solution :** Pattern `ensureTokenLoaded()` : stocker la promise et l'attendre avant chaque appel API.

### 14. Retirer Migration UI de la vue principale (LOW)

**Fichier :** `src/sidepanel/App.tsx:365-375`

Le bouton "Recuperer les anciennes notes" est affiche en production quand il n'y a pas de notes.

**Solution :** Retirer ou deplacer vers les Settings.

### 15. Modal agrandissement screenshot (LOW)

**Fichier :** `src/components/CurrentNoteView.tsx:210`

Le clic sur un screenshot ne fait rien (TODO non implemente).

**Solution :** Lightbox simple avec overlay fullscreen et bouton fermer.

### 15b. Auto-focus editeur apres envoi d'une note (HIGH - UX)

**Fichiers concernes :**
- `src/components/SimpleRichEditor.tsx`
- `src/sidepanel/App.tsx`

Apres avoir appuye sur Entree pour envoyer/sauvegarder une note, la zone de texte (editeur) perd le focus. L'utilisateur doit recliquer manuellement dans l'editeur pour continuer a taper.

**Comportement attendu :** Apres l'envoi, l'editeur doit :
1. Se vider (deja fait)
2. Reprendre automatiquement le focus pour permettre de continuer a ecrire immediatement

**Solution :** Apres le `setEditorContent('')` dans `handleAddContent`, appeler un `ref.focus()` sur l'editeur avec un leger delai pour laisser le temps au state de se mettre a jour.

---

## Objectifs v1.4 - Whisper Speech-to-Text Local

### 16. Dictee vocale dans l'editeur

Ajouter un bouton micro dans la toolbar de l'editeur (`SimpleRichEditor.tsx`) permettant de dicter du texte vocalement. La transcription est faite localement via OpenAI Whisper, sans aucun cout API.

**Technologie :** `@xenova/transformers` (Transformers.js)
- Modele : `Xenova/whisper-tiny` (~40MB, multilingual)
- 100% local et prive, zero cout
- ~90% precision, supporte francais et anglais
- Telecharge au 1er usage, cache local ensuite

**Architecture :** Offscreen Document (Chrome 109+)
- Supporte WebAssembly (ONNX Runtime)
- Supporte `getUserMedia` pour l'acces au microphone
- Duree de vie flexible

**Flux :**
1. Clic sur le bouton micro dans l'editeur
2. `WhisperService` cree le document offscreen si necessaire
3. Offscreen document demande acces micro (`getUserMedia`)
4. Audio enregistre via `MediaRecorder`
5. A l'arret, audio passe a Whisper pour inference
6. Transcription renvoyee et inseree dans l'editeur

**Fichiers a creer :**
- `src/lib/whisper/whisper-service.ts` - Service interface UI <-> offscreen
- `src/offscreen/whisper-offscreen.html` - Point d'entree offscreen
- `src/offscreen/whisper-offscreen.ts` - Logique Whisper (modele, micro, inference)
- `src/components/MicButton.tsx` - Bouton micro avec etats (idle/recording/transcribing)
- `src/components/WhisperModelStatus.tsx` - Indicateur de telechargement du modele

**Fichiers a modifier :**
- `package.json` - Ajouter `@xenova/transformers`
- `public/manifest.json` - Permission `offscreen`, CSP `wasm-unsafe-eval`
- `vite.config.ts` - Entree offscreen, config WASM
- `src/types/academic.ts` - Types messages Whisper
- `src/background/service-worker.ts` - Routing messages Whisper
- `src/components/SimpleRichEditor.tsx` - Integration MicButton

### 17. Transcription video automatique

Ajouter la possibilite de transcrire l'audio des videos YouTube/web pendant la capture de notes.

**Flux :**
1. Detection page video (YouTube, Vimeo, etc.) via URL pattern
2. Bouton "Transcrire la video" dans le sidepanel
3. Pour YouTube : essayer d'abord l'extraction DOM des sous-titres
4. Fallback : capturer l'audio via `captureStream()` sur l'element `<video>`
5. Audio envoye a Whisper dans le document offscreen
6. Transcription progressive affichee dans un panneau dedie
7. Option d'inserer la transcription dans la note courante

**Fichiers a creer :**
- `src/components/TranscriptionPanel.tsx` - Panneau de transcription en temps reel

**Prerequis :** Feature #16 (dictee vocale) doit etre implementee en premier car elle pose l'infrastructure Whisper.

### Contraintes Whisper

- **Taille extension :** ~15-20MB sans le modele (bien sous la limite Chrome Web Store)
- **Modele cache :** ~40MB stocke localement apres premier telechargement
- **CSP necessaire :** `script-src 'self' 'wasm-unsafe-eval'` pour le WebAssembly
- **Chrome minimum :** 109+ (support Offscreen Document)
- **RAM :** ~300-500MB pendant la transcription
- **Performance :** ~30-60 secondes par minute d'audio sur machine standard

---

## Changelog v1.0.6 - Corrections UI/UX ✅

### Implémenté le 30/01/2026

#### Screenshot dans capture intelligente ✅
- `handleSmartCapture` capture maintenant un screenshot via `chrome.tabs.captureVisibleTab()`
- Le screenshot est inclus dans le contenu de la note
- Résumé et points clés ne sont plus dupliqués dans le contenu (affichés via blocs séparés)

#### Icônes Export/Import corrigées ✅
- **Header:** Icône Export PDF changée de `Download` vers `Upload` (flèche sortante)
- **Settings:** Export = `Upload`, Import = `Download` (sens logique)

#### Résumé repositionné en haut ✅
- Dans `CurrentNoteView.tsx`, les blocs Résumé et Points clés sont maintenant affichés AVANT le contenu éditable
- Meilleure lisibilité immédiate des informations extraites

#### Bouton + retourne à l'accueil ✅
- `handleNewNote` remplacé par `handleGoHome` qui fait `setCurrentNoteId(null)`
- Permet de revenir à `EmptyNoteView` facilement
- Tooltip changé en "Nouvelle capture"

#### Bouton "Capturer page" dans note ouverte ✅
- Nouvelle fonction `handleSmartCaptureToCurrentNote` pour ajouter une capture à une note existante
- Bouton avec icône Sparkles dans `CurrentNoteView`
- Ajoute le contenu capturé (résumé, points clés, screenshot) à la fin de la note

**Fichiers modifiés:**
- `src/sidepanel/App.tsx`
- `src/components/Header.tsx`
- `src/components/SettingsView.tsx`
- `src/components/CurrentNoteView.tsx`

---

## Changelog v1.0.7 - Fix Scroll Historique + Chrome Web Store ✅

### Implémenté le 30/01/2026

#### Fix scroll dans panneau historique ✅
- **Problème:** Impossible de faire défiler la liste des notes dans l'historique
- **Cause:** Le conteneur parent avait `h-full` mais pas `flex flex-col`, donc `flex-1 overflow-y-auto` ne fonctionnait pas
- **Solution:** Ajout de `flex flex-col` au conteneur principal

**Fichier modifié:** `src/components/HistoryDropdown.tsx` (ligne 118)

#### Description Chrome Web Store mise à jour ✅

**Description courte (manifest.json):**
> Ne perdez plus jamais une analyse. Capturez vos insights trading en 1 clic avec screenshot et résumé auto.

**Justification permission "scripting" (pour soumission):**
> This extension uses the scripting permission to extract page content when the user initiates a "Smart Capture" action. The script reads the page's text content, metadata (title, description, author, Open Graph tags), and structure to create a summarized note. No data is sent to external servers - all extracted content is stored locally in the browser using IndexedDB. The scripting permission is only executed on user demand (click on capture button), never automatically.

**Description longue Chrome Web Store:**
```
🎯 TRADING NOTES - Votre mémoire de trader, amplifiée

Vous passez des heures à analyser des graphiques, lire des articles, regarder des vidéos... mais combien d'insights précieux avez-vous oubliés ?

Trading Notes capture et organise automatiquement vos recherches pour que vous puissiez vous concentrer sur ce qui compte : devenir un meilleur trader.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ FONCTIONNALITÉS CLÉS

📸 Capture Intelligente en 1 clic
• Screenshot automatique de la page
• Extraction des points clés
• Résumé généré instantanément
• Fonctionne sur TradingView, YouTube, articles, forums...

📝 Prise de Notes Fluide
• Éditeur riche intégré (gras, listes, liens)
• Ajoutez vos annotations personnelles
• Combinez plusieurs captures dans une même note

🔍 Retrouvez Tout Instantanément
• Historique complet de vos captures
• Recherche par tags et concepts
• Toutes vos notes accessibles en sidebar

📤 Export & Sauvegarde
• Export PDF de vos notes
• Sauvegarde JSON de toutes vos données
• Vos données restent sur VOTRE navigateur

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 CAS D'USAGE

• Sauvegarder une analyse TradingView prometteuse
• Capturer les points clés d'une vidéo YouTube de formation
• Archiver un setup de trading repéré sur Twitter/X
• Documenter votre journal de trading quotidien
• Conserver les leçons de vos trades (gagnants ET perdants)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ RACCOURCIS CLAVIER

• Ctrl+Shift+A : Ouvrir/fermer le panneau
• Ctrl+Shift+C : Capture rapide

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 RESPECT DE VOTRE VIE PRIVÉE

• Aucune donnée envoyée à des serveurs externes
• Tout reste stocké localement dans Chrome
• Pas de compte requis, pas de tracking

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Développé par AOKnowledge pour les traders qui veulent progresser.

Des questions ? Rejoignez notre communauté sur Skool.
```

**Fichiers modifiés:**
- `public/manifest.json`
- `package.json`

---

## Objectifs v1.5 - UX et Page Fullscreen

### 18. Refonte de la page Fullscreen

La page fullscreen (`src/fullscreen/FullscreenApp.tsx`) necessite une refonte pour devenir un vrai espace de travail etendu, au-dela d'un simple agrandissement du sidepanel.

**Ameliorations prevues :**
- Layout ameliore avec sidebar de navigation des notes + zone principale de lecture/edition
- Barre d'outils complete (edition, export PDF, partage, recherche)
- Navigation clavier entre les notes (fleches haut/bas)
- Meilleur affichage des metadonnees (URL source, tags, date, type de contenu)
- Vue grille/liste pour l'historique des notes
- Filtrage et tri avances (par date, type, tags, domaine)
- Indicateur visuel du type de note (article, video, PDF, manuel)
- Mode lecture confortable (espacement, taille de police ajustable)

**Fichiers concernes :**
- `src/fullscreen/FullscreenApp.tsx` - Composant principal a refondre
- `src/fullscreen/index.html` - Point d'entree
- Potentiellement de nouveaux composants dedies a la vue fullscreen

### 19. Amelioration de la mise en forme du texte

L'editeur de notes doit offrir une meilleure experience visuelle et des outils de mise en forme plus accessibles pour faciliter la prise de notes.

**Ameliorations prevues :**
- Toolbar de mise en forme visible et intuitive (gras, italique, souligne, titres, listes)
- Support des titres (H1, H2, H3) avec raccourcis clavier
- Listes a puces et numerotees
- Citations (blockquote) avec style visuel distinctif
- Blocs de code avec coloration syntaxique basique
- Separateurs horizontaux
- Surlignage de texte (couleurs)
- Alignement du texte (gauche, centre, droite)
- Meilleur rendu visuel du contenu dans les notes : espacement, typographie, contraste
- Styles coherents entre le sidepanel, le fullscreen et l'export PDF

**Fichiers concernes :**
- `src/components/SimpleRichEditor.tsx` - Editeur principal a enrichir
- `src/components/RichEditor.tsx` - Editeur Quill (alternative, deja partiellement implemente)
- CSS global / Tailwind config pour les styles de contenu (`prose`)
- `src/components/CurrentNoteView.tsx` - Rendu du contenu des notes
- `src/fullscreen/FullscreenApp.tsx` - Rendu fullscreen
