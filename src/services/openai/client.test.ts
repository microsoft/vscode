import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendChat, OpenAIError } from './client.ts';
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

test('sendChat returns non-streaming response', async () => {
  const body = { choices: [{ message: { role: 'assistant', content: 'Hello' } }] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const res = await sendChat([{ role: 'user', content: 'Hi' }]);
  assert.equal(res.content, 'Hello');
  globalThis.fetch = originalFetch;
});

test('sendChat parses streaming responses', async () => {
  const lines = [
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
    'data: [DONE]\n'
  ];
  const stream = streamFromLines(lines);
  const response = new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response;
  let streamed = '';
  const res = await sendChat([{ role: 'user', content: 'Hi' }], t => streamed += t);
  assert.equal(res.content, 'Hello');
  assert.equal(streamed, 'Hello');
  globalThis.fetch = originalFetch;
});

test('sendChat normalizes errors', async () => {
  const body = { error: { message: 'Bad request' } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 400, headers: { 'content-type': 'application/json' } });
  await assert.rejects(() => sendChat([{ role: 'user', content: 'Hi' }]), (err: any) => err instanceof OpenAIError && err.status === 400 && err.message === 'Bad request');
  globalThis.fetch = originalFetch;
});

