import nextEnv from '@next/env';
import { execFileSync } from 'node:child_process';

nextEnv.loadEnvConfig(process.cwd());
const secrets = Object.entries(process.env)
  .filter(([key, value]) => /KEY|TOKEN|PASSWORD/.test(key) && value && value.length >= 12)
  .map(([, value]) => value);
const paths = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
let failures = 0;
for (const file of paths) {
  if (/(^|\/)\.env(?:\.|$)/.test(file) && file !== '.env.example') {
    console.error('Forbidden environment file staged:', file);
    failures++;
    continue;
  }
  let contents;
  try {
    contents = execFileSync('git', ['show', `:${file}`], { maxBuffer: 30 * 1024 * 1024 });
  } catch {
    continue;
  } // Deleted files have no staged blob.
  if (secrets.some((value) => contents.includes(Buffer.from(value)))) {
    console.error('Configured secret detected in staged file; value withheld:', file);
    failures++;
  }
}
if (failures) process.exitCode = 1;
else
  console.log(
    `PASS: ${paths.length} staged files checked; no configured secrets or private environment files staged.`,
  );
