// Składa paczkę do wklejenia w edytorze Apps Script: dist/planer-<wersja>.zip (pliki z src/, płasko).
// Wersja paczki = najnowsza wersja z mapy PLANER_FILES w js-start (np. 2026-11-05g). Uruchom: npm run paczka
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), src = path.join(root, 'src'), dist = path.join(root, 'dist');
const start = fs.readFileSync(path.join(src, 'js-start.html'), 'utf8');
const versions = Object.values(JSON.parse(start.match(/const PLANER_FILES = (\{[^}]*\})/)[1].replace(/'/g, '"')));
const v = process.argv[2] || versions.sort().at(-1);
fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, `planer-${v}.zip`);
fs.rmSync(out, { force: true });
const files = fs.readdirSync(src).filter(n => n !== 'appsscript.json');
execFileSync('zip', ['-j', '-q', out, ...files.map(n => path.join(src, n))]);
console.log(`${out}  (${files.length} plików)`);
