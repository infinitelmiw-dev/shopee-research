import { readFile, readdir } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
const allowed = ['.nojekyll', 'app.js', 'calculator.js', 'index.html', 'style.css'];
const names = (await readdir(output)).sort();
if (JSON.stringify(names) !== JSON.stringify(allowed)) throw new Error('Unexpected Pages payload files');
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['API key', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['credential URL', /https?:\/\/[^\s/:"']+:[^\s/@"']+@/],
  ['hardcoded credential', /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][^"'\s]{8,}["']/i],
];
let failed = false;
for (const name of names) {
  const text = await readFile(new URL(name, output), 'utf8');
  for (const [kind, pattern] of patterns) {
    if (pattern.test(text)) { console.error(`Potential ${kind} in ${name}; inspect locally (value hidden).`); failed = true; }
  }
}
if (failed) process.exitCode = 1;
else console.log('PASS: Pages payload allowlist and credential-pattern scan (no matches).');
