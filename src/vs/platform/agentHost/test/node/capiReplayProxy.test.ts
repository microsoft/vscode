/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { DeferredPromise, raceTimeout } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CapiReplayProxy } from './e2e/harness/capiReplayProxy.js';
import { aggregateAnthropicSse, anthropicMessageToSse } from './e2e/harness/capiWireCodec.js';

suite('CapiReplayProxy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('serves mutable managed settings locally in record and replay and resets between tests', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-policy-'));
		const fixturePath = join(directory, 'capture.yaml');
		const policy = { telemetry: { enabled: true, serviceName: 'policy-a' } };
		try {
			for (const mode of ['record', 'replay'] as const) {
				const proxy = new CapiReplayProxy({ fixturePath, mode });
				try {
					const url = await proxy.start();
					const readPolicy = async () => (await fetch(`${url}/copilot_internal/managed_settings`)).json();
					proxy.setManagedSettings(policy);
					const first = await readPolicy();
					proxy.setManagedSettings({ telemetry: { enabled: false } });
					const second = await readPolicy();
					assert.deepStrictEqual({ first, second, requests: proxy.managedSettingsRequestCount }, {
						first: policy,
						second: { telemetry: { enabled: false } },
						requests: 2,
					});
					if (mode === 'replay') {
						proxy.resetForReplay(fixturePath);
						assert.deepStrictEqual({ policy: await readPolicy(), requests: proxy.managedSettingsRequestCount }, { policy: {}, requests: 1 });
					}
				} finally {
					await proxy.stop();
				}
			}
			assert.ok(!readFileSync(fixturePath, 'utf8').includes('policy-a'), 'Managed settings must not enter model recordings');
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('records an exchange whose client left before its upstream finished, and aborts one that never finishes instead of writing a partial fixture', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-drain-'));
		// The upstream streams a first chunk at once; `/v1/messages` finishes later, `/responses` never does.
		const stalledClosed = new DeferredPromise<void>();
		const { createServer } = await import('http');
		const upstream = createServer((req: IncomingMessage, res: ServerResponse) => {
			req.resume();
			res.writeHead(200, { 'content-type': 'text/plain' });
			res.write('first ');
			if (req.url === '/responses') {
				res.once('close', () => stalledClosed.complete());
			} else {
				setTimeout(() => res.end('last'), 50);
			}
		});
		await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
		const upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
		/** Sends `path` through a recorder and leaves as soon as the response starts, then stops the recorder. */
		const record = async (path: string) => {
			const fixturePath = join(directory, `${path.replace(/\W/g, '')}.yaml`);
			const recorder = new CapiReplayProxy({ fixturePath, mode: 'record', upstreamUrl, recordingDrainTimeoutMs: 200 });
			const url = await recorder.start();
			const abort = new AbortController();
			const response = await fetch(`${url}${path}`, { method: 'POST', body: '{}', signal: abort.signal });
			await response.body?.getReader().read();
			abort.abort();
			let stopped: string;
			try {
				await recorder.stop();
				stopped = 'stopped';
			} catch (error) {
				stopped = error instanceof Error && error.message.includes('the recording is incomplete') ? 'incomplete' : String(error);
			}
			return { stopped, recorded: existsSync(fixturePath) ? readFileSync(fixturePath, 'utf8').includes('first last') : 'not written' };
		};
		try {
			assert.deepStrictEqual({ finished: await record('/v1/messages'), stalled: await record('/responses'), aborted: await raceTimeout(stalledClosed.p.then(() => true), 5_000) }, {
				finished: { stopped: 'stopped', recorded: true },
				stalled: { stopped: 'incomplete', recorded: 'not written' },
				aborted: true,
			});
		} finally {
			upstream.closeAllConnections();
			await new Promise<void>(resolve => upstream.close(() => resolve()));
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('preserves relative retry controls without recording unrelated response headers', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-retry-'));
		const fixturePath = join(directory, 'capture.yaml');
		const recorder = new CapiReplayProxy({ fixturePath, mode: 'record' });
		try {
			const url = await recorder.start();
			for (const retryAfter of ['0', 'Wed, 01 Jan 2025 00:00:00 GMT']) {
				recorder.setRecordingModelResponse({
					status: 429,
					headers: {
						'content-type': 'application/json',
						'x-should-retry': 'false',
						'retry-after': retryAfter,
						'set-cookie': 'private-cookie',
						'x-request-id': 'volatile-id',
					},
					body: '{"error":{"type":"rate_limit_error","message":"rate limited"}}',
				});
				await (await fetch(`${url}/v1/messages`, { method: 'POST', body: '{}' })).text();
			}
			await recorder.stop();
			const fixture = readFileSync(fixturePath, 'utf8');
			assert.ok(!fixture.includes('private-cookie') && !fixture.includes('volatile-id') && !fixture.includes('2025'));
			const replay = new CapiReplayProxy({ fixturePath, mode: 'replay' });
			try {
				const url = await replay.start();
				const results = [];
				for (let index = 0; index < 2; index++) {
					const response = await fetch(`${url}/v1/messages`, { method: 'POST', body: '{}' });
					results.push({
						status: response.status,
						retry: response.headers.get('x-should-retry'),
						delay: response.headers.get('retry-after'),
						body: await response.text(),
					});
				}
				assert.deepStrictEqual(results, [
					{ status: 429, retry: 'false', delay: '0', body: '{"error":{"type":"rate_limit_error","message":"rate limited"}}' },
					{ status: 429, retry: 'false', delay: null, body: '{"error":{"type":"rate_limit_error","message":"rate limited"}}' },
				]);
			} finally {
				await replay.stop();
			}
		} finally {
			await recorder.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('normalizes known tool-call references in permission-judge text without eliding content or wiring', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-permission-ids-'));
		const fixturePath = join(directory, 'capture.yaml');
		const recorder = new CapiReplayProxy({ fixturePath, mode: 'record' });
		const request = (text: string) => JSON.stringify({
			model: 'claude-sonnet-5',
			system: 'system',
			messages: [{ role: 'user', content: [{ type: 'text', text }] }],
		});
		const judgeText = (first: string, second: string, separator = '/') => {
			const fileDiff = JSON.stringify({
				fileName: `\${workdir}${separator}file`,
				diff: `\ndiff --git a\${workdir}${separator}file b\${workdir}${separator}file\ncreate file mode 100644\n+preserved-content\n`,
			}, null, 2);
			return [
				'Keep the authored question and opaque-first text.',
				JSON.stringify({ toolCallId: first, managedApprovalRequired: true }),
				JSON.stringify({ toolCallId: second }, null, 2),
				JSON.stringify({ toolCallId: 'authored-id' }),
				'```json', fileDiff, '```',
				'  ```json', fileDiff, '  ```',
				'Unfenced JSON:', fileDiff,
			].join('\n');
		};
		try {
			const url = await recorder.start();
			recorder.setRecordingModelResponse({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({
					content: [
						{ type: 'tool_use', id: 'opaque-first', name: 'view', input: { path: 'input.txt' } },
						{ type: 'tool_use', id: 'opaque-second', name: 'create', input: { path: 'output.txt' } },
					],
					stopReason: 'tool_use',
				}),
			});
			await (await fetch(`${url}/v1/messages`, { method: 'POST', body: request('Read and write') })).text();
			recorder.setRecordingModelResponse({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({ content: [{ type: 'text', text: 'ALLOW' }], stopReason: 'end_turn' }),
			});
			await (await fetch(`${url}/v1/messages`, { method: 'POST', body: request(judgeText('opaque-first', 'opaque-second')) })).text();
			await recorder.stop();

			const normalized = judgeText('toolcall_0', 'toolcall_1');
			const texts = [
				normalized,
				judgeText('toolcall_0', 'toolcall_1', '\\'),
				normalized.replaceAll('```', '  ```'),
				judgeText('toolcall_1', 'toolcall_0'),
				normalized.replace('authored question', 'different question'),
				normalized.replace('"managedApprovalRequired":true', '"managedApprovalRequired":false'),
				normalized.replace('authored-id', 'different-id'),
				normalized.replace('preserved-content', 'different-content'),
			];
			for (const [index, text] of texts.entries()) {
				const replay = new CapiReplayProxy({ fixturePath, mode: 'replay' });
				try {
					const replayUrl = await replay.start();
					for (const body of [request('Read and write'), request(text)]) {
						await (await fetch(`${replayUrl}/v1/messages`, { method: 'POST', body })).text();
					}
					if (index < 2) {
						replay.assertNoReplayMismatches();
					} else {
						assert.throws(() => replay.assertNoReplayMismatches(), /model request mismatch/);
					}
				} finally {
					await replay.close();
				}
			}
		} finally {
			await recorder.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('matches concurrent model requests to remaining responses by projection', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-request-matching-'));
		const fixturePath = join(directory, 'capture.yaml');
		const request = (text: string) => JSON.stringify({
			model: 'claude-sonnet-5',
			system: 'system',
			messages: [{ role: 'user', content: text }],
		});
		const response = (text: string) => ({
			status: 200,
			headers: { 'content-type': 'text/event-stream' },
			body: anthropicMessageToSse({ content: [{ type: 'text', text }], stopReason: 'end_turn' }),
		});
		const recorder = new CapiReplayProxy({ fixturePath, mode: 'record' });
		try {
			const url = await recorder.start();
			for (const [requestText, responseText] of [
				['parent request', 'parent response'],
				['child request', 'child response'],
			]) {
				recorder.setRecordingModelResponse(response(responseText));
				await (await fetch(`${url}/v1/messages`, { method: 'POST', body: request(requestText) })).text();
			}
			await recorder.stop();

			const replay = new CapiReplayProxy({
				fixturePath,
				mode: 'replay',
				matchModelRequestsByProjection: true,
			});
			try {
				const replayUrl = await replay.start();
				const responses: string[] = [];
				for (const requestText of ['child request', 'parent request']) {
					const replayed = aggregateAnthropicSse(await (await fetch(`${replayUrl}/v1/messages`, {
						method: 'POST',
						body: request(requestText),
					})).text());
					responses.push(replayed?.content.map(block => block.type === 'text' ? block.text : '').join('') ?? '');
				}
				replay.assertNoReplayMismatches();
				assert.deepStrictEqual(responses, ['child response', 'parent response']);
			} finally {
				await replay.stop();
			}
		} finally {
			await recorder.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	for (const observedFailure of ['none', 'cache miss', 'model request mismatch'] as const) {
		test(`expected-failure replay verification preserves observed failures: ${observedFailure}`, async () => {
			const directory = mkdtempSync(join(tmpdir(), 'capi-replay-expected-failure-'));
			const fixturePath = join(directory, 'capture.yaml');
			const request = (text: string) => JSON.stringify({
				model: 'claude-sonnet-5',
				system: 'system',
				messages: [{ role: 'user', content: text }],
			});
			const recorder = new CapiReplayProxy({ fixturePath, mode: 'record' });
			try {
				const url = await recorder.start();
				for (const text of ['first', 'second']) {
					recorder.setRecordingModelResponse({
						status: 200,
						headers: { 'content-type': 'text/event-stream' },
						body: anthropicMessageToSse({ content: [{ type: 'text', text: 'response' }], stopReason: 'end_turn' }),
					});
					await (await fetch(`${url}/v1/messages`, { method: 'POST', body: request(text) })).text();
				}
				await recorder.stop();

				const replay = new CapiReplayProxy({ fixturePath, mode: 'replay' });
				try {
					const replayUrl = await replay.start();
					const endpoint = observedFailure === 'cache miss' ? '/responses' : '/v1/messages';
					const text = observedFailure === 'model request mismatch' ? 'unexpected' : 'first';
					await (await fetch(`${replayUrl}${endpoint}`, { method: 'POST', body: request(text) })).text();
					assert.throws(() => replay.assertNoReplayMismatches(), /unconsumed recorded responses/);
					const verification = { allowUnconsumedResponses: true };
					if (observedFailure === 'none') {
						replay.assertNoReplayMismatches(verification);
						assert.throws(() => replay.assertNoReplayMismatches(), /unconsumed recorded responses/);
						await replay.stop(verification);
					} else {
						const expected = new RegExp(observedFailure);
						assert.throws(() => replay.assertNoReplayMismatches(verification), expected);
						await assert.rejects(replay.stop(verification), expected);
					}
				} finally {
					await replay.close();
				}
			} finally {
				await recorder.stop();
				rmSync(directory, { recursive: true, force: true });
			}
		});
	}

	test('preserves whitespace-only content without whitespace-only fixture lines', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-whitespace-'));
		const fixturePath = join(directory, 'capture.yaml');
		const text = 'first\n  \nsecond';
		const request = JSON.stringify({
			model: 'claude-sonnet-5',
			system: 'system',
			messages: [{ role: 'user', content: 'request' }],
		});
		const recorder = new CapiReplayProxy({ fixturePath, mode: 'record' });
		try {
			const url = await recorder.start();
			recorder.setRecordingModelResponse({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({ content: [{ type: 'text', text }], stopReason: 'end_turn' }),
			});
			await (await fetch(`${url}/v1/messages`, {
				method: 'POST',
				body: request,
			})).text();
			await recorder.stop();

			const whitespaceOnlyLines = readFileSync(fixturePath, 'utf8').split('\n').filter(line => /^[\t ]+$/.test(line));
			const replay = new CapiReplayProxy({ fixturePath, mode: 'replay' });
			try {
				const replayUrl = await replay.start();
				const replayed = aggregateAnthropicSse(await (await fetch(`${replayUrl}/v1/messages`, {
					method: 'POST',
					body: request,
				})).text());
				replay.assertNoReplayMismatches();
				assert.deepStrictEqual({
					whitespaceOnlyLines,
					content: replayed?.content,
				}, {
					whitespaceOnlyLines: [],
					content: [{ type: 'text', text }],
				});
			} finally {
				await replay.stop();
			}
		} finally {
			await recorder.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
