import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitPrompt, loadHistory } from './session.ts';
import type { ChatMessage } from '../openai/client.ts';

test('submitPrompt builds context, streams, and persists', async () => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; }
  };

  let builtPrompt = '';
  const build = async (prompt: string) => {
    builtPrompt = prompt;
    return 'CTX:' + prompt;
  };

  const sent: ChatMessage[][] = [];
  const send = async (msgs: ChatMessage[], onToken?: (t: string) => void) => {
    sent.push(msgs);
    onToken?.('a');
    onToken?.('b');
    return { role: 'assistant', content: 'ab' } as ChatMessage;
  };

  let tokens = '';
  const res = await submitPrompt('hi', { build, send, onToken: t => tokens += t });

  assert.equal(builtPrompt, 'hi');
  assert.equal(tokens, 'ab');
  assert.equal(res.content, 'ab');
  assert.equal(sent[0][sent[0].length - 1].content, 'CTX:hi');

  const history = loadHistory();
  assert.deepEqual(history, [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'ab' }
  ]);
});
