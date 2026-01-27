#!/bin/bash

# Build & Package script pour Trading Notes Extension
# Usage: ./scripts/auto-deploy.sh
#
# Auto-patch: bumpe la version (patch), build, zip, commit, tag, push.
# Pour une release controlee (minor/major) : npm run release

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Auto-Deploy - Trading Notes Extension${NC}"
echo "=================================================="

if [[ ! -f "package.json" ]] || [[ ! -f "public/manifest.json" ]]; then
    echo -e "${RED}Erreur: Ce script doit etre execute depuis la racine du projet${NC}"
    exit 1
fi

OLD_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Version actuelle: ${NC}${OLD_VERSION}"

# Bump patch version dans package.json (sans git tag automatique)
echo -e "${YELLOW}Bump version patch...${NC}"
npm version patch --no-git-tag-version > /dev/null
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}Nouvelle version: ${NEW_VERSION}${NC}"

# Sync manifest.json
echo -e "${YELLOW}Sync manifest.json...${NC}"
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
manifest.version = '${NEW_VERSION}';
fs.writeFileSync('public/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
"
echo -e "${GREEN}manifest.json mis a jour${NC}"

# Build
echo -e "${YELLOW}Build de l'extension...${NC}"
if npm run build; then
    echo -e "${GREEN}Build reussi${NC}"
else
    echo -e "${RED}Erreur de build${NC}"
    exit 1
fi

# Package Chrome Web Store
echo -e "${YELLOW}Creation du package Chrome Web Store...${NC}"
if python3 create-package.py "${NEW_VERSION}"; then
    echo -e "${GREEN}Package cree: trading-notes-extension-v${NEW_VERSION}.zip${NC}"
else
    echo -e "${RED}Erreur creation package${NC}"
    exit 1
fi

# Git commit + tag + push
echo -e "${YELLOW}Commit et tag v${NEW_VERSION}...${NC}"
git add package.json package-lock.json public/manifest.json
git commit -m "chore(deploy): v${NEW_VERSION}" --no-verify
git tag "v${NEW_VERSION}"
echo -e "${GREEN}Tag v${NEW_VERSION} cree${NC}"

# Push
echo -e "${YELLOW}Push vers origin...${NC}"
if git push origin main --tags; then
    echo -e "${GREEN}Push reussi${NC}"
else
    echo -e "${RED}Erreur de push (verifier l'authentification git)${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Deploy termine - v${NEW_VERSION}${NC}"
echo ""
echo -e "${BLUE}Prochaine etape:${NC}"
echo "  Uploader trading-notes-extension-v${NEW_VERSION}.zip sur le Chrome Web Store"
