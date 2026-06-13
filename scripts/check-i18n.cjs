/**
 * i18n hygiene: key parity between en/ru and keys never referenced from src.
 * Dynamic key prefixes (t(`recipe_${id}`) etc.) are matched by prefix.
 */
const fs = require('fs');
const path = require('path');

const en = require('../src/i18n/en.json');
const ru = require('../src/i18n/ru.json');
const enKeys = Object.keys(en);
const ruKeys = Object.keys(ru);

console.log('EN total:', enKeys.length, 'RU total:', ruKeys.length);
console.log('Only in EN:', enKeys.filter((k) => !(k in ru)));
console.log('Only in RU:', ruKeys.filter((k) => !(k in en)));

let src = '';
const walk = (dir) => {
  for (const file of fs.readdirSync(dir)) {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(file) && !p.includes('i18n')) src += fs.readFileSync(p, 'utf8');
  }
};
walk(path.join(__dirname, '..', 'src'));

// Dynamic prefixes used as t(`prefix${...}`) somewhere in the code
const dynamicPrefixes = [...src.matchAll(/t\(\s*`([A-Za-z0-9_]+)\$\{/g)].map((m) => m[1]);
console.log('Dynamic prefixes found:', [...new Set(dynamicPrefixes)].sort());

const unused = enKeys.filter((key) => {
  if (src.includes(`'${key}'`) || src.includes(`"${key}"`) || src.includes('`' + key + '`')) return false;
  return !dynamicPrefixes.some((prefix) => key.startsWith(prefix));
});
console.log(`Not referenced (${unused.length}):`);
console.log(unused.join('\n'));
