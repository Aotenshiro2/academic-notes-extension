# Setup des Icônes Chrome Extension

## 🎯 Instructions pour Windows

L'extension nécessite des icônes PNG dans le dossier `dist/icons/`. Voici comment les générer :

### Méthode 1 : Script automatique (Recommandé)

1. Ouvrez le fichier `scripts/create-icons.html` dans votre navigateur
2. Cliquez droit sur chaque icône générée → "Enregistrer l'image sous"
3. Sauvegardez dans `dist/icons/` avec les noms suivants :
   - `icon-16.png` (16x16)
   - `icon-32.png` (32x32) 
   - `icon-48.png` (48x48)
   - `icon-128.png` (128x128)

### Méthode 2 : Icônes par défaut

Si vous voulez tester rapidement, vous pouvez utiliser n'importe quelles icônes PNG de ces tailles et les renommer correctement.

### Méthode 3 : Online converter

1. Ouvrez https://www.svgviewer.dev/svg-to-png-converter
2. Uploadez les fichiers SVG du dossier `dist/icons/` (si présents)
3. Convertissez aux tailles 16x16, 32x32, 48x48, 128x128
4. Téléchargez et placez dans `dist/icons/`

## ✅ Vérification

Après avoir ajouté les icônes PNG, votre dossier `dist/icons/` doit contenir :
```
dist/icons/
├── icon-16.png
├── icon-32.png
├── icon-48.png
└── icon-128.png
```

## 🚀 Installation Chrome

1. Ouvrez Chrome → `chrome://extensions/`
2. Activez "Mode développeur" (coin supérieur droit)
3. Cliquez "Charger l'extension non empaquetée"
4. Sélectionnez le dossier `dist/`
5. L'extension apparaît dans la liste !

## 🎯 Test de l'extension

- **Raccourci** : `Ctrl+Shift+A` pour ouvrir le sidepanel
- **Capture rapide** : `Ctrl+Shift+C`
- **Menu contextuel** : Clic droit sur une page → "Academic Notes"