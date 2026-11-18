import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { UFCalendar } = await import('../src/lib/ufcalendar');
const client = new UFCalendar();
const requested = process.argv.find((a) => a.startsWith('--slot='));
if (!client.status().length) {
  console.error('Missing UFCALENDAR_API_KEY_1 (or _2 / _3)');
  process.exitCode = 1;
} else {
  for (const c of client.status()) {
    if (requested && c.slot !== Number(requested.split('=')[1])) continue;
    console.log(await client.test(c.slot));
  }
}
