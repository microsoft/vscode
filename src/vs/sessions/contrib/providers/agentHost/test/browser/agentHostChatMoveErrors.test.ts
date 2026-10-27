/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentChatMoveRefusal, AgentChatMoveRefusedError } from '../../../../../../platform/agentHost/common/agentHostChatMove.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { ChatMoveAgentRefusal, getChatMoveAgentRefusalMessage, getChatMoveRefusal, toChatMoveError } from '../../browser/agentHostChatMoveErrors.js';
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
			messages: [archived, notStarted, credentials, unknownReason, failure].map(error => message(toChatMoveError(error, { chatSharesFolder: false }))),
			// Only refusals become errors the sessions list shows as they are.
			refused: [archived, notStarted, credentials, unknownReason, failure].map(error => toChatMoveError(error, { chatSharesFolder: false }) instanceof SessionMoveRefusedError),
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
			shared: message(toChatMoveError(refusal, { chatSharesFolder: true })),
			noFolder: message(toChatMoveError(refusal, { chatSharesFolder: false })),
		}, {
			shared: 'This chat shares its folder with another chat in its session, so it can\'t be moved on its own.',
			noFolder: 'This chat\'s folder is missing, so it can\'t be moved.',
		});
	});

	test('explains refusals by agent and of a new session without claiming what the host did not say', () => {
		const message = (error: unknown) => error instanceof Error ? error.message : String(error);
		const differentProvider = new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Turn on chats with their own agents.', { reason: AgentChatMoveRefusal.DifferentProvider });
		const unsupported = new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Chat x has no recorded conversation of its own to take into a new session.', { reason: AgentChatMoveRefusal.Unsupported });

		assert.deepStrictEqual({
			differentProvider: message(toChatMoveError(differentProvider, { chatSharesFolder: false })),
			differentProviderCrossAgent: message(toChatMoveError(differentProvider, { chatSharesFolder: false, crossAgent: true })),
			unsupportedNewSession: message(toChatMoveError(unsupported, { chatSharesFolder: false, toNewSession: true })),
			unsupportedSession: message(toChatMoveError(unsupported, { chatSharesFolder: false })),
			prepared: [ChatMoveAgentRefusal.CannotHost, ChatMoveAgentRefusal.SettingsUnavailable, ChatMoveAgentRefusal.NoConversation].map(getChatMoveAgentRefusalMessage),
		}, {
			differentProvider: 'Chats can only move between sessions of the same agent.',
			differentProviderCrossAgent: 'This chat\'s agent can\'t work in that session.',
			// A chat without a conversation and an agent that couldn't load its settings are refused alike.
			unsupportedNewSession: 'This chat can\'t be moved into a new session.',
			unsupportedSession: 'This chat can\'t be moved there.',
			prepared: [
				'This chat\'s agent can\'t work in that session.',
				'The chat\'s agent couldn\'t load its settings. Try again.',
				'This chat has no conversation of its own yet, so it can\'t be moved into a new session.',
			],
		});
	});
});
