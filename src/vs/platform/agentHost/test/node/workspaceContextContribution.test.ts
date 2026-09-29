/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { timeout } from '../../../../base/common/async.js';
import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentSession } from '../../common/agent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import type { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatOriginKind, MessageKind, SessionStatus, TurnState, type Turn } from '../../common/state/sessionState.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostWorkspaceFiles } from '../../node/agentHostWorkspaceFiles.js';
import { WorkspaceContextContribution } from '../../node/chatContributions/workspaceContext/workspaceContextContribution.js';
import { IAgentHostWorktreeIsolation, NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';

class TestWorktreeIsolation extends NullAgentHostWorktreeIsolation {
	private readonly _onDidChangePending = new Emitter<string>();
	override readonly onDidChangeWorkingDirectoryPending = this._onDidChangePending.event;
	private _resolved: URI | undefined;

	constructor(private _pending: boolean) {
		super();
	}

	override isWorkingDirectoryPending(): boolean {
		return this._pending;
	}

	override getResolvedWorktree(): URI | undefined {
		return this._resolved;
	}

	/** Mirrors `resolveOnFirstSend`, which clears the pending marker once the worktree exists. */
	resolve(sessionId: string, worktree: URI): void {
		this._pending = false;
		this._resolved = worktree;
		this._onDidChangePending.fire(sessionId);
	}

	dispose(): void {
		this._onDidChangePending.dispose();
	}
}

suite('WorkspaceContextContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspaceHeading = JSON.stringify(URI.file('/workspace').fsPath).slice(1, -1);
	const otherHeading = JSON.stringify(URI.file('/other').fsPath).slice(1, -1);
	const userMessage = { text: 'Bump the version to 2', origin: { kind: MessageKind.User } } as const;
	teardown(() => sinon.restore());

	function setupContext(options: { files?: readonly string[]; roots?: readonly string[]; provider?: string; truncated?: boolean; worktreePending?: boolean } = {}) {
		const log = store.add(new NullLogService());
		const worktreeIsolation = store.add(new TestWorktreeIsolation(options.worktreePending ?? false));
		const state = store.add(new AgentHostStateManager(log));
		const session = 'agent-host-session://workspace-context';
		const chat = buildDefaultChatUri(session);
		const roots = options.roots ?? [URI.file('/workspace').toString()];
		state.createSession({
			resource: session,
			provider: options.provider ?? 'copilotcli',
			title: 'Workspace context',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [...roots],
		});
		const instantiation = store.add(new InstantiationService(new ServiceCollection(
			[ILogService, log],
			[IAgentHostStateManager, state],
			[IAgentHostWorktreeIsolation, worktreeIsolation],
		), true));
		const service: IAgentHostChatContributions = store.add(new AgentHostChatContributions(log, instantiation));
		store.add(service.registerContribution(WorkspaceContextContribution));
		const enumerate = sinon.stub(AgentHostWorkspaceFiles.prototype, 'enumerate').resolves({
			files: (options.files ?? ['/workspace/meta.json']).map(path => URI.file(path)),
			isTruncated: options.truncated ?? false,
		});
		let turn = 0;
		/** Accepts a turn, as the client's `ChatTurnStarted` does before the send path runs. */
		const accept = (channel = chat) => service.didApplyClientAction({
			channel, session, clientId: 'client',
			clientContext: createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow),
			action: { type: ActionType.ChatTurnStarted, turnId: String(turn + 1), startedAt: new Date(0).toISOString(), message: userMessage },
		});
		/** Runs the outgoing-turn contributions for the directories the provider will run in. */
		const send = (channel = chat, workingDirectories: readonly URI[] | undefined = roots.map(root => URI.parse(root))) => service.outgoingTurn({
			session, chat: channel, turnId: String(++turn), workingDirectories, message: userMessage,
		});
		/** Accepts a turn, lets preparation finish, and sends it. */
		const firstTurn = async (channel = chat, workingDirectories?: readonly URI[]) => {
			accept(channel);
			await timeout(0);
			return workingDirectories ? send(channel, workingDirectories) : send(channel);
		};
		const endTurn = (channel = chat) => service.turnEnd({ session, channel, turnId: String(turn), reason: { kind: 'cancelled' } });
		return { log, state, service, session, chat, enumerate, accept, send, firstTurn, endTurn, worktreeIsolation };
	}

	const structureOf = (result: { instructions?: readonly string[] }) => result.instructions?.[0].split('```text\n')[1].split('\n```')[0];

	/** Records each enumeration as it starts, answering with `files` (or never, when omitted). */
	function recordEnumerations(context: ReturnType<typeof setupContext>, files?: (root: URI) => readonly URI[]) {
		const started: { root: string; token: CancellationToken }[] = [];
		context.enumerate.callsFake((root, token) => {
			started.push({ root: root.path, token });
			return files ? Promise.resolve({ files: files(root), isTruncated: false }) : new Promise(() => { });
		});
		return started;
	}

	test('adds a sorted file-name tree and preserves the user message', async () => {
		const context = setupContext({
			files: [
				'/workspace/tests/main.test.ts', '/workspace/src/main.ts', '/workspace/meta.json',
				'/workspace/.env', '/workspace/.git/config', '/workspace/node_modules/pkg/index.js', '/other/private.txt',
			]
		});
		assert.deepStrictEqual(await context.firstTurn(), {
			message: userMessage,
			instructions: ['<workspace_info>\nInitial workspace structure (file names only):\n```text\n' + workspaceHeading + '\nmeta.json\nsrc/\n\tmain.ts\ntests/\n\tmain.test.ts\n```\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>'],
		});
	});

	test('adds context once per chat and suppresses it for populated restored chats', async () => {
		const context = setupContext();
		const peer = buildChatUri(context.session, 'peer');
		const restored = buildChatUri(context.session, 'restored');
		const empty = buildChatUri(context.session, 'empty');
		for (const chat of [peer, restored, empty]) {
			context.state.addChat(context.session, chat, { title: chat, origin: { kind: ChatOriginKind.User } });
		}
		const turn: Turn = { id: 'old', state: TurnState.Complete, message: { text: 'old', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined };
		await context.service.hydrateTurns({ session: context.session, chat: restored }, [turn]);
		await context.service.hydrateTurns({ session: context.session, chat: empty }, []);
		const results = [];
		for (const chat of [context.chat, context.chat, peer, peer, restored, empty]) {
			results.push(!!(await context.firstTurn(chat)).instructions?.length);
		}
		assert.deepStrictEqual({ results, enumerations: context.enumerate.callCount }, { results: [true, false, true, false, false, true], enumerations: 3 });
	});

	test('preserves multiple roots without enumerating overlapping roots twice', async () => {
		const context = setupContext({
			roots: ['/workspace', '/workspace/src', '/workspace', '/other'].map(path => URI.file(path).toString()),
			files: ['/workspace/package.json', '/workspace/src/main.ts', '/other/meta.json'],
		});
		const result = await context.firstTurn();
		assert.deepStrictEqual({
			roots: context.enumerate.getCalls().map(call => call.args[0].path),
			structure: structureOf(result),
		}, { roots: ['/workspace', '/other'], structure: workspaceHeading + '\npackage.json\nsrc/\n\tmain.ts\n\n' + otherHeading + '\nmeta.json' });
	});

	test('prepares a pending session\'s snapshot in its worktree as soon as the worktree exists', async () => {
		const context = setupContext({ worktreePending: true });
		const started = recordEnumerations(context, root => [URI.joinPath(root, 'meta.json')]);
		const worktree = URI.file('/worktrees/agent');
		context.accept();
		const whilePending = started.length;
		context.worktreeIsolation.resolve(AgentSession.id(context.session), worktree);
		await timeout(0);
		const result = await context.send(context.chat, [worktree]);
		assert.deepStrictEqual({ whilePending, roots: started.map(e => e.root), structure: structureOf(result) }, {
			whilePending: 0,
			roots: ['/worktrees/agent'],
			structure: JSON.stringify(worktree.fsPath).slice(1, -1) + '\nmeta.json',
		});
	});

	test('prepares every first turn that was waiting for the same worktree', async () => {
		const context = setupContext({ worktreePending: true });
		const started = recordEnumerations(context, root => [URI.joinPath(root, 'meta.json')]);
		const peer = buildChatUri(context.session, 'peer');
		context.state.addChat(context.session, peer, { title: 'Peer', origin: { kind: ChatOriginKind.User } });
		context.accept();
		context.accept(peer);
		context.worktreeIsolation.resolve(AgentSession.id(context.session), URI.file('/worktrees/agent'));
		await timeout(0);
		const results = [await context.send(context.chat, [URI.file('/worktrees/agent')]), await context.send(peer, [URI.file('/worktrees/agent')])];
		assert.deepStrictEqual({ roots: started.map(e => e.root), snapshots: results.map(result => !!result.instructions?.length) }, {
			roots: ['/worktrees/agent', '/worktrees/agent'], snapshots: [true, true],
		});
	});

	test('builds a large file list in batches that yield instead of blocking the send', async () => {
		const files = Array.from({ length: 5000 }, (_, i) => `/workspace/src/file-${String(i).padStart(4, '0')}.ts`);
		const context = setupContext({ files });
		const peer = buildChatUri(context.session, 'peer');
		context.state.addChat(context.session, peer, { title: 'Peer', origin: { kind: ChatOriginKind.User } });
		context.accept();
		// Drain microtasks only: a synchronous build would have finished by now.
		for (let i = 0; i < 20; i++) {
			await Promise.resolve();
		}
		const whileBuilding = await context.send();
		context.accept(peer);
		await timeout(20);
		const afterBuilding = await context.send(peer);
		assert.deepStrictEqual({ whileBuilding: !!whileBuilding.instructions?.length, afterBuilding: !!afterBuilding.instructions?.length }, {
			whileBuilding: false, afterBuilding: true,
		});
	});

	test('sends only what is already prepared, without waiting', async () => {
		const context = setupContext({ roots: ['/workspace', '/other'].map(path => URI.file(path).toString()) });
		const started: { root: string; token: CancellationToken }[] = [];
		context.enumerate.callsFake((root, token) => {
			started.push({ root: root.path, token });
			return root.path === '/workspace' ? Promise.resolve({ files: [URI.file('/workspace/meta.json')], isTruncated: false }) : new Promise(() => { });
		});
		const result = await context.firstTurn();
		assert.deepStrictEqual({
			structure: structureOf(result),
			cancelled: started.map(e => ({ root: e.root, cancelled: e.token.isCancellationRequested })),
		}, {
			structure: workspaceHeading + '\nmeta.json',
			cancelled: [{ root: '/workspace', cancelled: true }, { root: '/other', cancelled: true }],
		});
	});

	test('does not add a snapshot that was not prepared before the send', async () => {
		const context = setupContext();
		const unaccepted = await context.send();
		const peer = buildChatUri(context.session, 'peer');
		context.state.addChat(context.session, peer, { title: 'Peer', origin: { kind: ChatOriginKind.User } });
		context.accept(peer);
		const stillListing = await context.send(peer);
		assert.deepStrictEqual({ unaccepted, stillListing }, { unaccepted: { message: userMessage }, stillListing: { message: userMessage } });
	});

	test('does not add a snapshot prepared for different directories than the turn runs in', async () => {
		const context = setupContext();
		const started = recordEnumerations(context, root => [URI.joinPath(root, 'meta.json')]);
		const result = await context.firstTurn(context.chat, [URI.file('/worktrees/agent')]);
		assert.deepStrictEqual({ result, cancelled: started.map(e => e.token.isCancellationRequested) }, {
			result: { message: userMessage },
			cancelled: [true],
		});
	});

	test('stops preparation when its turn ends or its chat or session is removed', async () => {
		const context = setupContext();
		const started = recordEnumerations(context);
		const [ended, removed] = ['ended', 'removed'].map(name => {
			const chat = buildChatUri(context.session, name);
			context.state.addChat(context.session, chat, { title: name, origin: { kind: ChatOriginKind.User } });
			return chat;
		});
		context.accept(ended);
		context.accept(removed);
		context.accept();
		context.endTurn(ended);
		context.service.didDispatchAction({ channel: context.session, session: context.session, action: { type: ActionType.SessionChatRemoved, chat: removed } });
		const beforeSessionRemoval = started.map(e => e.token.isCancellationRequested);
		context.state.removeSession(context.session);
		assert.deepStrictEqual({ beforeSessionRemoval, afterSessionRemoval: started.map(e => e.token.isCancellationRequested) }, {
			beforeSessionRemoval: [true, true, false],
			afterSessionRemoval: [true, true, true],
		});
	});

	test('skips chats that continue or were delegated from another conversation', async () => {
		const context = setupContext();
		const origins = {
			fork: { kind: ChatOriginKind.Fork, chat: context.chat, turnId: 'source' },
			sideChat: { kind: ChatOriginKind.SideChat, chat: context.chat, turnId: 'source' },
			tool: { kind: ChatOriginKind.Tool, chat: context.chat, toolCallId: 'call' },
		} as const;
		const results: Record<string, boolean> = {};
		for (const [name, origin] of Object.entries(origins)) {
			const chat = buildChatUri(context.session, name);
			context.state.addChat(context.session, chat, { title: name, origin });
			results[name] = !!(await context.firstTurn(chat)).instructions?.length;
		}
		assert.deepStrictEqual({ results, enumerations: context.enumerate.callCount }, {
			results: { fork: false, sideChat: false, tool: false },
			enumerations: 0,
		});
	});

	test('bounds the snapshot and keeps root-level orientation ahead of deep files', async () => {
		const context = setupContext({
			files: [
				'/workspace/meta.json', '/workspace/z-last/test.ts',
				...Array.from({ length: 1000 }, (_, i) => `/workspace/a-large/file-${String(i).padStart(4, '0')}.ts`),
			]
		});
		const structure = structureOf(await context.firstTurn());
		assert.ok(structure);
		assert.deepStrictEqual({ bounded: structure.length <= 2000, manifest: structure.includes('meta.json'), lastDirectory: structure.includes('z-last/'), truncated: structure.endsWith('...') }, {
			bounded: true, manifest: true, lastDirectory: true, truncated: true,
		});
	});

	test('marks an incomplete enumeration as truncated', async () => {
		const context = setupContext({ truncated: true });
		assert.ok((await context.firstTurn()).instructions?.[0].includes('meta.json\n...\n```'));
	});

	test('quotes control characters and uses a safe Markdown fence', async () => {
		const context = setupContext({ files: ['/workspace/```', '/workspace/line\nname.ts'] });
		const instruction = (await context.firstTurn()).instructions?.[0];
		assert.ok(instruction);
		assert.deepStrictEqual({ safeFence: instruction.includes('````text\n'), escapedName: instruction.includes('line\\nname.ts') }, { safeFence: true, escapedName: true });
	});

	for (const options of [{ roots: [] }, { roots: ['vscode-remote://host/workspace'] }, { files: [] }, { provider: 'claude' }]) {
		test(`does not add unavailable context: ${JSON.stringify(options)}`, async () => {
			const context = setupContext(options);
			assert.deepStrictEqual(await context.firstTurn(), { message: userMessage });
		});
	}

	test('does not add context to a workspace-less turn', async () => {
		const context = setupContext({ roots: [] });
		assert.deepStrictEqual({ result: await context.firstTurn(context.chat, []), enumerations: context.enumerate.callCount }, {
			result: { message: userMessage },
			enumerations: 0,
		});
	});

	test('keeps healthy roots when another root cannot be listed', async () => {
		const context = setupContext({ roots: ['/workspace', '/missing'].map(path => URI.file(path).toString()) });
		context.enumerate.callsFake(async root => {
			if (root.path === '/missing') {
				throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
			}
			return { files: [URI.file('/workspace/meta.json')], isTruncated: false };
		});
		const error = sinon.spy(context.log, 'error');
		const warn = sinon.spy(context.log, 'warn');
		const result = await context.firstTurn();
		assert.deepStrictEqual({ structure: structureOf(result), warnings: warn.callCount, errors: error.callCount }, {
			structure: workspaceHeading + '\nmeta.json', warnings: 1, errors: 0,
		});
	});
});
