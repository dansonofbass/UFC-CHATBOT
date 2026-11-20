import { expect, it } from 'vitest';
import { groundedCitations } from '../src/lib/citation-guard';
it('keeps supplied URLs and removes invented URLs and line references across stream boundaries', async () => {
  async function* parts() {
    yield 'Fact [source](https://good.';
    yield 'test) and [invented](https://bad.test).【1†L9】\n';
    yield 'https://bad.test\n';
  }
  let output = '';
  for await (const text of groundedCitations(parts(), ['https://good.test'])) output += text;
  expect(output).toContain('[source](https://good.test)');
  expect(output).not.toContain('https://bad');
  expect(output).not.toContain('L9');
});
it('withholds new numerical claims while retaining source-backed values', async () => {
  async function* parts() {
    yield 'Accuracy: 58%.\nElite strikers exceed 65%.\n';
  }
  let text = '';
  for await (const chunk of groundedCitations(parts(), [], 'verified accuracy 58%')) text += chunk;
  expect(text).toContain('58%');
  expect(text).not.toContain('65%');
});
