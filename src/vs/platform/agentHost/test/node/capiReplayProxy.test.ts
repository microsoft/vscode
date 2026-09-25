/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CapiReplayProxy } from './e2e/harness/capiReplayProxy.js';
import { aggregateAnthropicSse, anthropicMessageToSse } from './e2e/harness/capiWireCodec.js';

suite('CapiReplayProxy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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
