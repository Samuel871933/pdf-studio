// Génère les fichiers d'icônes à partir de @mdi/js (exécuté avant dev et build) :
//  - src/icons/curated.json : sélection classée, chargée à l'ouverture de la bibliothèque
//  - public/icons/mdi-<version>.json : bibliothèque complète, chargée seulement à la demande
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as mdi from '@mdi/js';
import { CATALOG } from './icon-catalog.mjs';

const root = new URL('..', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('node_modules/@mdi/js/package.json', root)));
const kebab = (k) => k.slice(3).replace(/(?!^)([A-Z])/g, '-$1').toLowerCase();

const all = {};
for (const [k, d] of Object.entries(mdi)) if (k.startsWith('mdi')) all[kebab(k)] = d;

const missing = [];
const paths = {};
const categories = CATALOG.map(({ id, label, icons }) => ({
  id,
  label,
  icons: icons
    .trim()
    .split('\n')
    .map((l) => l.trim().split('|'))
    .filter(([name]) => (all[name] ? true : (missing.push(name), false)))
    .map(([name, kw]) => ((paths[name] = all[name]), [name, kw ?? ''])),
}));

const fullFile = `mdi-${version}.json`;
mkdirSync(new URL('src/icons', root), { recursive: true });
mkdirSync(new URL('public/icons', root), { recursive: true });
writeFileSync(new URL('src/icons/curated.json', root), JSON.stringify({ version, fullFile, categories, paths }));
writeFileSync(new URL(`public/icons/${fullFile}`, root), JSON.stringify(all));
const count = Object.keys(paths).length;
console.log(`Icônes : ${count} sélectionnées, ${Object.keys(all).length} au total (MDI ${version}).`);
if (missing.length) console.warn(`Introuvables (ignorées) : ${missing.join(', ')}`);
