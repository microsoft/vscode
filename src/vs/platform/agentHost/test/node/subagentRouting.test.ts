/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { SubagentRouting } from '../../node/copilot/subagentRouting.js';

class CapturingLogService extends NullLogService {
	readonly warnings: string[] = [];

	override warn(message: string): void {
		this.warnings.push(message);
	}
}

suite('SubagentRouting', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('routes lifecycle events and rejects unknown subagents', () => {
		const logService = new CapturingLogService();
		const events: unknown[] = [];
		const routing = new SubagentRouting(
			'session-1',
			logService,
			(parentToolCallId, message) => events.push({ kind: 'resumed', parentToolCallId, message }),
			parentToolCallId => events.push({ kind: 'completed', parentToolCallId }),
		);

		routing.startSubagent('agent-1', 'tool-1');
		routing.resumeForEvent({ agentId: 'agent-1' });
		routing.completeSubagentTurn('agent-1');
		routing.resumeForEvent({ agentId: 'agent-1' });
		routing.addUnroutableToolCall('tool-2');

		assert.deepStrictEqual({
			parentToolCallId: routing.parentToolCallIdForEvent({ agentId: 'agent-1' }),
			dropUnknown: routing.shouldDropUnmappedEvent({ agentId: 'agent-2' }, 'assistant.message_delta'),
			dropMain: routing.shouldDropUnmappedEvent({}, 'assistant.message_delta'),
			takeUnroutable: routing.takeUnroutableToolCall('tool-2'),
			takeMissing: routing.takeUnroutableToolCall('tool-2'),
			events,
			warnings: logService.warnings,
		}, {
			parentToolCallId: 'tool-1',
			dropUnknown: true,
			dropMain: false,
			takeUnroutable: true,
			takeMissing: false,
			events: [
				{ kind: 'completed', parentToolCallId: 'tool-1' },
				{ kind: 'resumed', parentToolCallId: 'tool-1', message: undefined },
			],
			warnings: ['[Copilot:session-1] Dropping assistant.message_delta for unknown subagent agentId=agent-2'],
		});
	});
});
