/**
 * Among exports unreferenced from other files, separate the FULLY dead
 * (not even used inside their own file) from the merely over-exported.
 */
const fs = require('fs');
const path = require('path');

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(p);
  }
};
walk(path.join(__dirname, '..', 'src'));
walk(path.join(__dirname, '..', 'tests'));

const contents = new Map(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const exportRe = /export\s+(?:const|function|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g;

const fullyDead = [];
const overExported = [];
for (const [file, text] of contents) {
  if (!file.includes(`${path.sep}src${path.sep}`)) continue;
  for (const match of text.matchAll(exportRe)) {
    const name = match[1];
    const external = [...contents].some(([other, otherText]) =>
      other !== file && new RegExp(`\\b${name}\\b`).test(otherText));
    if (external) continue;
    const ownMentions = (text.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
    const rel = `${path.relative(path.join(__dirname, '..'), file)} :: ${name}`;
    (ownMentions <= 1 ? fullyDead : overExported).push(rel);
  }
}
console.log(`FULLY DEAD (${fullyDead.length}):`);
console.log(fullyDead.join('\n'));
console.log(`\nOVER-EXPORTED, used internally (${overExported.length}):`);
console.log(overExported.join('\n'));
