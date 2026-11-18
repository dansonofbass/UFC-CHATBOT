import nextEnv from '@next/env';
import { Client } from 'pg';
import { lookup } from 'node:dns/promises';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

nextEnv.loadEnvConfig(process.cwd());
const password = process.env.SUPABASE_DB_PASSWORD;
const host = process.env.SUPABASE_DB_HOST;
if (!password || !host || !/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)) {
  throw new Error(
    'Set SUPABASE_DB_PASSWORD and the verified SUPABASE_DB_HOST in the process environment',
  );
}
const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
const certificate = await fetch(
  'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',
  { signal: AbortSignal.timeout(12000) },
);
if (!certificate.ok) throw new Error('Supabase certificate download failed');
let ip: string;
try {
  ip = (await lookup(host, { family: 4 })).address;
} catch {
  const response = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`,
    { signal: AbortSignal.timeout(12000) },
  );
  const data = await response.json();
  ip = data.Answer?.find((answer: { type: number; data: string }) => answer.type === 1)?.data;
  if (!ip) throw new Error('Pooler DNS resolution failed');
}
const client = new Client({
  host: ip,
  port: 5432,
  database: 'postgres',
  user: `postgres.${project}`,
  password,
  ssl: { ca: await certificate.text(), rejectUnauthorized: true, servername: host },
  connectionTimeoutMillis: 12000,
});
try {
  await client.connect();
  await client.query("select pg_advisory_lock(hashtext('octagon-schema-migrations'))");
  const existing = await client.query("select tablename from pg_tables where schemaname='public'");
  const hasLedger = existing.rows.some((row) => row.tablename === 'app_migrations');
  if (!hasLedger && existing.rows.length)
    throw new Error('Existing public tables require migration-baseline review; no changes applied');
  await client.query(
    'create table if not exists public.app_migrations(name text primary key, checksum text not null, applied_at timestamptz not null default now()); alter table public.app_migrations enable row level security; revoke all on public.app_migrations from anon,authenticated;',
  );
  for (const name of (await readdir('supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const original = await readFile(`supabase/migrations/${name}`, 'utf8');
    // Migration identity must survive Git's Windows/Linux line-ending conversion.
    const checksum = createHash('sha256').update(original.replace(/\r\n/g, '\n')).digest('hex');
    const found = await client.query('select checksum from public.app_migrations where name=$1', [
      name,
    ]);
    if (found.rowCount) {
      if (found.rows[0].checksum !== checksum) {
        const legacyChecksum = createHash('sha256').update(original).digest('hex');
        if (found.rows[0].checksum !== legacyChecksum)
          throw new Error(`Migration checksum differs: ${name}`);
        await client.query('update public.app_migrations set checksum=$1 where name=$2', [
          checksum,
          name,
        ]);
      }
      console.log(`Already applied: ${name}`);
      continue;
    }
    const sql = original.replace(/^\s*begin;/i, '').replace(/commit;\s*$/i, '');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into public.app_migrations(name,checksum) values($1,$2)', [
        name,
        checksum,
      ]);
      await client.query('commit');
      console.log(`Applied: ${name}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
  await client.query("notify pgrst, 'reload schema'");
  console.log(
    'Migrations complete; schema reload requested. TLS certificate and hostname verified.',
  );
} catch (error) {
  console.error(
    'Migration failed:',
    error instanceof Error ? error.message.replaceAll(password, '[REDACTED]') : 'Unknown error',
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
