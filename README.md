# Trading Notes by AOKnowledge

![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)

Une extension Chrome moderne pour prendre des notes de trading directement pendant votre navigation web.

## ✨ Fonctionnalités

- **📝 Prise de notes rapide** - Interface style Claude avec panneau latéral
- **📸 Captures d'écran** - Incluez facilement des captures dans vos notes  
- **🏷️ Organisation automatique** - Classement par page web et métadonnées
- **💾 Stockage local** - Toutes vos données restent privées sur votre appareil
- **⌨️ Raccourcis clavier** - Navigation rapide et productive
- **🌙 Mode sombre** - Interface adaptée à tous les environnements

## 🚀 Installation

### Depuis le Chrome Web Store (Recommandé)
1. Visitez le [Chrome Web Store](#) (lien bientôt disponible)
2. Cliquez sur "Ajouter à Chrome"
3. Confirmez l'installation

### Installation manuelle (Développeurs)
1. Téléchargez la dernière release depuis [GitHub Releases](#)
2. Ouvrez Chrome → Extensions → Mode développeur
3. "Charger l'extension non empaquetée"
4. Sélectionnez le dossier `dist/`

## 📖 Utilisation

1. **Activation** - Cliquez sur l'icône de l'extension ou utilisez `Ctrl+Shift+A`
2. **Nouvelle note** - Tapez dans l'éditeur en bas et pressez Entrée
3. **Capture d'écran** - Cliquez sur l'icône appareil photo
4. **Historique** - Accédez à vos notes précédentes via l'icône horloge

## 🛠️ Développement

### Prérequis
- Node.js 18+
- npm ou yarn

### Installation locale
```bash
git clone https://github.com/Aotenshiro2/academic-notes-extension.git
cd academic-notes-extension
npm install
```

### Scripts disponibles
```bash
npm run dev        # Mode développement
npm run build      # Build production
npm run type-check # Vérification TypeScript
```

### Architecture
- **Frontend** : React + TypeScript + Tailwind CSS
- **Stockage** : Chrome Storage API + IndexedDB
- **Build** : Vite avec configuration Chrome Extension

## 🔒 Confidentialité

Cette extension respecte votre vie privée :
- ✅ **Aucune collecte de données** personnelles
- ✅ **Stockage local uniquement** - vos notes ne quittent jamais votre appareil
- ✅ **Aucun tracking** ou analytics
- ✅ **Open source** - code entièrement auditable

[Lire notre politique de confidentialité complète](https://aotenshiro2.github.io/academic-notes-extension/privacy-policy.html)

## 📋 Permissions

L'extension demande les permissions suivantes :

- `sidePanel` - Affichage de l'interface
- `storage` - Sauvegarde locale de vos notes  
- `activeTab` - Contexte de la page courante
- `tabCapture` - Captures d'écran
- `scripting` - Intégration avec les pages web

## 🤝 Contribution

Les contributions sont les bienvenues ! Consultez notre [guide de contribution](CONTRIBUTING.md).

1. Fork du projet
2. Créez une branche feature (`git checkout -b feature/amazing-feature`)
3. Commit des changements (`git commit -m 'Add amazing feature'`)
4. Push vers la branche (`git push origin feature/amazing-feature`)
5. Ouvrez une Pull Request

## 🐛 Signaler un bug

Utilisez les [GitHub Issues](https://github.com/Aotenshiro2/academic-notes-extension/issues) pour signaler des bugs ou demander des fonctionnalités.

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 👥 Équipe

Développé par **AOKnowledge** - Spécialistes en outils de trading et formation.

---

⭐ N'hésitez pas à donner une étoile si ce projet vous aide dans vos analyses de trading !