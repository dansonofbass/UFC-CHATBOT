import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { essentialKnowledge, knowledgeVersion } = await import('../src/lib/knowledge');
const { indexDocument } = await import('../src/lib/ingestion');
const { db, checked } = await import('../src/lib/db');
const dry = process.argv.includes('--dry-run');
for (const doc of essentialKnowledge) {
  if (!dry) await indexDocument({ ...doc, id: `essential:${doc.id}` });
  console.log(
    JSON.stringify({ id: doc.id, version: knowledgeVersion, status: dry ? 'dry-run' : 'written' }),
  );
}
if (!dry) {
  const rows = await checked(
    db(true)!
      .from('knowledge_documents')
      .select('id')
      .in(
        'id',
        essentialKnowledge.map((d) => `essential:${d.id}`),
      ),
  );
  if (rows.length !== essentialKnowledge.length)
    throw new Error('Knowledge write verification failed');
  console.log(`Verified ${rows.length} educational documents in database.`);
}
