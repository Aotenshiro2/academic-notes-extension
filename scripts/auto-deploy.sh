#!/bin/bash

# Auto-deploy script pour Trading Notes Extension
# Usage: ./scripts/auto-deploy.sh [commit-message]

set -e  # Exit on any error

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Auto-Deploy Script pour Trading Notes Extension${NC}"
echo "=================================================="

# Vérifier si on est dans le bon répertoire
if [[ ! -f "package.json" ]] || [[ ! -f "public/manifest.json" ]]; then
    echo -e "${RED}❌ Erreur: Ce script doit être exécuté depuis la racine du projet${NC}"
    exit 1
fi

# Vérifier si Git est configuré
if [[ -z $(git config user.name) ]] || [[ -z $(git config user.email) ]]; then
    echo -e "${YELLOW}⚙️  Configuration Git...${NC}"
    git config user.name "AOKnowledge"
    git config user.email "brice.d@aoknowledge.com"
    echo -e "${GREEN}✅ Git configuré${NC}"
fi

# Message de commit (paramètre ou par défaut)
COMMIT_MSG="${1:-"Update Trading Notes Extension - Auto-deploy

🔄 Automated deployment
- Code improvements and security updates
- Ready for Chrome Web Store publication

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"}"

echo -e "${YELLOW}📝 Message de commit:${NC}"
echo "\"$COMMIT_MSG\""
echo ""

# Vérifier le statut Git
echo -e "${YELLOW}🔍 Vérification du statut Git...${NC}"
git status --porcelain

# Build de l'extension
echo -e "${YELLOW}🔨 Build de l'extension...${NC}"
if npm run build; then
    echo -e "${GREEN}✅ Build réussi${NC}"
else
    echo -e "${RED}❌ Erreur de build${NC}"
    exit 1
fi

# Créer le package Chrome Web Store
echo -e "${YELLOW}📦 Création du package Chrome Web Store...${NC}"
if python3 create-package.py; then
    echo -e "${GREEN}✅ Package créé: trading-notes-extension.zip${NC}"
else
    echo -e "${RED}❌ Erreur création package${NC}"
    exit 1
fi

# Ajouter les fichiers au staging
echo -e "${YELLOW}➕ Ajout des fichiers...${NC}"
git add .

# Vérifier s'il y a des changements
if git diff --cached --quiet; then
    echo -e "${YELLOW}ℹ️  Aucun changement à commiter${NC}"
    exit 0
fi

# Commit
echo -e "${YELLOW}💾 Commit des changements...${NC}"
git commit -m "$COMMIT_MSG"
echo -e "${GREEN}✅ Commit réalisé${NC}"

# Vérifier la configuration remote
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [[ -z "$REMOTE_URL" ]]; then
    echo -e "${RED}❌ Aucun remote configuré${NC}"
    echo -e "${YELLOW}📋 Configurez d'abord le remote avec:${NC}"
    echo "git remote add origin https://github.com/Aotenshiro2/academic-notes-extension.git"
    exit 1
fi

echo -e "${YELLOW}🌐 Remote configuré: ${NC}$REMOTE_URL"

# Push (avec gestion d'erreur d'authentification)
echo -e "${YELLOW}⬆️  Push vers GitHub...${NC}"
if git push origin main 2>/dev/null; then
    echo -e "${GREEN}✅ Push réussi vers GitHub!${NC}"
    echo -e "${GREEN}🎉 Déploiement automatique terminé${NC}"
    
    # Informations post-déploiement
    echo ""
    echo -e "${BLUE}📋 Informations post-déploiement:${NC}"
    echo "• Repository: https://github.com/Aotenshiro2/academic-notes-extension"
    echo "• Package Chrome: trading-notes-extension.zip"
    echo "• Politique de confidentialité: docs/privacy-policy.html"
    echo "• Prochaine étape: Activer GitHub Pages"
    
else
    echo -e "${RED}❌ Erreur de push - Authentification requise${NC}"
    echo ""
    echo -e "${YELLOW}🔑 Options d'authentification:${NC}"
    echo ""
    echo -e "${BLUE}Option 1 - Personal Access Token:${NC}"
    echo "1. GitHub → Settings → Developer settings → Personal access tokens"
    echo "2. Generate new token avec permission 'repo'"
    echo "3. git remote set-url origin https://VOTRE_TOKEN@github.com/Aotenshiro2/academic-notes-extension.git"
    echo ""
    echo -e "${BLUE}Option 2 - SSH (recommandé):${NC}"
    echo "1. ssh-keygen -t ed25519 -C 'brice.d@aoknowledge.com'"
    echo "2. Ajouter la clé publique à GitHub"
    echo "3. git remote set-url origin git@github.com:Aotenshiro2/academic-notes-extension.git"
    echo ""
    echo -e "${BLUE}Option 3 - GitHub CLI:${NC}"
    echo "1. sudo apt install gh"
    echo "2. gh auth login"
    echo "3. gh repo push"
    echo ""
    echo -e "${YELLOW}Puis relancez: ./scripts/auto-deploy.sh${NC}"
    exit 1
fi