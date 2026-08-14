/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildRouterMessages, heuristicScore, isHighConfidenceSessionRoute, ISessionRouteRequest, parseRouterResponse, ROUTER_FIELD_CLIP_LENGTH } from '../../common/sessionRouter.js';

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
		assert.ok(messages[0].content.includes('whether it warrants a new session'));
		assert.ok(messages[0].content.includes('prefer a new session for a distinct task'));
	});

	test('buildRouterMessages embeds enriched conversation content', () => {
		const messages = buildRouterMessages({
			utterance: 'ship it',
			sessions: [{
				sessionId: 's1',
				label: 'voice narration',
				description: 'Adds dictation onboarding',
				firstRequest: 'add a voice onboarding dialog',
				lastRequest: 'tweak the countdown copy',
				lastResponse: 'Updated the countdown to read "sending in Ns".'
			}]
		});
		const user = messages[1].content;
		assert.ok(user.includes('summary='));
		assert.ok(user.includes('firstRequest='));
		assert.ok(user.includes('lastRequest='));
		assert.ok(user.includes('lastResponse='));
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
		assert.strictEqual(parseRouterResponse('[{"sessionId":"s1","confidence":"high"}]', new Set(['s1'])), undefined);
	});

	test('parseRouterResponse skips malformed confidences in an otherwise valid response', () => {
		assert.deepStrictEqual(
			parseRouterResponse('[{"sessionId":"s1"},{"sessionId":"s2","confidence":0.7}]', new Set(['s1', 's2'])),
			[{ sessionId: 's2', confidence: 0.7, reason: undefined }],
		);
	});

	test('high-confidence routes must exceed 80 percent', () => {
		assert.deepStrictEqual([
			isHighConfidenceSessionRoute({ sessionId: 'below', confidence: 0.79 }),
			isHighConfidenceSessionRoute({ sessionId: 'boundary', confidence: 0.8 }),
			isHighConfidenceSessionRoute({ sessionId: 'above', confidence: 0.81 }),
		], [false, false, true]);
	});

	test('heuristicScore ranks the token-overlapping session first', () => {
		const ranked = heuristicScore(request);
		assert.strictEqual(ranked[0].sessionId, 's1');
		assert.ok(ranked[0].confidence > ranked[1].confidence);
	});

	test('heuristicScore matches on enriched content, not just the label', () => {
		const ranked = heuristicScore({
			utterance: 'update the authentication token refresh logic',
			sessions: [
				{ sessionId: 's1', label: 'session one', lastRequest: 'fix the authentication token refresh logic' },
				{ sessionId: 's2', label: 'session two', lastRequest: 'restyle the settings page' }
			]
		});
		assert.strictEqual(ranked[0].sessionId, 's1');
		assert.ok(ranked[0].confidence > ranked[1].confidence);
	});

	test('heuristicScore ignores generic shared words', () => {
		const ranked = heuristicScore({
			utterance: 'work on this with the agent',
			sessions: [{ sessionId: 's1', label: 'the agent for this work' }]
		});
		assert.strictEqual(ranked[0].confidence, 0);
	});

	test('buildRouterMessages clips overlong content fields', () => {
		const longResponse = 'x '.repeat(400);
		const user = buildRouterMessages({
			utterance: 'hi',
			sessions: [{ sessionId: 's1', label: 'l', lastResponse: longResponse }]
		})[1].content;
		const match = /lastResponse=("(?:[^"\\]|\\.)*")/.exec(user);
		assert.ok(match, 'expected a lastResponse field');
		const value: string = JSON.parse(match![1]);
		assert.ok(value.length <= ROUTER_FIELD_CLIP_LENGTH + 3, `expected clipped, got length ${value.length}`);
		assert.ok(value.endsWith('...'));
	});
});
