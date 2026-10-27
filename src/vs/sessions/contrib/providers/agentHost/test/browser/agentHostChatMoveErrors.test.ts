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

	test('explains refusals by agent, and an unsupported new session as the chat having no conversation of its own', () => {
		const message = (error: unknown) => error instanceof Error ? error.message : String(error);
		const refusal = (reason: AgentChatMoveRefusal) => new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Host details.', { reason });

		assert.deepStrictEqual({
			// Only with chats on their own agents off.
			differentProvider: message(toChatMoveError(refusal(AgentChatMoveRefusal.DifferentProvider), { chatSharesFolder: false })),
			agentUnavailable: message(toChatMoveError(refusal(AgentChatMoveRefusal.AgentUnavailable), { chatSharesFolder: false })),
			agentWithoutChats: message(toChatMoveError(refusal(AgentChatMoveRefusal.AgentWithoutChats), { chatSharesFolder: false })),
			agentConfigUnavailable: message(toChatMoveError(refusal(AgentChatMoveRefusal.AgentConfigUnavailable), { chatSharesFolder: false, toNewSession: true })),
			unsupportedNewSession: message(toChatMoveError(refusal(AgentChatMoveRefusal.Unsupported), { chatSharesFolder: false, toNewSession: true })),
			unsupportedSession: message(toChatMoveError(refusal(AgentChatMoveRefusal.Unsupported), { chatSharesFolder: false })),
		}, {
			differentProvider: 'Chats can only move between sessions of the same agent. Pick a session that uses this chat\'s agent.',
			agentUnavailable: 'This chat\'s agent is unavailable or disabled. Enable it to move the chat.',
			agentWithoutChats: 'The destination session\'s agent can\'t host chats of other agents, or this chat\'s agent can\'t join one. Pick a session whose agent supports multiple chats, or one of this chat\'s agent.',
			agentConfigUnavailable: 'This chat\'s agent couldn\'t load its settings for the move. Try again.',
			unsupportedNewSession: 'This chat has no conversation of its own yet, so it can\'t be moved into a new session.',
			unsupportedSession: 'This chat can\'t be moved there.',
		});
	});
});
