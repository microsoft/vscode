/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentSession } from '../../common/agent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
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
	teardown(() => sinon.restore());

	function setupContext(options: { files?: readonly string[]; roots?: readonly string[]; provider?: string; truncated?: boolean; worktreePending?: boolean } = {}) {
		const log = store.add(new NullLogService());
		const worktreeIsolation = store.add(new TestWorktreeIsolation(options.worktreePending ?? false));
		const state = store.add(new AgentHostStateManager(log));
		const session = 'agent-host-session://workspace-context';
		const chat = buildDefaultChatUri(session);
		state.createSession({
			resource: session,
			provider: options.provider ?? 'copilotcli',
			title: 'Workspace context',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [URI.file('/workspace').toString()],
		});
		const roots = (options.roots ?? [URI.file('/workspace').toString()]).map(root => URI.parse(root));
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
		const send = (channel = chat, { workingDirectories }: { workingDirectories?: readonly URI[] } = { workingDirectories: roots }) => service.outgoingTurn({
			session, chat: channel, turnId: String(++turn), workingDirectories,
			message: { text: 'Bump the version to 2', origin: { kind: MessageKind.User } },
		});
		const turnStarted = (channel = chat) => service.didApplyClientAction({
			channel, session, clientId: 'client',
			clientContext: createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow),
			action: { type: ActionType.ChatTurnStarted, turnId: String(turn + 1), startedAt: new Date(0).toISOString(), message: { text: 'Bump the version to 2', origin: { kind: MessageKind.User } } },
		});
		const turnEnded = (channel = chat) => service.turnEnd({ session, channel, turnId: String(turn), reason: { kind: 'cancelled' } });
		return { log, state, service, session, chat, enumerate, send, turnStarted, turnEnded, worktreeIsolation };
	}

	test('adds a sorted file-name tree and preserves the user message', async () => {
		const context = setupContext({
			files: [
				'/workspace/tests/main.test.ts', '/workspace/src/main.ts', '/workspace/meta.json',
				'/workspace/.env', '/workspace/.git/config', '/workspace/node_modules/pkg/index.js', '/other/private.txt',
			]
		});
		assert.deepStrictEqual(await context.send(), {
			message: { text: 'Bump the version to 2', origin: { kind: MessageKind.User } },
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
			results.push(!!(await context.send(chat)).instructions?.length);
		}
		assert.deepStrictEqual({ results, enumerations: context.enumerate.callCount }, { results: [true, false, true, false, false, true], enumerations: 3 });
	});

	test('preserves multiple roots without enumerating overlapping roots twice', async () => {
		const context = setupContext({
			roots: ['/workspace', '/workspace/src', '/workspace', '/other'].map(path => URI.file(path).toString()),
			files: ['/workspace/package.json', '/workspace/src/main.ts', '/other/meta.json'],
		});
		const result = await context.send();
		assert.deepStrictEqual({
			roots: context.enumerate.getCalls().map(call => call.args[0].path),
			structure: result.instructions?.[0].split('```text\n')[1].split('\n```')[0],
		}, { roots: ['/workspace', '/other'], structure: workspaceHeading + '\npackage.json\nsrc/\n\tmain.ts\n\n' + otherHeading + '\nmeta.json' });
	});

	test('uses the turn\'s resolved working directories instead of session state', async () => {
		const context = setupContext({ files: ['/worktrees/agent/meta.json'] });
		const worktree = URI.file('/worktrees/agent');
		const result = await context.send(context.chat, { workingDirectories: [worktree] });
		assert.deepStrictEqual({
			roots: context.enumerate.getCalls().map(call => call.args[0].path),
			structure: result.instructions?.[0].split('```text\n')[1].split('\n```')[0],
		}, { roots: ['/worktrees/agent'], structure: JSON.stringify(worktree.fsPath).slice(1, -1) + '\nmeta.json' });
	});

	/** Resolves with each root as soon as its enumeration starts, answering with `files` (or never, when omitted). */
	function recordEnumerations(context: ReturnType<typeof setupContext>, files?: (root: URI) => readonly URI[]) {
		const started: { root: string; token: CancellationToken }[] = [];
		const onDidStart = store.add(new Emitter<void>());
		context.enumerate.callsFake((root, token) => {
			started.push({ root: root.path, token });
			onDidStart.fire();
			return files ? Promise.resolve({ files: files(root), isTruncated: false }) : new Promise(() => { });
		});
		const next = () => Event.toPromise(onDidStart.event);
		return { started, next };
	}

	test('prepares the snapshot when a first turn is accepted and sends the prepared result', async () => {
		const context = setupContext();
		const enumerations = recordEnumerations(context, root => [URI.joinPath(root, 'meta.json')]);
		const started = enumerations.next();
		context.turnStarted();
		await started;
		const result = await context.send();
		assert.deepStrictEqual({ roots: enumerations.started.map(e => e.root), snapshot: !!result.instructions?.length }, {
			roots: ['/workspace'], snapshot: true,
		});
	});

	test('prepares a pending session\'s snapshot in its worktree as soon as the worktree exists', async () => {
		const context = setupContext({ worktreePending: true });
		const enumerations = recordEnumerations(context, root => [URI.joinPath(root, 'meta.json')]);
		const worktree = URI.file('/worktrees/agent');
		context.turnStarted();
		const started = enumerations.next();
		context.worktreeIsolation.resolve(AgentSession.id(context.session), worktree);
		await started;
		const result = await context.send(context.chat, { workingDirectories: [worktree] });
		assert.deepStrictEqual({
			roots: enumerations.started.map(e => e.root),
			structure: result.instructions?.[0].split('```text\n')[1].split('\n```')[0],
		}, {
			roots: ['/worktrees/agent'],
			structure: JSON.stringify(worktree.fsPath).slice(1, -1) + '\nmeta.json',
		});
	});

	test('stops preparation when the turn ends or the send stops waiting', async () => {
		const context = setupContext();
		const enumerations = recordEnumerations(context);
		const [running, unstarted] = ['running', 'unstarted'].map(name => {
			const chat = buildChatUri(context.session, name);
			context.state.addChat(context.session, chat, { title: name, origin: { kind: ChatOriginKind.User } });
			return chat;
		});
		const runningStarted = enumerations.next();
		context.turnStarted(running);
		await runningStarted;
		context.turnEnded(running);
		context.turnStarted(unstarted);
		context.turnEnded(unstarted);
		const sendStarted = enumerations.next();
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const sent = context.send();
			await sendStarted;
			return sent;
		});
		assert.deepStrictEqual(enumerations.started.map(e => ({ root: e.root, cancelled: e.token.isCancellationRequested })), [
			{ root: '/workspace', cancelled: true },
			{ root: '/workspace', cancelled: true },
			{ root: '/workspace', cancelled: true },
		]);
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
			context.turnStarted(chat);
			results[name] = !!(await context.send(chat)).instructions?.length;
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
		const instruction = (await context.send()).instructions?.[0];
		assert.ok(instruction);
		const structure = instruction.split('```text\n')[1].split('\n```')[0];
		assert.deepStrictEqual({ bounded: structure.length <= 2000, manifest: structure.includes('meta.json'), lastDirectory: structure.includes('z-last/'), truncated: structure.endsWith('...') }, {
			bounded: true, manifest: true, lastDirectory: true, truncated: true,
		});
	});

	test('marks an incomplete enumeration as truncated', async () => {
		const context = setupContext({ truncated: true });
		assert.ok((await context.send()).instructions?.[0].includes('meta.json\n...\n```'));
	});

	test('quotes control characters and uses a safe Markdown fence', async () => {
		const context = setupContext({ files: ['/workspace/```', '/workspace/line\nname.ts'] });
		const instruction = (await context.send()).instructions?.[0];
		assert.ok(instruction);
		assert.deepStrictEqual({ safeFence: instruction.includes('````text\n'), escapedName: instruction.includes('line\\nname.ts') }, { safeFence: true, escapedName: true });
	});

	for (const options of [{ roots: [] }, { roots: ['vscode-remote://host/workspace'] }, { files: [] }, { provider: 'claude' }]) {
		test(`does not add unavailable context: ${JSON.stringify(options)}`, async () => {
			const context = setupContext(options);
			assert.deepStrictEqual(await context.send(), { message: { text: 'Bump the version to 2', origin: { kind: MessageKind.User } } });
		});
	}

	test('does not add context to a workspace-less turn', async () => {
		const context = setupContext();
		assert.deepStrictEqual({ result: await context.send(context.chat, {}), enumerations: context.enumerate.callCount }, {
			result: { message: { text: 'Bump the version to 2', origin: { kind: MessageKind.User } } },
			enumerations: 0,
		});
	});

	test('logs enumeration errors without blocking the user message', async () => {
		const context = setupContext();
		context.enumerate.rejects(new Error('directory unavailable'));
		const warn = sinon.spy(context.log, 'warn');
		const result = await context.send();
		assert.deepStrictEqual({ text: result.message.text, instructions: result.instructions, warned: warn.calledOnce }, {
			text: 'Bump the version to 2', instructions: undefined, warned: true,
		});
	});

	test('bounds the wait for a slow filesystem', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const context = setupContext();
		context.enumerate.callsFake((_root, token) => new Promise((_resolve, reject) => {
			const listener = token.onCancellationRequested(() => {
				listener.dispose();
				reject(new CancellationError());
			});
			store.add(listener);
		}));
		const started = Date.now();
		assert.deepStrictEqual(await context.send(), { message: { text: 'Bump the version to 2', origin: { kind: MessageKind.User } } });
		assert.strictEqual(Date.now() - started, 1000);
	}));

	test('keeps the roots that are ready when another root misses the deadline', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const context = setupContext({ roots: ['/workspace', '/other'].map(path => URI.file(path).toString()) });
		context.enumerate.callsFake((root, token) => root.path === '/workspace'
			? Promise.resolve({ files: [URI.file('/workspace/meta.json')], isTruncated: false })
			: new Promise((_resolve, reject) => {
				const listener = token.onCancellationRequested(() => {
					listener.dispose();
					reject(new CancellationError());
				});
				store.add(listener);
			}));
		const error = sinon.spy(context.log, 'error');
		const result = await context.send();
		assert.deepStrictEqual({
			structure: result.instructions?.[0].split('```text\n')[1].split('\n```')[0],
			loggedError: error.called,
		}, { structure: workspaceHeading + '\nmeta.json', loggedError: false });
	}));
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
		const result = await context.send();
		assert.deepStrictEqual({
			structure: result.instructions?.[0].split('```text\n')[1].split('\n```')[0],
			warnings: warn.callCount,
			errors: error.callCount,
		}, { structure: workspaceHeading + '\nmeta.json', warnings: 1, errors: 0 });
	});
});
