import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendChat } from '../src/services/openai/client.ts';
import { ReadableStream } from 'node:stream/web';

const encoder = new TextEncoder();
function streamFromLines(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    }
  });
}

test('sendChat logs usage and timing when DEBUG_CHAT=1', async () => {
  process.env.DEBUG_CHAT = '1';
  const lines = [
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
    'data: {"usage":{"prompt_tokens":5,"completion_tokens":5,"total_tokens":10}}\n',
    'data: [DONE]\n'
  ];
  const stream = streamFromLines(lines);
  const response = new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response as any;
  const logs: string[] = [];
  const originalDebug = console.debug;
  console.debug = (...args: any[]) => { logs.push(args.join(' ')); };
  const res = await sendChat([{ role: 'user', content: 'Hi' }]);
  console.debug = originalDebug;
  globalThis.fetch = originalFetch;
  assert.equal(res.content, 'Hello');
  assert(logs.some(l => l.includes('tokens')));
  assert(logs.some(l => l.includes('duration')));
  delete process.env.DEBUG_CHAT;
});
