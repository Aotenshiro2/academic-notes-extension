# Guide de Test - Academic Notes Extension

## 🚀 Installation et Chargement dans Chrome

### Prérequis
- Chrome/Chromium 120+ (recommandé pour Chrome AI)
- Mode développeur activé dans les extensions

### Étapes d'installation

1. **Ouvrir Chrome Extensions**
   ```
   chrome://extensions/
   ```

2. **Activer le Mode Développeur**
   - Basculer le switch "Mode développeur" en haut à droite

3. **Charger l'Extension**
   - Cliquer "Charger l'extension non empaquetée"
   - Sélectionner le dossier `academic-notes-extension/dist/`

4. **Vérifier l'Installation**
   - ✅ Extension apparaît dans la liste
   - ✅ Icône Academic Notes dans la toolbar
   - ✅ Aucune erreur dans la console des extensions

## 🧪 Tests de Base

### Test 1: Activation de l'Extension
- **Action**: Cliquer sur l'icône Academic Notes dans la toolbar
- **Attendu**: Sidepanel s'ouvre avec l'interface React
- **Vérifier**: 
  - Interface moderne avec header bleu
  - Onglets Notes/Stats/Config visibles
  - Message "Aucune note" affiché initialement

### Test 2: Raccourcis Clavier
- **Action**: Appuyer `Ctrl+Shift+A` (ou `Cmd+Shift+A` sur Mac)
- **Attendu**: Sidepanel s'ouvre/se ferme
- **Action**: Appuyer `Ctrl+Shift+C` sur une page web
- **Attendu**: Capture rapide de la page (à implémenter)

### Test 3: Menu Contextuel
- **Action**: Clic droit sur n'importe quelle page web
- **Attendu**: Menu "Academic Notes" apparaît
- **Options visibles**:
  - "Ouvrir Academic Notes"
  - "Capturer cette page"

## 📄 Tests de Capture de Contenu

### Test 4: Article de Blog
- **Site test**: https://medium.com/@exemple ou blog personnel
- **Actions**:
  1. Ouvrir un article
  2. Clic droit → "Capturer cette page"
  3. Vérifier dans le sidepanel
- **Attendu**:
  - Note créée avec titre de l'article
  - Contenu extrait proprement
  - Métadonnées (auteur, date) si disponibles
  - Type détecté: "article"

### Test 5: Vidéo YouTube
- **Site test**: https://www.youtube.com/watch?v=EXEMPLE
- **Actions**:
  1. Ouvrir une vidéo YouTube
  2. Utiliser `Ctrl+Shift+A` puis bouton "Page"
  3. Vérifier la capture
- **Attendu**:
  - Titre de la vidéo capturé
  - Description extraite
  - Métadonnées (chaîne, durée)
  - Type détecté: "video"

### Test 6: Document PDF
- **Sites test**: 
  - https://arxiv.org/pdf/EXEMPLE.pdf
  - PDF sur Google Drive
- **Actions**: Capturer la page PDF
- **Attendu**:
  - Titre du document
  - Type détecté: "pdf"
  - Contenu textuel si extractible

### Test 7: Page Web Générique
- **Site test**: Page Wikipedia, documentation technique
- **Attendu**:
  - Contenu principal extrait
  - Navigation/sidebar exclus
  - Type: "webpage" ou "documentation"

## 🎨 Tests d'Interface

### Test 8: Navigation Sidepanel
- **Actions**:
  1. Ouvrir sidepanel
  2. Tester les 3 onglets: Notes/Stats/Config
- **Vérifier**:
  - Transitions fluides
  - Contenu approprié dans chaque section
  - Responsive design

### Test 9: Recherche dans les Notes
- **Prérequis**: Avoir capturé quelques notes
- **Actions**:
  1. Onglet "Notes"
  2. Utiliser la barre de recherche
  3. Taper mots-clés
- **Attendu**:
  - Filtrage en temps réel
  - Résultats pertinents surlignés
  - Performance fluide

