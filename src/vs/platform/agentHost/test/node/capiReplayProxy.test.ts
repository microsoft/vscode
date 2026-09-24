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
});
