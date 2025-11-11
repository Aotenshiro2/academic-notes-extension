// Script Node.js pour créer des icônes simples en SVG puis les convertir
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [16, 32, 48, 128];

// Fonction pour créer un SVG d'icône
function createIconSVG(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.15}" ry="${size * 0.15}" fill="url(#grad)" />
  <g transform="translate(${size * 0.25}, ${size * 0.25})" fill="white">
    <!-- Graduation cap -->
    <ellipse cx="${size * 0.25}" cy="${size * 0.3}" rx="${size * 0.2}" ry="${size * 0.075}" />
    <path d="M ${size * 0.05} ${size * 0.275} L ${size * 0.45} ${size * 0.275} L ${size * 0.25} ${size * 0.1} Z" />
    <!-- Tassel -->
    <line x1="${size * 0.375}" y1="${size * 0.175}" x2="${size * 0.425}" y2="${size * 0.35}" stroke="white" stroke-width="${size * 0.02}" />
    <circle cx="${size * 0.425}" cy="${size * 0.35}" r="${size * 0.015}" />
  </g>
</svg>`;
}

// Créer le dossier icons s'il n'existe pas
const iconsDir = path.join(__dirname, 'dist', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Créer les icônes SVG
sizes.forEach(size => {
  const svgContent = createIconSVG(size);
  const filename = `icon-${size}.svg`;
  fs.writeFileSync(path.join(iconsDir, filename), svgContent);
  console.log(`Créé: ${filename}`);
});

console.log('\n🎨 Icônes SVG créées dans dist/icons/');
console.log('💡 Pour les convertir en PNG, utilisez un outil comme ImageMagick ou un convertisseur en ligne.');
console.log('💡 Ou ouvrez scripts/create-icons.html dans votre navigateur pour générer des PNG directement.');