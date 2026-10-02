/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentSessionUri, MessageKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentServerToolHost } from '../../node/shared/agentServerToolHost.js';
import { createSessionIsolationToolGroup } from '../../node/shared/sessionIsolationTools.js';
import { getServerToolDisplay } from '../../node/shared/serverToolGroups.js';

suite('Session isolation tool', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness() {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const session = 'copilotcli:/session';
		const main = buildDefaultChatUri(session);
		const peer = buildChatUri(session, 'peer');
		stateManager.createSession({
			resource: session, provider: 'copilotcli', title: 'Project', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
		});
		stateManager.addChat(session, peer);
		const calls: { chat: string; turnId: string }[] = [];
		let enabled = true;
		const group = createSessionIsolationToolGroup({
			supportsChatIsolation: () => enabled,
			requestChatIsolation: (chat, turnId) => calls.push({ chat: chat.toString(), turnId }),
		});
		const host = new AgentServerToolHost(stateManager, [group]);
		host.advertise(session);
		return { stateManager, host, group, session, main, peer, calls, disable: () => { enabled = false; } };
	}

	test('advertises to main and peer chats but rejects subagent calls', () => {
		const { host, session, main, peer } = createHarness();
		const childSession = buildSubagentSessionUri(URI.parse(session), 'worker').toString();
		const child = buildDefaultChatUri(childSession);
		assert.deepStrictEqual({
			main: host.getDefinitionsForSession(session, main).map(tool => tool.name),
			peer: host.getDefinitionsForSession(session, peer).map(tool => tool.name),
			child: host.getDefinitionsForSession(childSession, child),
		}, { main: [SessionServerToolName.IsolateSession], peer: [SessionServerToolName.IsolateSession], child: [] });
		assert.throws(() => host.executeTool(child, SessionServerToolName.IsolateSession, {}), /disabled/);
	});

	for (const target of ['main', 'peer'] as const) {
		test(`requests isolation from an active ${target} turn with no workspace arguments`, () => {
			const harness = createHarness();
			const { stateManager, host, calls } = harness;
			const chat = harness[target];
			stateManager.dispatchServerAction(chat, {
				type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: new Date().toISOString(),
				message: { text: 'Continue in isolation', origin: { kind: MessageKind.User } },
			});
			assert.throws(() => host.executeTool(chat, SessionServerToolName.IsolateSession, { workspace: '/other' }), /no arguments/);
			const result = host.executeTool(chat, SessionServerToolName.IsolateSession, {});
			assert.deepStrictEqual(calls, [{ chat, turnId: 'turn-1' }]);
			assert.match(String(result), /End this turn.*only this chat.*automatically/);
		});
	}

	test('does not execute outside a turn or after isolation is no longer available', () => {
		const { host, session, main, disable } = createHarness();
		assert.throws(() => host.executeTool(main, SessionServerToolName.IsolateSession, {}), /active turn/);
		disable();
		host.advertise(session);
		assert.deepStrictEqual(host.getDefinitionsForSession(session), []);
		assert.throws(() => host.executeTool(main, SessionServerToolName.IsolateSession, {}), /disabled/);
	});

	test('refreshes tool availability on an existing session instead of pinning initial membership', () => {
		const { stateManager, host, session } = createHarness();
		stateManager.dispatchServerAction(session, { type: ActionType.SessionServerToolsChanged, tools: [] });
		host.advertise(session);
		assert.deepStrictEqual(stateManager.getSessionState(session)?.serverTools?.map(tool => tool.name), [SessionServerToolName.IsolateSession]);
	});

	test('requires confirmation and explains chat-only effects and turn ordering', () => {
		const { host, group, main } = createHarness();
		const tool = group.definitions[0];
		assert.deepStrictEqual({
			canConfirm: host.canRequireConfirmation(tool.name),
			confirms: host.requiresConfirmation(main, tool.name),
			parameters: tool.inputSchema,
			display: getServerToolDisplay(tool.name, {})?.displayName,
		}, {
			canConfirm: true, confirms: true, parameters: { type: 'object', properties: {} }, display: 'Change Workspace to a New Worktree',
		});
		assert.deepStrictEqual(Object.values(getServerToolDisplay(tool.name, {})!).filter(value => typeof value === 'string' && /isolat/i.test(value)), []);
		assert.match(tool.description!, /only the current chat/);
		assert.match(tool.description!, /original folder is unchanged/);
		assert.match(tool.description!, /does not.*move other chats/);
		assert.match(tool.description!, /final tool call.*end the turn/);
	});

	test('confirmation follows the owning session chat count and stays neutral without live state', () => {
		const { stateManager, host, session, main, peer } = createHarness();
		const multiChatMessage = 'Change only this chat\'s workspace to a new worktree? Other chats and the original folder are left unchanged. Uncommitted edits are not copied, except configured worktree include-files.';
		const singleChatMessage = 'Change this chat\'s workspace to a new worktree? The original folder is left unchanged. Uncommitted edits are not copied, except configured worktree include-files.';
		const multi = [main, peer].map(chat => host.getDisplay(chat, SessionServerToolName.IsolateSession, {})?.confirmationMessage);
		stateManager.removeChat(session, peer);
		const single = host.getDisplay(main, SessionServerToolName.IsolateSession, {})?.confirmationMessage;
		stateManager.addChat(session, peer);
		assert.deepStrictEqual({
			multi, single,
			afterAddingChat: host.getDisplay(main, SessionServerToolName.IsolateSession, {})?.confirmationMessage,
			withoutState: getServerToolDisplay(SessionServerToolName.IsolateSession, {})?.confirmationMessage,
		}, {
			multi: [multiChatMessage, multiChatMessage],
			single: singleChatMessage,
			afterAddingChat: multiChatMessage,
			withoutState: singleChatMessage,
		});
	});
});
