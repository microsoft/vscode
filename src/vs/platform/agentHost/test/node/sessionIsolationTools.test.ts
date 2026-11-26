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
import { chatTurnStarted } from '../common/chatActionBuilders.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentSessionUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
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
			defaultChat: buildDefaultChatUri(session),
		});
		stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, buildDefaultChatUri(session)));
		const calls: { chat: string; turnId: string }[] = [];
		const folderCalls: { session: string; chat: string; folder: string; turnId: string }[] = [];
		let enabled = true;
		let folderIsolation = false;
		const group = createSessionIsolationToolGroup({
			supportsChatIsolation: () => enabled,
			requestChatIsolation: (chat, turnId) => calls.push({ chat: chat.toString(), turnId }),
			supportsFolderIsolation: () => folderIsolation,
			requestFolderIsolation: (session, chat, folder, turnId) => {
				folderCalls.push({ session: session.toString(), chat: chat.toString(), folder: folder.fsPath, turnId });
			},
		});
		const host = new AgentServerToolHost(stateManager, [group]);
		host.advertise(session);
		return {
			stateManager, host, group, session, main, peer, calls, folderCalls,
			disable: () => { enabled = false; },
			enableFolderIsolation: () => { folderIsolation = true; host.advertise(session); },
		};
	}

	test('advertises to the session but rejects subagent calls', () => {
		const { stateManager, host, session, main } = createHarness();
		const childSession = buildSubagentSessionUri(URI.parse(session), 'worker').toString();
		const child = buildDefaultChatUri(childSession);
		stateManager.createSession({
			resource: childSession, provider: 'copilotcli', title: 'Worker', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
			defaultChat: buildDefaultChatUri(childSession),
		});
		assert.deepStrictEqual({
			session: host.getDefinitionsForSession(session).map(tool => tool.name),
			child: host.getDefinitionsForSession(childSession),
		}, { session: [SessionServerToolName.IsolateSession], child: [] });
		assert.throws(() => host.executeTool(child, SessionServerToolName.IsolateSession, {}), /disabled/);
		assert.strictEqual(host.requiresConfirmation(main, SessionServerToolName.IsolateSession), true);
	});

	test('defers the tool behind tool search while keeping the wire definition unchanged', () => {
		const { stateManager, host, session } = createHarness();
		assert.deepStrictEqual({
			deferrals: host.getDefinitionsForSession(session).map(({ name, deferLoading }) => ({ name, deferLoading })),
			advertisedCarriesDeferral: stateManager.getSessionState(session)?.serverTools?.some(tool => Object.keys(tool).includes('deferLoading')),
		}, {
			deferrals: [{ name: SessionServerToolName.IsolateSession, deferLoading: true }],
			advertisedCarriesDeferral: false,
		});
	});

	for (const target of ['main', 'peer'] as const) {
		test(`requests isolation from an active ${target} turn with no workspace arguments`, () => {
			const harness = createHarness();
			const { stateManager, host, calls } = harness;
			const chat = harness[target];
			stateManager.dispatchServerAction(chat, chatTurnStarted('turn-1', 'Continue in isolation'));
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

	test('isolate_folder is offered, deferred, only to sessions with worktree isolation, and requests the isolation of the folder it is given from an active turn, after confirmation', () => {
		const { stateManager, host, session, main, folderCalls, enableFolderIsolation } = createHarness();
		const folder = URI.file('/work/protocol').fsPath;
		const before = host.getDefinitionsForSession(session).map(tool => tool.name);
		enableFolderIsolation();
		const after = host.getDefinitionsForSession(session).map(({ name, deferLoading }) => ({ name, deferLoading }));
		assert.throws(() => host.executeTool(main, SessionServerToolName.IsolateFolder, { folder }), /requires an active turn/);
		stateManager.dispatchServerAction(main, chatTurnStarted('turn-1', 'Change the protocol'));
		for (const args of [{}, { folder: 'relative/path' }, { folder, extra: true }]) {
			assert.throws(() => host.executeTool(main, SessionServerToolName.IsolateFolder, args), /absolute path of one additional folder/);
		}
		const result = host.executeTool(main, SessionServerToolName.IsolateFolder, { folder });

		assert.deepStrictEqual({
			before,
			after,
			canConfirm: host.canRequireConfirmation(SessionServerToolName.IsolateFolder),
			confirms: host.requiresConfirmation(main, SessionServerToolName.IsolateFolder),
			folderCalls,
			display: getServerToolDisplay(SessionServerToolName.IsolateFolder, { folder }),
		}, {
			before: [SessionServerToolName.IsolateSession],
			after: [{ name: SessionServerToolName.IsolateSession, deferLoading: true }, { name: SessionServerToolName.IsolateFolder, deferLoading: true }],
			canConfirm: true,
			confirms: true,
			folderCalls: [{ session, chat: main, folder, turnId: 'turn-1' }],
			display: {
				displayName: 'Isolate Folder in a Worktree',
				invocationMessage: 'Requesting a worktree for protocol',
				pastTenseMessage: 'Requested a worktree for protocol',
				confirmationTitle: 'Move Folder to a Worktree?',
				confirmationMessage: `Move ${folder} to a new worktree for this chat? Other chats and the original folder stay as they are. Uncommitted edits are not copied, except configured worktree include-files. Skip to keep working in the shared folder.`,
				hideConfirmationInput: true,
			},
		});
		assert.match(String(result), /scheduled.*end this turn now without calling more tools or replying.*continue the original task automatically/);
	});

	test('isolate_folder tells the agent when to call it, to follow the confirmation flow and to end the turn', () => {
		const { group } = createHarness();
		const description = group.definitions.find(tool => tool.name === SessionServerToolName.IsolateFolder)!.description!;
		assert.match(description, /shared checkout, not isolated/);
		assert.match(description, /before any tool that creates, edits or deletes files or runs commands that change files/);
		assert.match(description, /Not needed for reading, for the primary folder/);
		assert.match(description, /other chats and the original folder are left unchanged/);
		assert.match(description, /Follow the tool confirmation flow; if the user skips it, the folder is not moved and you continue in the shared folder/);
		assert.match(description, /final tool call and end the turn.*continues its task automatically/);
		assert.match(description, /Do not poll or repeat the request/);
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
});
