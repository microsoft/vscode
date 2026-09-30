/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostFirstResponseTiming, nextRendererRootInvocationOrdinal } from '../../../browser/agentSessions/agentHost/agentHostFirstResponseTelemetry.js';

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
		assert.deepStrictEqual(timing.finish({ requestId: 'turn', provider: 'copilot', agentSessionId: 'session', chatId: 'chat', outcome: 'success', sessionTurnKind: 'first', invocationKind: 'newTurn', trustInteractionRequired: false }), {
			schemaVersion: 1, requestId: 'turn', provider: 'copilot', agentSessionId: 'session', chatId: 'chat', outcome: 'success', sessionTurnKind: 'first', invocationKind: 'newTurn', trustInteractionRequired: false,
			firstResponseTextMs: 250, rootToolCallsBeforeFirstText: 0, totalElapsedMs: 900, hasResponseText: true,
		});
	});

	test('counts distinct root tools only until first nonwhitespace text', () => {
		const timing = new AgentHostFirstResponseTiming({ elapsed: () => 42 });
		timing.observeToolCall('rename');
		timing.observeText(' \n');
		timing.observeToolCall('rename');
		timing.observeToolCall('second');
		timing.observeText('answer');
		timing.observeToolCall('after-text');
		assert.strictEqual(timing.finish({ requestId: 'turn', provider: 'copilot', outcome: 'success', sessionTurnKind: 'first', invocationKind: 'newTurn', trustInteractionRequired: false }).rootToolCallsBeforeFirstText, 2);
	});

	test('shares the ordinal across timing instances without waiting for completion', () => {
		const first = nextRendererRootInvocationOrdinal();
		const firstTiming = new AgentHostFirstResponseTiming();
		const second = nextRendererRootInvocationOrdinal();
		const secondTiming = new AgentHostFirstResponseTiming();
		const context = { requestId: 'turn', provider: 'copilot', outcome: 'notDispatched', sessionTurnKind: 'unknown', invocationKind: 'unknown', trustInteractionRequired: false } as const;
		const secondResult = secondTiming.finish({ ...context, rendererRootInvocationOrdinal: second });
		const firstResult = firstTiming.finish({ ...context, rendererRootInvocationOrdinal: first });
		assert.deepStrictEqual([firstResult.rendererRootInvocationOrdinal, secondResult.rendererRootInvocationOrdinal], [first, first + 1]);
	});

	for (const outcome of ['success', 'cancelled', 'error', 'notDispatched'] as const) {
		test(`preserves absence of text for ${outcome}`, () => {
			const timing = new AgentHostFirstResponseTiming({ elapsed: () => 42 });
			timing.observeToolCall('no-answer');
			assert.deepStrictEqual(timing.finish({ requestId: 'turn', provider: 'copilot', outcome, sessionTurnKind: 'unknown', invocationKind: 'unknown', trustInteractionRequired: false }), {
				schemaVersion: 1, requestId: 'turn', provider: 'copilot', outcome, sessionTurnKind: 'unknown', invocationKind: 'unknown', trustInteractionRequired: false,
				firstResponseTextMs: undefined, rootToolCallsBeforeFirstText: undefined, totalElapsedMs: 42, hasResponseText: false,
			});
		});
	}
});
