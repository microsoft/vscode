/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentChatMoveRefusal, AgentChatMoveRefusedError } from '../../../../../../platform/agentHost/common/agentHostChatMove.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { getChatMoveRefusal, toChatMoveError } from '../../browser/agentHostChatMoveErrors.js';

suite('Agent Host Chat Move Errors', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the refusal reason of protocol and host errors and explains it without the host details', () => {
		const archived = new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Session agent-host://x is archived.', { reason: AgentChatMoveRefusal.SessionArchived });
		const notStarted = new AgentChatMoveRefusedError(AgentChatMoveRefusal.NotStarted, 'Chat x has no turns yet.');
		const unknownReason = new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Bad params', { reason: 'somethingElse' });
		const failure = new Error('Connection closed');
		const message = (error: unknown) => error instanceof Error ? error.message : String(error);

		assert.deepStrictEqual({
			reasons: [archived, notStarted, unknownReason, failure].map(getChatMoveRefusal),
			messages: [archived, notStarted, unknownReason, failure].map(error => message(toChatMoveError(error))),
		}, {
			reasons: [AgentChatMoveRefusal.SessionArchived, AgentChatMoveRefusal.NotStarted, undefined, undefined],
			messages: [
				'Chats can\'t be moved into or out of an archived session.',
				'Send a message in this chat before moving it to its own session.',
				// Anything that is not a refusal passes through unchanged.
				'Bad params',
				'Connection closed',
			],
		});
	});
});
