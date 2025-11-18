import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectWorkspaceContext, buildPromptWithContext } from './context.ts';

function editor(fileName: string, content: string, selected?: string) {
  return {
    document: {
      fileName,
      getText(range?: any) {
        if (range) {
          return selected ?? '';
        }
        return content;
      }
    },
    selection: selected ? {} : undefined
  } as any;
}

test('collectWorkspaceContext summarizes files and selections', async () => {
  const editors = [
    editor('/foo.ts', 'one\ntwo\nthree', 'two'),
    editor('/bar.ts', 'alpha\nbeta')
  ];
  const ctx = await collectWorkspaceContext(editors);
  assert.match(ctx, /Filename: .*foo\.ts/);
  assert.match(ctx, /one/);
  assert.match(ctx, /Selected Text:\ntwo/);
  assert.match(ctx, /Filename: .*bar\.ts/);
});

test('buildPromptWithContext combines prompt and context', async () => {
  const editors = [editor('/baz.ts', 'content')];
  const prompt = await buildPromptWithContext('Say hi', editors);
  assert.match(prompt, /Say hi/);
  assert.match(prompt, /Context:/);
  assert.match(prompt, /content/);
});

test('collectWorkspaceContext truncates after 200 lines', async () => {
  const longContent = Array.from({ length: 210 }, (_, i) => `line${i + 1}`).join('\n');
  const editors = [editor('/long.ts', longContent)];
  const ctx = await collectWorkspaceContext(editors);
  assert.match(ctx, /line200/);
  assert.doesNotMatch(ctx, /line201/);
  assert.match(ctx, /\.\.\./);
});
