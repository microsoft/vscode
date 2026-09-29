/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { FileType, IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AgentSession } from '../../common/agent.js';
import type { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatOriginKind, MessageKind, SessionStatus, TurnState, type Turn } from '../../common/state/sessionState.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { AgentHostTelemetryReporter, IAgentHostTelemetryReporter, type IAgentHostWorkspaceSnapshotEvent } from '../../node/agentHostTelemetryReporter.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from '../../node/agentHostTurnTracker.js';
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

/** An in-memory file system that records directory reads and can hold them back. */
class RecordingFileSystemProvider extends InMemoryFileSystemProvider {
	readonly reads: string[] = [];
	private readonly _held = new Map<string, Promise<void>>();

	/** Holds reads of `path` until the returned function is called. */
	hold(path: string): () => void {
		let release!: () => void;
		this._held.set(path, new Promise(resolve => release = resolve));
		return () => release();
	}

	/** Makes reads of `path` fail. */
	fail(path: string): void {
		this._held.set(path, Promise.reject(new Error('EACCES: permission denied')));
		this._held.get(path)!.catch(() => { });
	}

	override async readdir(resource: URI): Promise<[string, FileType][]> {
		this.reads.push(resource.path);
		await this._held.get(resource.path);
		return super.readdir(resource);
	}
}

