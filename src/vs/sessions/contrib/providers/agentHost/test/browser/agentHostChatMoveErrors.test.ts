/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentChatMoveRefusal, AgentChatMoveRefusedError } from '../../../../../../platform/agentHost/common/agentHostChatMove.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { getChatMoveRefusal, toChatMoveError } from '../../browser/agentHostChatMoveErrors.js';
import { SessionMoveRefusedError } from '../../../../../services/sessions/common/sessionsProvider.js';

suite('Agent Host Chat Move Errors', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the refusal reason of protocol and host errors and explains it without the host details', () => {
		const archived = new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Session agent-host://x is archived.', { reason: AgentChatMoveRefusal.SessionArchived });
		const notStarted = new AgentChatMoveRefusedError(AgentChatMoveRefusal.NotStarted, 'Chat x has no turns yet.');
		const credentials = new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Sessions with different credential owners can\'t be combined.', { reason: AgentChatMoveRefusal.DifferentCredentialOwner });
		const unknownReason = new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Bad params', { reason: 'somethingElse' });
		const failure = new Error('Connection closed');
		const message = (error: unknown) => error instanceof Error ? error.message : String(error);

		assert.deepStrictEqual({
			reasons: [archived, notStarted, credentials, unknownReason, failure].map(getChatMoveRefusal),
			messages: [archived, notStarted, credentials, unknownReason, failure].map(error => message(toChatMoveError(error, false))),
			// Only refusals become errors the sessions list shows as they are.
			refused: [archived, notStarted, credentials, unknownReason, failure].map(error => toChatMoveError(error, false) instanceof SessionMoveRefusedError),
		}, {
			reasons: [AgentChatMoveRefusal.SessionArchived, AgentChatMoveRefusal.NotStarted, AgentChatMoveRefusal.DifferentCredentialOwner, undefined, undefined],
			messages: [
				'Chats can\'t be moved into or out of an archived session.',
				'Send a message in this chat before moving it.',
				'This chat uses a different account\'s credentials than the destination session.',
				// Anything that is not a refusal passes through unchanged.
				'Bad params',
				'Connection closed',
			],
			refused: [true, true, true, false, false],
		});
	});

	test('explains a workspace-less refusal by whether the chat shares its folder', () => {
		const refusal = new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Chat x shares its scratch folder.', { reason: AgentChatMoveRefusal.Workspaceless });
		const message = (error: unknown) => error instanceof Error ? error.message : String(error);

		assert.deepStrictEqual({
			shared: message(toChatMoveError(refusal, true)),
			noFolder: message(toChatMoveError(refusal, false)),
		}, {
			shared: 'This chat shares its folder with another chat in its session, so it can\'t be moved on its own.',
			noFolder: 'This chat\'s folder is missing, so it can\'t be moved.',
		});
	});
});
