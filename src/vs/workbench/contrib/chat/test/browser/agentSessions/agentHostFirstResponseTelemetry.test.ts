/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostFirstResponseTiming } from '../../../browser/agentSessions/agentHost/agentHostFirstResponseTelemetry.js';

suite('AgentHostFirstResponseTiming', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('measures first nonwhitespace text once including preparation time', () => {
		let elapsed = 100;
		const timing = new AgentHostFirstResponseTiming({ elapsed: () => elapsed });
		timing.observeText('');
		timing.observeText(' \n\t');
		elapsed = 250;
		timing.observeText('answer');
		elapsed = 900;
		timing.observeText('duplicate');
		assert.deepStrictEqual(timing.finish({ requestId: 'turn', provider: 'copilot', outcome: 'success', sessionTurnKind: 'first', invocationKind: 'newTurn' }), {
			schemaVersion: 1, requestId: 'turn', provider: 'copilot', outcome: 'success', sessionTurnKind: 'first', invocationKind: 'newTurn',
			firstResponseTextMs: 250, totalElapsedMs: 900, hasResponseText: true,
		});
	});

	for (const outcome of ['success', 'cancelled', 'error', 'notDispatched'] as const) {
		test(`preserves absence of text for ${outcome}`, () => {
			const timing = new AgentHostFirstResponseTiming({ elapsed: () => 42 });
			assert.deepStrictEqual(timing.finish({ requestId: 'turn', provider: 'copilot', outcome, sessionTurnKind: 'unknown', invocationKind: 'unknown' }), {
				schemaVersion: 1, requestId: 'turn', provider: 'copilot', outcome, sessionTurnKind: 'unknown', invocationKind: 'unknown',
				firstResponseTextMs: undefined, totalElapsedMs: 42, hasResponseText: false,
			});
		});
	}
});
