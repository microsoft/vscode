/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agentService.js';
import { buildChatUri } from '../../common/state/sessionState.js';
import { classifyCopilotClientFailure, createCopilotFailureCorrelation } from '../../node/copilot/copilotFailureTelemetry.js';

suite('CopilotFailureTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies only known client lifecycle failures', () => {
		assert.deepStrictEqual([
			classifyCopilotClientFailure(new Error('Connection is closed.')),
			classifyCopilotClientFailure(new Error('Connection is disposed.')),
			classifyCopilotClientFailure(new Error('Client not connected')),
			classifyCopilotClientFailure(new Error('The in-process runtime connection is closed.')),
			classifyCopilotClientFailure(new Error('Failed to start CLI server: spawn failed')),
			classifyCopilotClientFailure(new Error('CLI server exited with code 1')),
			classifyCopilotClientFailure(new Error('CLI server exited unexpectedly with code 1')),
			classifyCopilotClientFailure(new Error('429 too many requests')),
		], [
			'connectionClosed',
			'connectionDisposed',
			'clientNotConnected',
			'runtimeConnectionClosed',
			'startupFailed',
			'startupFailed',
			'startupFailed',
			undefined,
		]);
	});

	test('builds the Agent Host and SDK correlation tuple', () => {
		const session = AgentSession.uri('copilotcli', 'agent-session-id');
		const chat = URI.parse(buildChatUri(session, 'peer-chat-id'));

		assert.deepStrictEqual(createCopilotFailureCorrelation(session, chat, 'turn-id', 'sdk-session-id'), {
			agentSessionId: 'agent-session-id',
			chatSessionId: 'peer-chat-id',
			turnId: 'turn-id',
			sdkSessionId: 'sdk-session-id',
		});
	});
});
