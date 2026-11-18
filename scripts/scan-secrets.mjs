import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const skip = new Set([
  '.git',
  '.next',
  'node_modules',
  '.npm-cache',
  '.playwright-browsers',
  '.model-cache',
  'test-results',
  'playwright-report',
]);
const patterns = [
  /\b(?:gsk_|sk-or-v1-)[A-Za-z0-9_-]{20,}/,
  /\b(?:sb_secret_|ufcalendar_)[A-Za-z0-9_-]{24,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
let failures = 0;
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) {
      await walk(file);
      continue;
    }
    if (item.name.startsWith('.env') && item.name !== '.env.example') {
      console.error('Uncommittable environment file exists (ignored):', file);
      continue;
    }
    if (!/\.(?:[cm]?[jt]sx?|json|md|sql|ya?ml|example)$/.test(item.name)) continue;
    const body = await readFile(file, 'utf8');
    if (patterns.some((p) => p.test(body))) {
      console.error('Potential secret detected; value withheld:', file);
      failures++;
    }
  }
}
await walk('.');
if (failures) process.exitCode = 1;
else
  console.log(
    'No known secret patterns detected in project source. This heuristic scan does not replace review.',
  );