suite('WorkspaceContextContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const heading = (path: string) => JSON.stringify(URI.file(path).fsPath).slice(1, -1);
	const userMessage = { text: 'Bump the version to 2', origin: { kind: MessageKind.User } } as const;
	teardown(() => sinon.restore());

	async function setupContext(options: { files?: readonly string[]; directories?: readonly string[]; roots?: readonly string[]; provider?: string; worktreePending?: boolean } = {}) {
		const log = store.add(new NullLogService());
		const disk = store.add(new RecordingFileSystemProvider());
		const fileService = store.add(new FileService(log));
		store.add(fileService.registerProvider(Schemas.file, disk));
		for (const path of options.files ?? ['/workspace/meta.json']) {
			await fileService.writeFile(URI.file(path), VSBuffer.fromString(''));
		}
		for (const path of options.directories ?? []) {
			await fileService.createFolder(URI.file(path));
		}
		disk.reads.length = 0;
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
		const telemetry = new AgentHostTelemetryReporter(NullTelemetryService);
		const reported = sinon.spy(telemetry, 'workspaceSnapshotSent');
		const turnTracker = store.add(new AgentHostTurnTracker(telemetry, store.add(new AgentHostClientConnectionService()), log));
		const instantiation = store.add(new InstantiationService(new ServiceCollection(
			[ILogService, log],
			[IAgentHostStateManager, state],
			[IAgentHostWorktreeIsolation, worktreeIsolation],
			[IFileService, fileService],
			[IAgentHostTelemetryReporter, telemetry],
			[IAgentHostTurnTracker, turnTracker],
		), true));
		const service: IAgentHostChatContributions = store.add(new AgentHostChatContributions(log, instantiation));
		store.add(service.registerContribution(WorkspaceContextContribution));
		let turn = 0;
		const activeTurns = new Map<string, string>();
		/** Starts a turn in chat state, as the reducer does for `ChatTurnStarted`; `observe` also runs the dispatched-action hook. */
		const startTurn = (channel: string, observe: boolean) => {
			const turnId = String(++turn);
			const action = { type: ActionType.ChatTurnStarted, turnId, startedAt: new Date(0).toISOString(), message: userMessage } as const;
			state.dispatchServerAction(channel, action);
			activeTurns.set(channel, turnId);
			if (observe) {
				service.didDispatchAction({ channel, session, action });
			}
			return turnId;
		};
		/** Accepts a turn, as a dispatched `ChatTurnStarted` does before the send path runs. */
		const accept = (channel = chat) => startTurn(channel, true);
		/** Hands the chat's active turn to the provider, as the send path does after its final cancellation checks. */
		const dispatch = (channel = chat) => turnTracker.markSendDispatched(channel, activeTurns.get(channel)!);
		/** Ends the chat's active turn, recording it in history and notifying contributions. */
		const endTurn = (channel = chat, reason: 'success' | 'localCommand' | 'cancelled' = 'cancelled') => {
			const turnId = activeTurns.get(channel);
			if (turnId === undefined) {
				return;
			}
			activeTurns.delete(channel);
			const action = reason === 'cancelled' ? { type: ActionType.ChatTurnCancelled, turnId, duration: 0 } as const : { type: ActionType.ChatTurnComplete, turnId, duration: 0 } as const;
			state.dispatchServerAction(channel, action);
			service.didDispatchAction({ channel, session, action });
			service.turnEnd({ session, channel, turnId, reason: { kind: reason } });
		};
		/**
		 * Runs the outgoing-turn contributions for the chat's active turn, starting
		 * one without the dispatched-action hook if none is active. Unless
		 * `dispatchAndComplete` is false, it then dispatches and completes the turn.
		 */
		const send = async (channel = chat, workingDirectories: readonly URI[] | undefined = roots.map(root => URI.parse(root)), dispatchAndComplete = true) => {
			const turnId = activeTurns.get(channel) ?? startTurn(channel, false);
			const result = await service.outgoingTurn({ session, chat: channel, turnId, workingDirectories, message: userMessage });
			if (dispatchAndComplete) {
				dispatch(channel);
				endTurn(channel, 'success');
			}
			return result;
		};
		/** Accepts a turn, lets preparation finish, and sends it. */
		const firstTurn = async (channel = chat, workingDirectories?: readonly URI[], dispatchAndComplete = true) => {
			accept(channel);
			await timeout(0);
			return send(channel, workingDirectories ?? roots.map(root => URI.parse(root)), dispatchAndComplete);
		};
		const addChat = (name: string, origin: Parameters<AgentHostStateManager['addChat']>[2] extends infer O ? O extends { origin?: infer R } ? R : never : never = { kind: ChatOriginKind.User }) => {
			const peer = buildChatUri(session, name);
			state.addChat(session, peer, { title: name, origin });
			return peer;
		};
		const events = (): Omit<IAgentHostWorkspaceSnapshotEvent, 'waitMs'>[] => reported.getCalls().map(call => {
			const { waitMs: _waitMs, ...event } = call.args[0];
			return event;
		});
		return { log, state, service, session, chat, disk, accept, dispatch, send, firstTurn, endTurn, addChat, events, worktreeIsolation };
	}

	const structureOf = (result: { instructions?: readonly string[] }) => result.instructions?.[0].split('```text\n')[1].split('\n```')[0];

	test('adds a sorted file-name tree and preserves the user message', async () => {
		const context = await setupContext({
			files: [
				'/workspace/tests/main.test.ts', '/workspace/src/main.ts', '/workspace/meta.json',
				'/workspace/.env', '/workspace/.git/config', '/workspace/node_modules/pkg/index.js', '/workspace/package-lock.json',
			]
		});
		assert.deepStrictEqual(await context.firstTurn(), {
			message: userMessage,
			instructions: ['<workspace_info>\nInitial workspace structure (file names only):\n```text\n' + heading('/workspace') + '\nmeta.json\nsrc/\n\tmain.ts\ntests/\n\tmain.test.ts\n```\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>'],
		});
	});

	test('lists files that .gitignore excludes, like the classic workspace structure', async () => {
		const context = await setupContext({ files: ['/workspace/.gitignore', '/workspace/vendor/sqlite/sqlite3.c'] });
		assert.strictEqual(structureOf(await context.firstTurn()), heading('/workspace') + '\nvendor/\n\tsqlite/\n\t\tsqlite3.c');
	});

	test('adds context once per chat and suppresses it for populated restored chats', async () => {
		const context = await setupContext();
		const [peer, restored, empty] = ['peer', 'restored', 'empty'].map(name => context.addChat(name));
		const turn: Turn = { id: 'old', state: TurnState.Complete, message: { text: 'old', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined };
		await context.service.hydrateTurns({ session: context.session, chat: restored }, [turn]);
		await context.service.hydrateTurns({ session: context.session, chat: empty }, []);
		const results = [];
		for (const chat of [context.chat, context.chat, peer, peer, restored, empty]) {
			results.push(!!(await context.firstTurn(chat)).instructions?.length);
		}
		assert.deepStrictEqual({ results, rootReads: context.disk.reads.filter(path => path === '/workspace').length }, { results: [true, false, true, false, false, true], rootReads: 3 });
	});

	test('preserves multiple roots without walking overlapping roots twice', async () => {
		const context = await setupContext({
			roots: ['/workspace', '/workspace/src', '/workspace', '/other'].map(path => URI.file(path).toString()),
			files: ['/workspace/package.json', '/workspace/src/main.ts', '/other/meta.json'],
		});
		const result = await context.firstTurn();
		assert.deepStrictEqual({
			rootReads: context.disk.reads.filter(path => path === '/workspace' || path === '/other'),
			structure: structureOf(result),
		}, { rootReads: ['/workspace', '/other'], structure: heading('/workspace') + '\npackage.json\nsrc/\n\tmain.ts\n\n' + heading('/other') + '\nmeta.json' });
	});

	test('reads only the directories whose names fit the budget', async () => {
		const context = await setupContext({
			files: [
				'/workspace/meta.json', '/workspace/z-last/test.ts',
				...Array.from({ length: 300 }, (_, i) => `/workspace/a-large/file-${String(i).padStart(4, '0')}.ts`),
				...Array.from({ length: 50 }, (_, i) => `/workspace/a-large/nested-${i}/deep.ts`),
			]
		});
		const structure = structureOf(await context.firstTurn());
		assert.ok(structure);
		assert.deepStrictEqual({
			bounded: structure.length <= 2000,
			manifest: structure.includes('meta.json'),
			lastDirectory: structure.includes('z-last/'),
			truncated: structure.endsWith('...'),
			nestedRead: context.disk.reads.some(path => path.includes('/nested-')),
		}, { bounded: true, manifest: true, lastDirectory: true, truncated: true, nestedRead: false });
	});

	test('uses the turn\'s resolved working directories instead of session state', async () => {
		const context = await setupContext({ files: ['/worktrees/agent/meta.json'] });
		const result = await context.send(context.chat, [URI.file('/worktrees/agent')]);
		assert.deepStrictEqual({ structure: structureOf(result), events: context.events() }, {
			structure: heading('/worktrees/agent') + '\nmeta.json',
			events: [{ preparation: 'startedAtSend', rootCount: 1, includedRootCount: 1, pendingRootCount: 0, emptyRootCount: 0, failedRootCount: 0, snapshotLength: structureOf(result)!.length }],
		});
	});

	test('prepares when a first turn is accepted and sends the prepared snapshot', async () => {
		const context = await setupContext();
		context.accept();
		await timeout(0);
		const readsBeforeSend = [...context.disk.reads];
		const result = await context.send();
		assert.deepStrictEqual({ readsBeforeSend, readsAtSend: context.disk.reads.length - readsBeforeSend.length, snapshot: !!result.instructions?.length, preparation: context.events()[0].preparation }, {
			readsBeforeSend: ['/workspace'], readsAtSend: 0, snapshot: true, preparation: 'prepared',
		});
	});

	test('does not prepare for a rejected turn start', async () => {
		const context = await setupContext();
		context.service.didDispatchAction({
			channel: context.chat, session: context.session, rejectionReason: 'readOnly',
			action: { type: ActionType.ChatTurnStarted, turnId: '1', startedAt: new Date(0).toISOString(), message: userMessage },
		});
		await timeout(0);
		assert.deepStrictEqual(context.disk.reads, []);
	});

	test('restarts preparation when the turn runs in different directories', async () => {
		const context = await setupContext({ files: ['/workspace/meta.json', '/worktrees/agent/main.ts'] });
		context.accept();
		await timeout(0);
		const result = await context.send(context.chat, [URI.file('/worktrees/agent')]);
		assert.deepStrictEqual({ structure: structureOf(result), preparation: context.events()[0].preparation }, {
			structure: heading('/worktrees/agent') + '\nmain.ts', preparation: 'directoriesChanged',
		});
	});

	test('prepares a pending session\'s snapshot in its worktree as soon as the worktree exists', async () => {
		const context = await setupContext({ worktreePending: true, files: ['/workspace/meta.json', '/worktrees/agent/main.ts'] });
		const worktree = URI.file('/worktrees/agent');
		context.accept();
		const whilePending = [...context.disk.reads];
		context.worktreeIsolation.resolve(AgentSession.id(context.session), worktree);
		await timeout(0);
		const result = await context.send(context.chat, [worktree]);
		assert.deepStrictEqual({ whilePending, structure: structureOf(result), preparation: context.events()[0].preparation }, {
			whilePending: [], structure: heading('/worktrees/agent') + '\nmain.ts', preparation: 'prepared',
		});
	});

	test('prepares every first turn that was waiting for the same worktree', async () => {
		const context = await setupContext({ worktreePending: true, files: ['/worktrees/agent/meta.json'] });
		const worktree = URI.file('/worktrees/agent');
		const peer = context.addChat('peer');
		context.accept();
		context.accept(peer);
		context.worktreeIsolation.resolve(AgentSession.id(context.session), worktree);
		await timeout(0);
		const results = [await context.send(context.chat, [worktree]), await context.send(peer, [worktree])];
		assert.deepStrictEqual(results.map(result => !!result.instructions?.length), [true, true]);
	});

	test('waits a bounded time for unfinished roots and keeps the roots that are ready', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const context = await setupContext({ roots: ['/workspace', '/other'].map(path => URI.file(path).toString()), files: ['/workspace/meta.json', '/other/meta.json'] });
		context.disk.hold('/other');
		const info = sinon.spy(context.log, 'info');
		const started = Date.now();
		const result = await context.firstTurn();
		assert.deepStrictEqual({
			waitedMs: Date.now() - started,
			structure: structureOf(result),
			event: context.events()[0],
			logged: info.getCalls().some(call => String(call.args[0]).includes(`pending: ${URI.file('/other').fsPath}`)),
		}, {
			waitedMs: 1000,
			structure: heading('/workspace') + '\nmeta.json',
			event: { preparation: 'prepared', rootCount: 2, includedRootCount: 1, pendingRootCount: 1, emptyRootCount: 0, failedRootCount: 0, snapshotLength: (heading('/workspace') + '\nmeta.json').length },
			logged: true,
		});
	}));

	test('includes a root that finishes within the wait', async () => {
		const context = await setupContext();
		const release = context.disk.hold('/workspace');
		context.accept();
		const sent = context.send();
		await timeout(10);
		release();
		assert.strictEqual(structureOf(await sent), heading('/workspace') + '\nmeta.json');
	});

	test('stops walking when its turn ends or its chat or session is removed', async () => {
		const context = await setupContext({ files: ['/workspace/src/main.ts'] });
		const [ended, removed] = ['ended', 'removed'].map(name => context.addChat(name));
		const release = context.disk.hold('/workspace');
		context.accept(ended);
		context.accept(removed);
		context.accept();
		context.endTurn(ended);
		context.service.didDispatchAction({ channel: context.session, session: context.session, action: { type: ActionType.SessionChatRemoved, chat: removed } });
		context.state.removeSession(context.session);
		release();
		await timeout(10);
		assert.deepStrictEqual(context.disk.reads, ['/workspace', '/workspace', '/workspace']);
	});

	test('keeps the snapshot for the first provider turn after a local command', async () => {
		const context = await setupContext();
		context.accept();
		context.endTurn(context.chat, 'localCommand');
		const historyBeforeProviderTurn = context.state.getChatState(context.chat)?.turns.map(turn => turn.id);
		const result = await context.firstTurn();
		assert.deepStrictEqual({
			historyBeforeProviderTurn,
			snapshot: !!result.instructions?.length,
			reported: context.events().length,
		}, { historyBeforeProviderTurn: ['1'], snapshot: true, reported: 1 });
	});

	test('keeps and does not report a snapshot whose turn never reached the provider', async () => {
		const context = await setupContext();
		const cancelled = await context.firstTurn(context.chat, undefined, false);
		const reportedBeforeDispatch = context.events().length;
		context.endTurn(context.chat, 'cancelled');
		const next = await context.firstTurn();
		assert.deepStrictEqual({
			cancelled: !!cancelled.instructions?.length,
			reportedBeforeDispatch,
			next: !!next.instructions?.length,
			reported: context.events().length,
		}, { cancelled: true, reportedBeforeDispatch: 0, next: true, reported: 1 });
	});

	test('consumes the snapshot once its turn reaches the provider, even if the turn is then cancelled', async () => {
		const context = await setupContext();
		await context.firstTurn(context.chat, undefined, false);
		context.dispatch();
		context.endTurn(context.chat, 'cancelled');
		const next = await context.firstTurn();
		assert.deepStrictEqual({ next, reported: context.events().length }, { next: { message: userMessage }, reported: 1 });
	});

	test('ignores a cancelled send that finishes after the next turn started', async () => {
		const context = await setupContext();
		const release = context.disk.hold('/workspace');
		context.accept();
		// The cancelled turn's send is still waiting for its snapshot when the next turn starts.
		const staleSend = context.send(context.chat, undefined, false);
		context.endTurn(context.chat, 'cancelled');
		context.accept();
		release();
		const stale = await staleSend;
		await timeout(0);
		const next = await context.send();
		const expected = heading('/workspace') + '\nmeta.json';
		assert.deepStrictEqual({ stale, next: structureOf(next), events: context.events() }, {
			stale: { message: userMessage },
			next: expected,
			events: [{ preparation: 'prepared', rootCount: 1, includedRootCount: 1, pendingRootCount: 0, emptyRootCount: 0, failedRootCount: 0, snapshotLength: expected.length }],
		});
	});

	test('does not treat a restored chat as new before its history is loaded', async () => {
		const context = await setupContext();
		const restored = buildChatUri(context.session, 'restored');
		const previousTurn: Turn = { id: 'old', state: TurnState.Complete, message: { text: 'old', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined };
		context.state.registerRestoredChatSummary(context.session, restored, {
			title: 'Restored',
			origin: { kind: ChatOriginKind.User },
			resolver: async () => ({ turns: [previousTurn] }),
		});
		const unresolved = await context.firstTurn(restored);
		await context.state.resolveChatState(restored);
		const resolved = await context.firstTurn(restored);
		assert.deepStrictEqual({ unresolved, resolved, reads: context.disk.reads, events: context.events() }, {
			unresolved: { message: userMessage }, resolved: { message: userMessage }, reads: [], events: [],
		});
	});

	test('skips chats that continue or were delegated from another conversation', async () => {
		const context = await setupContext();
		const origins = {
			fork: { kind: ChatOriginKind.Fork, chat: context.chat, turnId: 'source' },
			sideChat: { kind: ChatOriginKind.SideChat, chat: context.chat, turnId: 'source' },
			tool: { kind: ChatOriginKind.Tool, chat: context.chat, toolCallId: 'call' },
		} as const;
		const results: Record<string, boolean> = {};
		for (const [name, origin] of Object.entries(origins)) {
			results[name] = !!(await context.firstTurn(context.addChat(name, origin))).instructions?.length;
		}
		assert.deepStrictEqual({ results, reads: context.disk.reads }, { results: { fork: false, sideChat: false, tool: false }, reads: [] });
	});

	test('quotes control characters and uses a safe Markdown fence', async () => {
		const context = await setupContext({ files: ['/workspace/```', '/workspace/line\nname.ts'] });
		const instruction = (await context.firstTurn()).instructions?.[0];
		assert.ok(instruction);
		assert.deepStrictEqual({ safeFence: instruction.includes('````text\n'), escapedName: instruction.includes('line\\nname.ts') }, { safeFence: true, escapedName: true });
	});

	for (const options of [{ roots: [] }, { roots: ['vscode-remote://host/workspace'] }, { files: [], directories: ['/workspace'] }, { provider: 'claude' }]) {
		test(`does not add unavailable context: ${JSON.stringify(options)}`, async () => {
			const context = await setupContext(options);
			assert.deepStrictEqual(await context.firstTurn(), { message: userMessage });
		});
	}

	test('does not add context to a workspace-less turn', async () => {
		const context = await setupContext({ roots: [] });
		assert.deepStrictEqual({ result: await context.firstTurn(context.chat, []), reads: context.disk.reads, events: context.events() }, {
			result: { message: userMessage }, reads: [], events: [],
		});
	});

	test('keeps healthy roots when another root cannot be read', async () => {
		const context = await setupContext({ roots: ['/workspace', '/missing'].map(path => URI.file(path).toString()), directories: ['/missing'] });
		context.disk.fail('/missing');
		const warn = sinon.spy(context.log, 'warn');
		const result = await context.firstTurn();
		assert.deepStrictEqual({ structure: structureOf(result), warnings: warn.callCount, failed: context.events()[0].failedRootCount }, {
			structure: heading('/workspace') + '\nmeta.json', warnings: 1, failed: 1,
		});
	});

	test('does not list Git storage directories as source trees', async () => {
		const context = await setupContext({
			roots: ['/repos/bare.git', '/repos/shared/worktrees/checkout', '/repos/app/.git', '/repos/checkout'].map(path => URI.file(path).toString()),
			files: [
				'/repos/bare.git/HEAD', '/repos/bare.git/config', '/repos/bare.git/refs/heads/main',
				'/repos/shared/HEAD', '/repos/shared/objects/pack/p.pack', '/repos/shared/refs/heads/main',
				'/repos/shared/worktrees/checkout/HEAD', '/repos/shared/worktrees/checkout/gitdir', '/repos/shared/worktrees/checkout/refs/heads/x',
				'/repos/app/.git/HEAD',
				'/repos/checkout/HEAD', '/repos/checkout/.git', '/repos/checkout/main.ts',
			],
			directories: ['/repos/bare.git/objects'],
		});
		await context.disk.writeFile(URI.file('/repos/shared/worktrees/checkout/commondir'), VSBuffer.fromString('../..\n').buffer, { create: true, overwrite: true, unlock: false, atomic: false });
		const result = await context.firstTurn();
		assert.deepStrictEqual({ structure: structureOf(result), empty: context.events()[0].emptyRootCount }, {
			structure: heading('/repos/checkout') + '\nHEAD\nmain.ts', empty: 3,
		});
	});
});
