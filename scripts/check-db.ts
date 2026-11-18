import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { db } = await import('../src/lib/db');
const publicClient = db(),
  admin = db(true);
if (!publicClient || !admin) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY',
  );
  process.exitCode = 1;
} else {
  const read = await publicClient.from('fighters').select('id').limit(1);
  if (read.error) throw new Error('Public read failed');
  // Disposable write attempt with no valid fighter FK, and a separate private-table read.
  const write = await publicClient.from('fighters').insert({
    id: -987654321,
    slug: 'rls-probe',
    name: 'RLS probe',
    search_name: 'rls probe',
    payload: {},
    source_url: 'https://example.invalid',
  });
  if (!write.error) {
    await admin.from('fighters').delete().eq('id', -987654321);
    throw new Error('RLS FAILURE: anonymous insert succeeded');
  }
  const hidden = await publicClient.from('provider_usage').select('*').limit(1);
  if (!hidden.error && hidden.data?.length) throw new Error('RLS FAILURE: private usage exposed');
  const rpc = await publicClient.rpc('consume_budget', {
    bucket: 'rls-probe',
    amount: 1,
    ceiling: 1,
    expiry: new Date().toISOString(),
  });
  if (!rpc.error) throw new Error('RLS FAILURE: anonymous budget access');
  console.log(
    'Live public read, anonymous write denial, private usage isolation and privileged RPC denial passed.',
  );
}
