import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const syncManifestVersion = {
  prepare(pluginConfig, context) {
    const { nextRelease, logger } = context;
    const manifestPath = resolve(__dirname, 'public/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.version = nextRelease.version;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    logger.log('Updated manifest.json version to %s', nextRelease.version);
  },
};

export default {
  branches: ['main'],
  ci: false,
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog', {
      changelogFile: 'CHANGELOG.md',
    }],
    ['@semantic-release/npm', {
      npmPublish: false,
    }],
    syncManifestVersion,
    ['@semantic-release/git', {
      assets: ['package.json', 'package-lock.json', 'public/manifest.json', 'CHANGELOG.md'],
      message: 'chore(release): ${nextRelease.version}\n\n${nextRelease.notes}',
    }],
  ],
};
