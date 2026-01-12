#!/bin/bash

# Setup GitHub Authentication pour Claude Auto-Deploy
# Ce script configure l'authentification pour permettre les push automatiques

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔐 Configuration GitHub Authentication${NC}"
echo "======================================="

echo -e "${YELLOW}Choisissez une méthode d'authentification:${NC}"
echo "1) Personal Access Token (Recommandé)"
echo "2) SSH Key"
echo "3) GitHub CLI"
echo ""

read -p "Votre choix (1-3): " choice

case $choice in
    1)
        echo -e "${BLUE}📋 Configuration Personal Access Token${NC}"
        echo ""
        echo "Étapes à suivre:"
        echo "1. Allez sur: https://github.com/settings/tokens"
        echo "2. 'Generate new token (classic)'"
        echo "3. Scopes à cocher: 'repo' (full control)"
        echo "4. Copiez le token généré"
        echo ""
        
        read -p "Collez votre token ici (sera caché): " -s token
        echo ""
        
        if [[ -n "$token" ]]; then
            # Configurer le remote avec token
            git remote set-url origin "https://${token}@github.com/Aotenshiro2/academic-notes-extension.git"
            echo -e "${GREEN}✅ Token configuré avec succès${NC}"
            
            # Test de connexion
            echo -e "${YELLOW}🧪 Test de connexion...${NC}"
            if git ls-remote origin > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Connexion GitHub réussie!${NC}"
                echo -e "${GREEN}🎉 Authentification configurée - Claude peut maintenant push automatiquement${NC}"
            else
                echo -e "${RED}❌ Erreur de connexion - Vérifiez votre token${NC}"
            fi
        else
            echo -e "${RED}❌ Token vide - Configuration annulée${NC}"
        fi
        ;;
    
    2)
        echo -e "${BLUE}🔑 Configuration SSH Key${NC}"
        echo ""
        echo "Génération d'une nouvelle clé SSH..."
        
        # Générer clé SSH
        ssh-keygen -t ed25519 -C "brice.d@aoknowledge.com" -f ~/.ssh/aoknowledge_github -N ""
        
        echo -e "${GREEN}✅ Clé SSH générée${NC}"
        echo ""
        echo -e "${YELLOW}📋 Ajoutez cette clé publique à votre GitHub:${NC}"
        echo "1. Allez sur: https://github.com/settings/ssh/new"
        echo "2. Copiez cette clé publique:"
        echo ""
        cat ~/.ssh/aoknowledge_github.pub
        echo ""
        echo "3. Collez-la dans GitHub et sauvegardez"
        echo ""
        
        read -p "Appuyez sur Entrée quand c'est fait..."
        
        # Configurer SSH config
        echo "
# GitHub AOKnowledge
Host github-aok
    HostName github.com
    User git
    IdentityFile ~/.ssh/aoknowledge_github
" >> ~/.ssh/config
        
        # Configurer le remote SSH
        git remote set-url origin git@github-aok:Aotenshiro2/academic-notes-extension.git
        
        # Test SSH
        echo -e "${YELLOW}🧪 Test de connexion SSH...${NC}"
        if ssh -T git@github-aok 2>&1 | grep -q "successfully authenticated"; then
            echo -e "${GREEN}✅ SSH configuré avec succès!${NC}"
            echo -e "${GREEN}🎉 Authentification SSH prête${NC}"
        else
            echo -e "${YELLOW}⚠️  Test SSH - Vérifiez la configuration manuelle${NC}"
        fi
        ;;
        
    3)
        echo -e "${BLUE}🔧 Installation GitHub CLI${NC}"
        
        # Installation GitHub CLI
        if ! command -v gh &> /dev/null; then
            echo "Installation de GitHub CLI..."
            curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
            sudo apt update
            sudo apt install gh -y
        fi
        
        echo -e "${YELLOW}🔐 Authentification GitHub CLI...${NC}"
        gh auth login
        
        if gh auth status &> /dev/null; then
            echo -e "${GREEN}✅ GitHub CLI configuré avec succès!${NC}"
            echo -e "${GREEN}🎉 Vous pouvez maintenant utiliser 'gh repo push'${NC}"
        else
            echo -e "${RED}❌ Erreur configuration GitHub CLI${NC}"
        fi
        ;;
        
    *)
        echo -e "${RED}❌ Choix invalide${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}🎯 Configuration terminée!${NC}"
echo -e "${YELLOW}Testez maintenant avec: ./scripts/auto-deploy.sh${NC}"