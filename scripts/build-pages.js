import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const publicFiles = ['index.html', 'style.css', 'calculator.js', 'app.js'];
const root = new URL('../', import.meta.url);
const output = new URL('../dist/', import.meta.url);
await mkdir(output, { recursive: true });
// dist is generated exclusively by this script; fail rather than delete unknown files.
const allowed = new Set([...publicFiles, '.nojekyll']);
for (const name of await readdir(output)) {
  if (!allowed.has(name)) throw new Error(`Unexpected file in dist: ${name}. Review it before rebuilding.`);
  await rm(new URL(join('../dist', name), import.meta.url));
}
for (const name of publicFiles) await writeFile(new URL(name, output), await readFile(new URL(name, root)));
await writeFile(new URL('.nojekyll', output), '');
console.log(`Pages build: ${[...publicFiles, '.nojekyll'].join(', ')}`);