### Test 10: Configuration
- **Actions**:
  1. Onglet "Config"
  2. Modifier les paramètres
  3. Tester toggles et options
- **Vérifier**:
  - Paramètres sauvegardés
  - Interface reactive
  - URL Journal d'Études configurable

## 🤖 Tests IA (Chrome AI)

### Test 11: Disponibilité Chrome AI
- **Action**: Ouvrir Console DevTools de l'extension
- **Vérifier**: Logs indiquant la disponibilité de Chrome AI
- **Attendu**: Message confirmation ou fallback gracieux

### Test 12: Génération de Résumé
- **Prérequis**: Chrome AI disponible
- **Actions**:
  1. Capturer un article long
  2. Attendre génération automatique
- **Attendu**:
  - Résumé de 2-3 phrases
  - En français
  - Pertinent au contenu

### Test 13: Extraction de Concepts
- **Attendu**:
  - 3-5 concepts clés extraits
  - Affichés comme tags verts
  - Pertinents au domaine académique

## 🔄 Tests de Stockage

### Test 14: Persistance des Données
- **Actions**:
  1. Capturer plusieurs notes
  2. Fermer Chrome complètement
  3. Relancer et ouvrir extension
- **Attendu**:
  - Toutes les notes toujours présentes
  - Métadonnées préservées
  - Performance de chargement

### Test 15: Export/Import
- **Actions**:
  1. Onglet Config → Export
  2. Vérifier fichier JSON généré
  3. Tester Import (optionnel)
- **Attendu**:
  - Fichier JSON valide
  - Contient toutes les données
  - Date d'export incluse

## 📊 Tests de Performance

### Test 16: Temps de Réponse
- **Mesurer**:
  - Temps d'ouverture sidepanel: < 500ms
  - Capture de contenu: < 2s
  - Recherche dans notes: instantané
- **Outils**: DevTools → Performance

### Test 17: Utilisation Mémoire
- **Vérifier**:
  - Pas de fuites mémoire
  - Stockage IndexedDB efficace
  - Extension stable après usage prolongé

## 🐛 Tests d'Erreurs

### Test 18: Gestion d'Erreurs
- **Scénarios**:
  1. Page sans contenu
  2. Site avec restrictions CORS
  3. PDF protégé/non accessible
- **Attendu**:
  - Messages d'erreur clairs
  - Pas de crash de l'extension
  - Fallback approprié

### Test 19: Permissions
- **Vérifier**:
  - Extension fonctionne sur tous types de sites
  - Permissions minimales respectées
  - Aucun avertissement Chrome

## 📝 Rapport de Test

### Template de Résultat
```
✅ Test Réussi | ❌ Test Échoué | ⚠️ Problème Mineur

[ ] Test 1: Activation Extension
[ ] Test 2: Raccourcis Clavier  
[ ] Test 3: Menu Contextuel
[ ] Test 4: Article de Blog
[ ] Test 5: Vidéo YouTube
[ ] Test 6: Document PDF
[ ] Test 7: Page Web Générique
[ ] Test 8: Navigation Sidepanel
[ ] Test 9: Recherche Notes
[ ] Test 10: Configuration
[ ] Test 11: Chrome AI Disponibilité
[ ] Test 12: Génération Résumé
[ ] Test 13: Extraction Concepts
[ ] Test 14: Persistance Données
[ ] Test 15: Export/Import
[ ] Test 16: Performance
[ ] Test 17: Mémoire
[ ] Test 18: Gestion Erreurs
[ ] Test 19: Permissions

Notes: [Commentaires et problèmes identifiés]
```

## 🚀 Prochaines Étapes après Tests

1. **Corriger bugs identifiés**
2. **Optimiser performance si nécessaire**
3. **Améliorer extraction contenu**
4. **Tester synchronisation Journal d'Études**
5. **Préparer publication Chrome Web Store**

---

**Important**: Tester sur différents sites pour valider la robustesse de l'extraction de contenu !