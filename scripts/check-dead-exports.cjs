/**
 * Rough dead-export finder: collects `export` names per file in src/ and
 * reports names never mentioned in any OTHER src/tests file. Heuristic —
 * same-name false negatives are possible, review before deleting.
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

const report = [];
for (const [file, text] of contents) {
  if (!file.includes(`${path.sep}src${path.sep}`)) continue;
  for (const match of text.matchAll(exportRe)) {
    const name = match[1];
    let used = false;
    for (const [other, otherText] of contents) {
      if (other === file) continue;
      if (new RegExp(`\\b${name}\\b`).test(otherText)) { used = true; break; }
    }
    if (!used) report.push(`${path.relative(path.join(__dirname, '..'), file)} :: ${name}`);
  }
}
console.log(`Unreferenced exports (${report.length}):`);
console.log(report.join('\n'));
