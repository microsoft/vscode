/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { URI } from '../../../../../../util/vs/base/common/uri';
import { IBuildPromptContext } from '../../../../../prompt/common/intents';
import { BackOffTracker, getSessionResource } from '../backgroundTodoAgentProcessor';

describe('BackOffTracker', () => {

	test('grows the wait by one step per pass and per noop, caps at max, and resets', () => {
		const tracker = new BackOffTracker(3, 2, 9);
		const log: Array<{ op: string; threshold: number; isBackedOff: boolean }> = [];
		const record = (op: string) => log.push({ op, threshold: tracker.threshold, isBackedOff: tracker.isBackedOff });

		record('initial');
		tracker.recordPass();
		record('afterPass');
		tracker.recordNoop();
		record('afterNoop');
		tracker.clearNoops();
		record('afterClearNoops');
		tracker.recordPass();
		tracker.recordPass();
		tracker.recordPass();
		record('afterThreeMorePasses');
		tracker.reset();
		record('afterReset');

		expect(log).toEqual([
			{ op: 'initial', threshold: 3, isBackedOff: false },
			// +1 pass -> 3 + 1*2
			{ op: 'afterPass', threshold: 5, isBackedOff: true },
			// +1 noop on top of the pass -> 3 + (1+1)*2
			{ op: 'afterNoop', threshold: 7, isBackedOff: true },
			// clearing noops keeps the turn-length growth -> 3 + 1*2
			{ op: 'afterClearNoops', threshold: 5, isBackedOff: true },
			// 4 passes total would be 3 + 4*2 = 11, capped at max 9
			{ op: 'afterThreeMorePasses', threshold: 9, isBackedOff: true },
			{ op: 'afterReset', threshold: 3, isBackedOff: false },
		]);
	});

	test('isReady is true only once the substantive round count meets the current threshold', () => {
		const tracker = new BackOffTracker(3, 2, 24);
		const initial = { below: tracker.isReady(2), at: tracker.isReady(3), above: tracker.isReady(4) };
		tracker.recordPass(); // threshold grows from 3 to 5
		const afterPass = { below: tracker.isReady(4), at: tracker.isReady(5), above: tracker.isReady(6) };
		expect({ initial, afterPass }).toEqual({
			initial: { below: false, at: true, above: true },
			afterPass: { below: false, at: true, above: true },
		});
	});
});

describe('getSessionResource', () => {

	function ctx(partial: {
		request?: { sessionResource?: URI };
		tools?: { toolInvocationToken?: { sessionResource?: string | URI } };
	}): IBuildPromptContext {
		return partial as unknown as IBuildPromptContext;
	}

	test('resolves from the request or tool token, with the request taking precedence', () => {
		const requestUri = URI.file('/sessions/from-request');
		const tokenUri = URI.file('/sessions/from-token');
		expect({
			fromRequest: getSessionResource(ctx({ request: { sessionResource: requestUri } })),
			fromTokenString: getSessionResource(ctx({ tools: { toolInvocationToken: { sessionResource: 'token-string' } } })),
			fromTokenUri: getSessionResource(ctx({ tools: { toolInvocationToken: { sessionResource: tokenUri } } })),
			requestWins: getSessionResource(ctx({
				request: { sessionResource: requestUri },
				tools: { toolInvocationToken: { sessionResource: 'token-string' } },
			})),
			none: getSessionResource(ctx({})),
		}).toEqual({
			fromRequest: requestUri.toString(),
			fromTokenString: 'token-string',
			fromTokenUri: tokenUri.toString(),
			requestWins: requestUri.toString(),
			none: undefined,
		});
	});
});
