import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { db, checked } = await import('../src/lib/db');
const client = db(true);
if (!client) throw new Error('Database not configured');
const month = new Date().toISOString().slice(0, 7);
const buckets = await checked(
  client
    .from('usage_buckets')
    .select('key,count,expires_at')
    .or(`key.like.ufcalendar:%:${month},key.like.ai:%:${new Date().toISOString().slice(0, 10)}`),
);
const fighters = await client.from('fighters').select('id', { count: 'exact', head: true });
const chunks = await client
  .from('document_chunks')
  .select('id', { count: 'exact', head: true })
  .not('embedding', 'is', null);
console.log(
  JSON.stringify(
    {
      checked_at: new Date().toISOString(),
      buckets,
      fighter_count: fighters.count,
      embedded_chunks: chunks.count,
      limits: {
        ufcalendar: process.env.UFCALENDAR_MONTHLY_LOCAL_LIMIT || 80,
        aiRequests: process.env.AI_DAILY_REQUEST_LIMIT,
        aiTokens: process.env.AI_DAILY_TOKEN_LIMIT,
      },
    },
    null,
    2,
  ),
);
