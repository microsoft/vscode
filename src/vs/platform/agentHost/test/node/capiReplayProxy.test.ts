/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
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
