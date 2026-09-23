/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentModelCallMetaKey, readAgentModelCallDiagnostics } from '../../common/meta/agentModelCallMeta.js';

suite('Agent model call diagnostics', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates bounds and preserves unknown durations rather than zeroing them', () => {
		const diagnostics = readAgentModelCallDiagnostics({
			_meta: {
				[agentModelCallMetaKey]: {
					schemaVersion: 1, sdkSessionId: 'sdk', eventId: 'usage', apiCallId: 'call',
					providerCallId: 'x'.repeat(257), durationMs: 0, timeToFirstTokenMs: -1, outputTtftMs: Infinity,
					inputTokens: NaN, outputTokens: 0, content: 'not exported',
				}
			}
		});
		assert.deepStrictEqual(JSON.parse(JSON.stringify(diagnostics)), {
			schemaVersion: 1, sdkSessionId: 'sdk', eventId: 'usage', apiCallId: 'call', durationMs: 0, outputTokens: 0,
		});
	});

	test('rejects malformed and future records', () => {
		assert.deepStrictEqual([undefined, null, [], { schemaVersion: 2 }, { schemaVersion: 1, sdkSessionId: 'sdk' }]
			.map(value => readAgentModelCallDiagnostics({ _meta: { [agentModelCallMetaKey]: value } })), [undefined, undefined, undefined, undefined, undefined]);
	});
});
