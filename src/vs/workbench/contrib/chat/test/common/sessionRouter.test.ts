/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildRouterMessages, heuristicScore, ISessionRouteRequest, parseRouterResponse } from '../../common/sessionRouter.js';

suite('SessionRouter helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const request: ISessionRouteRequest = {
		utterance: 'fix the flaky voice reconnect test',
		sessions: [
			{ sessionId: 's1', label: 'voice narration', repo: 'meganrogge/momentum-map', status: 'idle' },
			{ sessionId: 's2', label: 'docs cleanup', repo: 'microsoft/vscode-docs' }
		]
	};

	test('buildRouterMessages embeds utterance and every session id', () => {
		const messages = buildRouterMessages(request);
		assert.strictEqual(messages.length, 2);
		assert.strictEqual(messages[0].role, 'system');
		assert.strictEqual(messages[1].role, 'user');
		assert.ok(messages[1].content.includes('fix the flaky voice reconnect test'));
		assert.ok(messages[1].content.includes('id=s1'));
		assert.ok(messages[1].content.includes('id=s2'));
	});

	test('parseRouterResponse extracts, clamps, filters and sorts', () => {
		const raw = '```json\n[{"sessionId":"s2","confidence":0.2},{"sessionId":"s1","confidence":1.7,"reason":"voice"},{"sessionId":"ghost","confidence":0.9}]\n```';
		const result = parseRouterResponse(raw, new Set(['s1', 's2']));
		assert.deepStrictEqual(result, [
			{ sessionId: 's1', confidence: 1, reason: 'voice' },
			{ sessionId: 's2', confidence: 0.2, reason: undefined }
		]);
	});

	test('parseRouterResponse returns undefined when nothing usable', () => {
		assert.strictEqual(parseRouterResponse('no json here', new Set(['s1'])), undefined);
		assert.strictEqual(parseRouterResponse('[{"sessionId":"unknown","confidence":0.5}]', new Set(['s1'])), undefined);
	});

	test('heuristicScore ranks the token-overlapping session first', () => {
		const ranked = heuristicScore(request);
		assert.strictEqual(ranked[0].sessionId, 's1');
		assert.ok(ranked[0].confidence > ranked[1].confidence);
	});
});
