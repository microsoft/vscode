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
import { createSessionIsolationToolGroup, type IIsolatableFolders } from '../../node/shared/sessionIsolationTools.js';
import { getServerToolDisplay } from '../../node/shared/serverToolGroups.js';

suite('Session isolation tool', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const app = URI.file('/work/app');
	const protocol = URI.file('/work/protocol');
	const docs = URI.file('/work/docs');

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
		const calls: { chat: string; turnId: string; primary: string; additional: string[] }[] = [];
		const folderCalls: { session: string; chat: string; folders: string[]; turnId: string }[] = [];
		let chatIsolation = true;
		let folderIsolation = false;
		let isolatable: IIsolatableFolders = { folders: [app], primary: app };
		const group = createSessionIsolationToolGroup({
			supportsChatIsolation: () => chatIsolation,
			requestChatIsolation: (chat, turnId, primary, additional) => calls.push({ chat: chat.toString(), turnId, primary: primary.fsPath, additional: additional.map(folder => folder.fsPath) }),
			supportsFolderIsolation: () => folderIsolation,
			requestFolderIsolation: (session, chat, folders, turnId) => {
				folderCalls.push({ session: session.toString(), chat: chat.toString(), folders: folders.map(folder => folder.fsPath), turnId });
			},
			getIsolatableFolders: async () => isolatable,
		});
		const host = new AgentServerToolHost(stateManager, [group]);
		host.advertise(session);
		return {
			stateManager, host, group, session, main, peer, calls, folderCalls,
			setSupport: (chat: boolean, folders: boolean) => { chatIsolation = chat; folderIsolation = folders; host.advertise(session); },
			setIsolatable: (value: IIsolatableFolders) => { isolatable = value; },
		};
	}

	async function errorOf(promise: unknown): Promise<string | undefined> {
		try {
			await promise;
			return undefined;
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
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
		assert.throws(() => host.executeTool(child, SessionServerToolName.IsolateSession, { folders: [app.fsPath] }), /disabled/);
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

	test('is offered when the session can move a chat or its folders, and to neither otherwise', () => {
		const { host, session, setSupport } = createHarness();
		const offered = (chat: boolean, folders: boolean) => {
			setSupport(chat, folders);
			return host.getDefinitionsForSession(session).map(tool => tool.name);
		};
		assert.deepStrictEqual({
			chat: offered(true, false),
			folders: offered(false, true),
			neither: offered(false, false),
		}, {
			chat: [SessionServerToolName.IsolateSession],
			folders: [SessionServerToolName.IsolateSession],
			neither: [],
		});
	});

	for (const target of ['main', 'peer'] as const) {
		test(`a ${target} chat of one folder passing its folder moves the chat to a new worktree`, async () => {
			const harness = createHarness();
			const { stateManager, host, calls, folderCalls } = harness;
			const chat = harness[target];
			stateManager.dispatchServerAction(chat, chatTurnStarted('turn-1', 'Continue in isolation'));
			const result = await host.executeTool(chat, SessionServerToolName.IsolateSession, { folders: [app.fsPath] });
			assert.deepStrictEqual({ calls, folderCalls }, { calls: [{ chat, turnId: 'turn-1', primary: app.fsPath, additional: [] }], folderCalls: [] });
			assert.match(String(result), /End this turn.*only this chat.*automatically/);
		});
	}

	test('a chat of several folders moves the folders it names in one request', async () => {
		const { stateManager, host, main, session, calls, folderCalls, setIsolatable } = createHarness();
		setIsolatable({ folders: [protocol, docs] });
		stateManager.dispatchServerAction(main, chatTurnStarted('turn-1', 'Change both'));
		const result = await host.executeTool(main, SessionServerToolName.IsolateSession, { folders: [protocol.fsPath, docs.fsPath] });
		assert.deepStrictEqual({ calls, folderCalls }, {
			calls: [],
			folderCalls: [{ session, chat: main, folders: [protocol.fsPath, docs.fsPath], turnId: 'turn-1' }],
		});
		assert.match(String(result), /scheduled.*End this turn now without calling more tools or replying.*continue the original task automatically, telling you each folder's new path/);
	});

	test('a chat of several folders moves itself to a new worktree of its main folder, alone or with other folders, in one request', async () => {
		const { stateManager, host, main, calls, folderCalls, setIsolatable } = createHarness();
		setIsolatable({ folders: [app, protocol, docs], primary: app });
		stateManager.dispatchServerAction(main, chatTurnStarted('turn-1', 'Change the app'));
		const alone = await host.executeTool(main, SessionServerToolName.IsolateSession, { folders: [app.fsPath] });
		const withOthers = await host.executeTool(main, SessionServerToolName.IsolateSession, { folders: [docs.fsPath, app.fsPath] });
		assert.deepStrictEqual({ calls, folderCalls }, {
			calls: [
				{ chat: main, turnId: 'turn-1', primary: app.fsPath, additional: [] },
				{ chat: main, turnId: 'turn-1', primary: app.fsPath, additional: [docs.fsPath] },
			],
			folderCalls: [],
		});
		assert.match(String(alone), /Moving this chat to a new worktree is scheduled/);
		assert.match(String(withOthers), /Moving this chat to a new worktree of .*app.*, and .*docs.* into worktrees of their own, is scheduled.*telling you each new path/);
	});

	test('a chat of several folders can move one additional folder only', async () => {
		const { stateManager, host, main, session, folderCalls, setIsolatable } = createHarness();
		setIsolatable({ folders: [protocol, docs] });
		stateManager.dispatchServerAction(main, chatTurnStarted('turn-1', 'Change the protocol'));
		await host.executeTool(main, SessionServerToolName.IsolateSession, { folders: [docs.fsPath] });
		assert.deepStrictEqual(folderCalls, [{ session, chat: main, folders: [docs.fsPath], turnId: 'turn-1' }]);
	});

	test('rejects folders it cannot move and malformed calls, listing the folders the agent can pass', async () => {
		const { stateManager, host, main, calls, folderCalls, setIsolatable } = createHarness();
		setIsolatable({ folders: [protocol] });
		stateManager.dispatchServerAction(main, chatTurnStarted('turn-1', 'Change things'));
		const errors: Record<string, string | undefined> = {};
		// What getIsolatableFolders leaves out: folders of another chat, not in Git, or already in a worktree
		for (const [name, args] of Object.entries({
			notListed: { folders: [docs.fsPath] },
			oneNotListed: { folders: [protocol.fsPath, docs.fsPath] },
			empty: { folders: [] },
			noArguments: {},
			relative: { folders: ['work/protocol'] },
			duplicate: { folders: [protocol.fsPath, protocol.fsPath] },
			extraProperty: { folders: [protocol.fsPath], workspace: '/other' },
		})) {
			errors[name] = await errorOf(host.executeTool(main, SessionServerToolName.IsolateSession, args));
		}
		setIsolatable({ folders: [] });
		errors.nothingToMove = await errorOf(host.executeTool(main, SessionServerToolName.IsolateSession, { folders: [protocol.fsPath] }));

		const usage = `isolate_session takes 'folders': the absolute paths, each once, of folders of this chat that are local Git checkouts not in a worktree yet, and no other arguments.`;
		const canPass = `Folders you can pass: ${JSON.stringify(protocol.fsPath)}.`;
		assert.deepStrictEqual({ errors, calls, folderCalls }, {
			errors: {
				notListed: `${usage} Not a folder you can pass: ${JSON.stringify(docs.fsPath)}. ${canPass}`,
				oneNotListed: `${usage} Not a folder you can pass: ${JSON.stringify(docs.fsPath)}. ${canPass}`,
				empty: `${usage} ${canPass}`,
				noArguments: `${usage} ${canPass}`,
				relative: `${usage} ${canPass}`,
				duplicate: `${usage} ${canPass}`,
				extraProperty: `${usage} ${canPass}`,
				nothingToMove: `${usage} Not a folder you can pass: ${JSON.stringify(protocol.fsPath)}. This chat has no folder to move into a worktree.`,
			},
			calls: [],
			folderCalls: [],
		});
	});

	test('does not execute outside a turn or after isolation is no longer available', async () => {
		const { host, session, main, setSupport } = createHarness();
		assert.match(await errorOf(host.executeTool(main, SessionServerToolName.IsolateSession, { folders: [app.fsPath] })) ?? '', /active turn/);
		setSupport(false, false);
		assert.deepStrictEqual(host.getDefinitionsForSession(session), []);
		assert.throws(() => host.executeTool(main, SessionServerToolName.IsolateSession, { folders: [app.fsPath] }), /disabled/);
	});

	test('refreshes tool availability on an existing session instead of pinning initial membership', () => {
		const { stateManager, host, session } = createHarness();
		stateManager.dispatchServerAction(session, { type: ActionType.SessionServerToolsChanged, tools: [] });
		host.advertise(session);
		assert.deepStrictEqual(stateManager.getSessionState(session)?.serverTools?.map(tool => tool.name), [SessionServerToolName.IsolateSession]);
	});

	test('confirms moving one folder or several by their full paths, without showing the raw input', () => {
		const { host, group, main } = createHarness();
		const tool = group.definitions[0];
		assert.deepStrictEqual({
			canConfirm: host.canRequireConfirmation(tool.name),
			confirms: host.requiresConfirmation(main, tool.name),
			parameters: tool.inputSchema,
			one: getServerToolDisplay(tool.name, { folders: [protocol.fsPath] }),
			several: getServerToolDisplay(tool.name, { folders: [protocol.fsPath, docs.fsPath] }),
		}, {
			canConfirm: true,
			confirms: true,
			parameters: {
				type: 'object',
				properties: {
					folders: {
						type: 'array',
						items: { type: 'string' },
						minItems: 1,
						description: 'Absolute paths of this chat\'s folders to move into worktrees of their own: only the shared Git checkouts you are about to change, as listed in the working directories.',
					},
				},
				required: ['folders'],
			},
			one: {
				displayName: 'Move to a New Worktree',
				invocationMessage: 'Requesting a worktree for protocol',
				pastTenseMessage: 'Requested a worktree for protocol',
				confirmationTitle: 'Move to a New Worktree?',
				confirmationMessage: `Move ${protocol.fsPath} to a new worktree for this chat? Your checkout and other chats are left unchanged. Uncommitted edits are not copied, except configured worktree include-files. Skip to keep working where you are.`,
				hideConfirmationInput: true,
			},
			several: {
				displayName: 'Move to a New Worktree',
				invocationMessage: 'Requesting worktrees for 2 folders',
				pastTenseMessage: 'Requested worktrees for 2 folders',
				confirmationTitle: 'Move Folders to New Worktrees?',
				confirmationMessage: `Move 2 folders to new worktrees for this chat: ${protocol.fsPath}, ${docs.fsPath}? Your checkouts and other chats are left unchanged. Uncommitted edits are not copied, except configured worktree include-files. Skip to keep working where you are.`,
				hideConfirmationInput: true,
			},
		});
	});

	test('tells the agent which folders to pass, to follow the confirmation flow and to end the turn', () => {
		const { group } = createHarness();
		const description = group.definitions[0].description!;
		assert.match(description, /Pass only the folders you are about to change that the working directories list as shared Git checkouts/);
		assert.match(description, /before any tool that creates, edits or deletes files or runs commands that change files there/);
		assert.match(description, /Moving the chat's main folder moves the chat to a new worktree; its other folders stay unless you pass them too/);
		assert.match(description, /Not needed for reading, or for folders that are already in a worktree or not in a Git repository/);
		assert.match(description, /other chats and the original checkouts are left unchanged/);
		assert.match(description, /Follow the tool confirmation flow; if the user skips it, nothing moves and you continue where you are/);
		assert.match(description, /final tool call and end the turn/);
		assert.match(description, /Do not poll or repeat the request/);
	});
});
