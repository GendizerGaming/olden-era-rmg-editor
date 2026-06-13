/** Files in src/ never imported by any other src file (entry points excluded). */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(p);
  }
};
walk(root);

const all = files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
const entryPoints = new Set(['main.tsx', 'App.tsx', 'vite-env.d.ts']);

for (const { file } of all) {
  const base = path.basename(file).replace(/\.(ts|tsx)$/, '');
  if (entryPoints.has(path.basename(file))) continue;
  const imported = all.some(({ file: other, text }) =>
    other !== file && new RegExp(`from\\s+['"][^'"]*/${base}(\\.ts|\\.tsx)?['"]`).test(text));
  if (!imported) console.log(path.relative(root, file));
}
