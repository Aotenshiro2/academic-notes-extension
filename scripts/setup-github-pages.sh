#!/bin/bash

# Script pour activer GitHub Pages automatiquement
# Usage: ./scripts/setup-github-pages.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}📄 Configuration GitHub Pages${NC}"
echo "============================="

REPO_OWNER="Aotenshiro2"
REPO_NAME="academic-notes-extension"

echo -e "${YELLOW}🔍 Vérification de l'authentification GitHub...${NC}"

# Vérifier si gh CLI est installé et authentifié
if command -v gh &> /dev/null && gh auth status &> /dev/null; then
    echo -e "${GREEN}✅ GitHub CLI authentifié${NC}"
    
    echo -e "${YELLOW}📁 Création du dossier docs s'il n'existe pas...${NC}"
    mkdir -p docs
    
    # Copier la politique de confidentialité si elle n'existe pas dans docs/
    if [[ ! -f "docs/privacy-policy.html" ]] && [[ -f "privacy-policy.html" ]]; then
        cp privacy-policy.html docs/privacy-policy.html
        echo -e "${GREEN}✅ Politique de confidentialité copiée dans docs/${NC}"
    fi
    
    # Vérifier si GitHub Pages est déjà activé
    echo -e "${YELLOW}🔍 Vérification du statut GitHub Pages...${NC}"
    
    if gh api repos/$REPO_OWNER/$REPO_NAME/pages 2>/dev/null | grep -q "html_url"; then
        echo -e "${GREEN}✅ GitHub Pages déjà activé${NC}"
        
        # Récupérer l'URL
        PAGES_URL=$(gh api repos/$REPO_OWNER/$REPO_NAME/pages --jq '.html_url')
        echo -e "${BLUE}🌐 URL: ${PAGES_URL}${NC}"
        echo -e "${BLUE}📋 URL Politique: ${PAGES_URL}privacy-policy.html${NC}"
        
    else
        echo -e "${YELLOW}⚙️  Activation de GitHub Pages...${NC}"
        
        # Activer GitHub Pages avec le dossier docs
        gh api --method POST repos/$REPO_OWNER/$REPO_NAME/pages \
            --field source.branch=main \
            --field source.path="/docs" 2>/dev/null || {
            
            echo -e "${YELLOW}🔄 Tentative avec configuration alternative...${NC}"
            
            # Alternative: utiliser la racine si docs échoue
            gh api --method POST repos/$REPO_OWNER/$REPO_NAME/pages \
                --field source.branch=main \
                --field source.path="/" 2>/dev/null || {
                
                echo -e "${RED}❌ Échec activation automatique${NC}"
                echo -e "${YELLOW}📋 Configuration manuelle requise:${NC}"
                echo "1. Allez sur: https://github.com/$REPO_OWNER/$REPO_NAME/settings/pages"
                echo "2. Source: 'Deploy from a branch'"
                echo "3. Branch: 'main'"
                echo "4. Folder: '/docs' (ou '/ (root)' si docs n'existe pas)"
                echo "5. Save"
                exit 1
            }
        }
        
        echo -e "${GREEN}✅ GitHub Pages activé!${NC}"
        
        # Attendre un peu et récupérer l'URL
        echo -e "${YELLOW}⏳ Récupération de l'URL (peut prendre quelques secondes)...${NC}"
        sleep 5
        
        for i in {1..6}; do
            if PAGES_URL=$(gh api repos/$REPO_OWNER/$REPO_NAME/pages --jq '.html_url' 2>/dev/null); then
                echo -e "${GREEN}✅ URL GitHub Pages: ${PAGES_URL}${NC}"
                echo -e "${BLUE}📋 URL Politique de confidentialité: ${PAGES_URL}privacy-policy.html${NC}"
                break
            else
                echo -e "${YELLOW}⏳ Attente activation... (${i}/6)${NC}"
                sleep 10
            fi
        done
    fi
    
    echo ""
    echo -e "${GREEN}🎉 Configuration GitHub Pages terminée!${NC}"
    echo ""
    echo -e "${BLUE}📋 Pour Chrome Web Store, utilisez cette URL:${NC}"
    echo -e "${GREEN}https://$REPO_OWNER.github.io/$REPO_NAME/privacy-policy.html${NC}"
    
else
    echo -e "${RED}❌ GitHub CLI non authentifié${NC}"
    echo -e "${YELLOW}🔧 Lancez d'abord: ./scripts/setup-github-auth.sh${NC}"
    echo ""
    echo -e "${YELLOW}📋 Ou configuration manuelle:${NC}"
    echo "1. https://github.com/$REPO_OWNER/$REPO_NAME/settings/pages"
    echo "2. Source: 'Deploy from a branch'"
    echo "3. Branch: 'main', Folder: '/docs'"
    echo "4. URL finale: https://$REPO_OWNER.github.io/$REPO_NAME/privacy-policy.html"
fi