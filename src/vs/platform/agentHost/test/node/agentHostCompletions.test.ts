/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CompletionItemKind, type CompletionsParams } from '../../common/state/protocol/commands.js';
import { buildChatUri, buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostCompletions, type IAgentHostCompletionContext } from '../../node/agentHostCompletions.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

suite('AgentHostCompletions', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tells providers the completing chat from recorded state', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const session = 'copilotcli:/completions';
		const defaultChat = buildDefaultChatUri(session);
		const peer = buildChatUri(session, 'peer');
		stateManager.createSession({ resource: session, provider: 'copilotcli', title: 't', status: SessionStatus.Idle, createdAt: '2026-01-01T00:00:00Z', modifiedAt: '2026-01-01T00:00:00Z', defaultChat });
		stateManager.addChat(session, peer, peer);

		const completions = disposables.add(new AgentHostCompletions(logService, stateManager));
		const seen: (string | undefined)[] = [];
		disposables.add(completions.registerProvider({
			kinds: new Set([CompletionItemKind.UserMessage]),
			provideCompletionItems: async (_params: CompletionsParams, context: IAgentHostCompletionContext) => {
				seen.push(context.chat);
				return [];
			},
		}));
		for (const channel of [session, peer, buildChatUri(session, 'unknown'), 'copilotcli:/unknown-session']) {
			await completions.completions({ kind: CompletionItemKind.UserMessage, channel, text: '/', offset: 1 }, CancellationToken.None);
		}

		assert.deepStrictEqual(seen, [defaultChat, peer, undefined, undefined]);
	});
});
