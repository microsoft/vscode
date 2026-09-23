/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { buildBranchChangesetUri, buildTurnChangesetUri } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { fromAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { toAgentMergeMessageMeta } from '../../../../../../platform/agentHost/common/meta/agentMergeMessageMeta.js';
import { toAgentWorkspaceContinuationMessageMeta } from '../../../../../../platform/agentHost/common/meta/agentWorkspaceContinuationMeta.js';
import { AgentSubscriptionManager, IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { chatReducer } from '../../../../../../platform/agentHost/common/state/protocol/channels-chat/reducer.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import {
	buildDefaultChatUri,
	ChangesetStatus,
	createActiveTurn,
	createChatState,
	createSessionState,
	MessageKind,
	ResponsePartKind,
	SessionStatus,
	StateComponents,
	ToolCallConfirmationReason,
	ToolCallStatus,
	ToolResultContentType,
	TurnState,
	withMessageRequestHiddenFromTranscript,
	type ChangesetState,
	type ChatState,
	type ComponentToState,
	type ISessionFileDiff,
	type SessionState,
	type ToolCallResponsePart,
	type Turn
} from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { AgentHostResponseFileChangesProvider } from '../../../browser/agentSessions/agentHost/agentHostResponseFileChanges.js';
import { AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES, IChatResponseFileEdit } from '../../../browser/chatResponseFileChangesService.js';

class FakeAgentConnection extends mock<IAgentConnection>() {
	override readonly clientId = 'test-client';

	private readonly _emitters = new Map<string, Emitter<unknown>>();
	private readonly _values = new Map<string, unknown>();
	private readonly _subscriptionCounts = new Map<string, number>();
	private _activeSubscriptions = 0;

	get activeSubscriptions(): number {
		return this._activeSubscriptions;
	}

	setState(resource: string, value: unknown): void {
		this._values.set(resource, value);
		this._emitters.get(resource)?.fire(value);
	}

	getSubscriptionCount(resource: string): number {
		return this._subscriptionCounts.get(resource) ?? 0;
	}

	override getSubscription<T extends StateComponents>(_kind: T, resource: URI, _owner: string): IReference<IAgentSubscription<never>> {
		const key = resource.toString();
		this._subscriptionCounts.set(key, (this._subscriptionCounts.get(key) ?? 0) + 1);
		this._activeSubscriptions++;
		let emitter = this._emitters.get(key);
		if (!emitter) {
			emitter = new Emitter<unknown>();
			this._emitters.set(key, emitter);
		}
		const self = this;
		const sub = {
			get value() { return self._values.get(key); },
			get verifiedValue() { return self._values.get(key); },
			onDidChange: emitter.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		} as unknown as IAgentSubscription<never>;
		const reference = toDisposable(() => this._activeSubscriptions--);
		return { object: sub, dispose: () => reference.dispose() };
	}
}

suite('AgentHostResponseFileChangesProvider', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const backendSession = URI.parse('copilot:/sess-1');
	const authority = 'authority-1';
	const chatResource = URI.parse('agent-host-copilot:/sess-1');

	function turnChangesetUri(turnId: string): string {
		return URI.parse(buildTurnChangesetUri(backendSession.toString(), turnId)).toString();
	}

	function sessionStateWithTurnSupport(): SessionState {
		return {
			changesets: [{ label: 'This Turn', uriTemplate: buildTurnChangesetUri(backendSession.toString(), '{turnId}'), changeKind: 'turn' }],
		} as unknown as SessionState;
	}

	/** As {@link sessionStateWithTurnSupport} but flagged as an adopted legacy Copilot CLI session whose final migrated turn is `lastMigratedTurnId`. */
	function adoptedSessionStateWithTurnSupport(lastMigratedTurnId: string): SessionState {
		return {
			changesets: [{ label: 'This Turn', uriTemplate: buildTurnChangesetUri(backendSession.toString(), '{turnId}'), changeKind: 'turn' }],
			_meta: { ehcliAdopted: true, ehcliLastMigratedTurn: lastMigratedTurnId },
		} as unknown as SessionState;
	}

	function branchChangesetUri(): string {
		return URI.parse(buildBranchChangesetUri(backendSession.toString())).toString();
	}

	function branchFile(path: string, added: number, removed: number): unknown {
		return { id: path, edit: { after: { uri: URI.file(path).toString(), content: { uri: `git-blob:/${path}` } }, diff: { added, removed } } };
	}

	function createProvider(
		conn: IAgentConnection,
		resolveBackendSession: () => URI | undefined = () => backendSession,
		resolveBackendChat?: (sessionResource: URI) => URI | undefined,
	): AgentHostResponseFileChangesProvider {
		return new AgentHostResponseFileChangesProvider(conn, authority, resolveBackendSession, resolveBackendChat, new NullLogService());
	}

	function observe(provider: AgentHostResponseFileChangesProvider, ds: DisposableStore, requestId = 't1') {
		const obs = provider.getChangesForRequest(chatResource, requestId)!;
		let latest: readonly IEditSessionEntryDiff[] = [];
		let runs = 0;
		ds.add(autorun(r => { latest = obs.read(r); runs++; }));
		return { latest: () => latest, runs: () => runs };
	}

	function fileEdit(path: string, added = 1, onRead?: () => void): ISessionFileDiff {
		const uri = URI.file(path).toString();
		return {
			before: { uri, content: { uri: `git-blob:/before${path}` } },
			after: {
				get uri() { onRead?.(); return uri; },
				content: { uri: `git-blob:/after${path}` },
			},
			diff: { added, removed: 0 },
		};
	}

	function toolCallPart(edit: ISessionFileDiff, toolCallId = 'tool'): ToolCallResponsePart {
		return {
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				toolCallId,
				toolName: 'edit_file',
				displayName: 'Edit File',
				invocationMessage: 'Editing file',
				pastTenseMessage: 'Edited file',
				status: ToolCallStatus.Completed,
				success: true,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				content: [{ type: ToolResultContentType.FileEdit, ...edit }],
			},
		};
	}

	function completedTurn(id: string, edit: ISessionFileDiff = fileEdit(`/repo/${id}.ts`)): Turn {
		return {
			id,
			message: { text: 'Edit a file', origin: { kind: MessageKind.User } },
			responseParts: [toolCallPart(edit)],
			state: TurnState.Complete,
			usage: undefined,
		};
	}

	function chatWithTurns(turns: Turn[] = [], activeTurnId = 'active'): ChatState {
		const chat = createChatState({
			resource: buildDefaultChatUri(backendSession.toString()),
			title: 'Chat',
			status: SessionStatus.InProgress,
			modifiedAt: new Date(0).toISOString(),
		});
		const activeTurn = createActiveTurn(activeTurnId, { text: 'Edit a file', origin: { kind: MessageKind.User } }, chat.modifiedAt);
		activeTurn.responseParts = [
			{ kind: ResponsePartKind.Markdown, id: 'text', content: '' },
			{ kind: ResponsePartKind.Reasoning, id: 'reasoning', content: '' },
		];
		return { ...chat, turns, activeTurn };
	}

	function streamText(conn: FakeAgentConnection, chat: ChatState, count = 100): ChatState {
		for (let i = 0; i < count; i++) {
			chat = chatReducer(chat, {
				type: i % 2 === 0 ? ActionType.ChatDelta : ActionType.ChatReasoning,
				turnId: chat.activeTurn!.id,
				partId: i % 2 === 0 ? 'text' : 'reasoning',
				content: 'token',
			});
			conn.setState(chat.resource, chat);
		}
		return chat;
	}

	function createManagedConnection(ds: DisposableStore) {
		const chat = chatWithTurns([
			completedTurn('t1', fileEdit('/repo/t1.ts', 1)),
			completedTurn('t2', fileEdit('/repo/t2.ts', 2)),
			completedTurn('t3', fileEdit('/repo/t3.ts', 3)),
		]);
		const session = createSessionState({
			resource: backendSession.toString(),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: chat.modifiedAt,
			modifiedAt: chat.modifiedAt,
			project: { uri: URI.file('/repo').toString(), displayName: 'Repo' },
		});
		session.changesets = sessionStateWithTurnSupport().changesets;
		const snapshots = new Map<string, SessionState | ChatState | ChangesetState>([
			[backendSession.toString(), session],
			[chat.resource, chat],
			...chat.turns.map((turn): [string, ChangesetState] => [
				turnChangesetUri(turn.id), { status: ChangesetStatus.Computing, files: [] },
			]),
		]);
		const failures = new Set<string>();
		const pending = new Map<string, DeferredPromise<void>>();
		const attempts = new Map<string, number>();
		let sequence = 0;
		const manager = ds.add(new AgentSubscriptionManager('test-client', () => ++sequence, () => { }, async resource => {
			const key = resource.toString();
			attempts.set(key, (attempts.get(key) ?? 0) + 1);
			const wait = pending.get(key);
			if (wait) {
				await wait.p;
			}
			if (failures.has(key)) {
				throw new Error('Temporary subscription failure');
			}
			const state = snapshots.get(key);
			assert.ok(state, `Missing snapshot for ${key}`);
			return { resource: key, state, fromSeq: 0 };
		}, () => { }));
		const connection = new class extends mock<IAgentConnection>() {
			override getSubscription<T extends StateComponents>(kind: T, resource: URI, owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
				return manager.getSubscription<ComponentToState[T]>(kind, resource, owner);
			}
		}();
		return { connection, manager, chat, failures, attempts, pending };
	}

	test('maps per-turn changeset files into entry diffs', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), {
			status: ChangesetStatus.Ready,
			files: [
				{ id: '1', edit: { before: { uri: URI.file('/repo/a.ts').toString(), content: { uri: 'git-blob://a-before' } }, after: { uri: URI.file('/repo/a.ts').toString(), content: { uri: 'git-blob://a-after' } }, diff: { added: 3, removed: 1 } } },
				{ id: '2', edit: { after: { uri: URI.file('/repo/b.ts').toString(), content: { uri: 'git-blob://b-after' } }, diff: { added: 5, removed: 0 } } },
				{ id: '3', edit: { before: { uri: URI.file('/repo/c.ts').toString(), content: { uri: 'git-blob://c-before' } }, diff: { added: 0, removed: 4 } } },
			],
		} satisfies ChangesetState);

		const { latest } = observe(provider, ds);
		assert.deepStrictEqual(latest().map(d => ({
			added: d.added,
			removed: d.removed,
			modified: d.modifiedURI.path,
			// The RHS diff content is the frozen after-turn snapshot, not the live file.
			after: d.modifiedSnapshotURI && fromAgentHostUri(d.modifiedSnapshotURI).authority,
			isDeleted: d.isDeleted,
		})), [
			{ added: 3, removed: 1, modified: '/repo/a.ts', after: 'a-after', isDeleted: false },
			{ added: 5, removed: 0, modified: '/repo/b.ts', after: 'b-after', isDeleted: false },
			{ added: 0, removed: 4, modified: '/repo/c.ts', after: undefined, isDeleted: true },
		]);
	});

	test('treats host notices as authoritatively empty without suppressing visible Agent Merge turns', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		const provider = ds.add(createProvider(conn, () => backendSession, () => defaultChatUri));
		const changedFile = {
			id: '1',
			edit: {
				after: { uri: URI.file('/repo/changed.ts').toString(), content: { uri: 'git-blob://changed-after' } },
				diff: { added: 3, removed: 1 },
			},
		};
		const chatState = (message: ChatState['turns'][number]['message']): ChatState => ({
			turns: [{
				id: 't1',
				message,
				responseParts: [],
				usage: undefined,
				state: TurnState.Complete,
			}],
		} as unknown as ChatState);

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Ready, files: [changedFile] } satisfies ChangesetState);
		conn.setState(defaultChatUri.toString(), chatState({
			text: 'Fix the pull request',
			origin: { kind: MessageKind.SystemNotification },
			_meta: toAgentMergeMessageMeta(),
		}));

		const { latest } = observe(provider, ds);
		const visibleRepairFiles = latest().map(diff => fromAgentHostUri(diff.modifiedURI).path);

		conn.setState(defaultChatUri.toString(), chatState(withMessageRequestHiddenFromTranscript({
			text: 'Continue in the requested workspace.',
			origin: { kind: MessageKind.SystemNotification },
			_meta: toAgentWorkspaceContinuationMessageMeta(),
		}, true)));
		const workspaceContinuationFiles = latest().map(diff => fromAgentHostUri(diff.modifiedURI).path);

		conn.setState(defaultChatUri.toString(), chatState(withMessageRequestHiddenFromTranscript({
			text: 'Agent Merge is enabled.',
			origin: { kind: MessageKind.SystemNotification },
		}, true)));

		assert.deepStrictEqual({
			visibleRepairFiles,
			workspaceContinuationFiles,
			noticeFiles: latest(),
			noticeIsAuthoritativeEmpty: latest() === AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES,
		}, {
			visibleRepairFiles: ['/repo/changed.ts'],
			workspaceContinuationFiles: ['/repo/changed.ts'],
			noticeFiles: [],
			noticeIsAuthoritativeEmpty: true,
		});
	});

	test('wraps local non-file snapshots through the Agent Host file system', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, 'local', () => backendSession, undefined, new NullLogService()));

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), {
			status: ChangesetStatus.Ready,
			files: [{
				id: '1',
				edit: {
					before: { uri: URI.file('/repo/a.ts').toString(), content: { uri: 'git-blob://a-before' } },
					after: { uri: URI.file('/repo/a.ts').toString(), content: { uri: 'git-blob://a-after' } },
					diff: { added: 1, removed: 1 },
				},
			}],
		} satisfies ChangesetState);

		const diff = observe(provider, ds).latest()[0];

		assert.deepStrictEqual({
			originalScheme: diff.originalURI.scheme,
			originalAuthority: diff.originalURI.authority,
			originalSource: fromAgentHostUri(diff.originalURI).toString(),
			modifiedSource: diff.modifiedSnapshotURI && fromAgentHostUri(diff.modifiedSnapshotURI).toString(),
		}, {
			originalScheme: 'vscode-agent-host',
			originalAuthority: 'local',
			originalSource: 'git-blob://a-before/',
			modifiedSource: 'git-blob://a-after/',
		});
	});

	test('keeps the changeset subscription when session state updates', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Ready, files: [] } satisfies ChangesetState);
		observe(provider, ds);
		const subscriptionCountBeforeUpdate = conn.getSubscriptionCount(turnChangesetUri('t1'));

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());

		assert.deepStrictEqual([
			subscriptionCountBeforeUpdate,
			conn.getSubscriptionCount(turnChangesetUri('t1')),
		], [1, 1]);
	});

	for (const status of [ChangesetStatus.Ready, ChangesetStatus.Computing]) {
		test(`keeps historical ${status} diffs stable while another turn streams`, () => {
			const ds = store.add(new DisposableStore());
			const conn = new FakeAgentConnection();
			const provider = ds.add(createProvider(conn));
			let historyVisits = 0;
			let responseReads = 0;
			let editReads = 0;
			const turns = Array.from({ length: 5 }, (_, index): Turn => {
				const id = `history-${index}`;
				const edit = fileEdit(`/repo/${id}.ts`, index + 1, () => editReads++);
				const turn = completedTurn(id, edit);
				const responseParts = turn.responseParts;
				conn.setState(turnChangesetUri(id), {
					status,
					files: status === ChangesetStatus.Ready ? [{ id, edit }] : [],
				} satisfies ChangesetState);
				return {
					...turn,
					get id() { historyVisits++; return id; },
					get responseParts() { responseReads++; return responseParts; },
				};
			});
			const session = sessionStateWithTurnSupport();
			conn.setState(backendSession.toString(), session);
			let chat = chatWithTurns(turns);
			conn.setState(chat.resource, chat);
			const observed = turns.map((_, index) => observe(provider, ds, `history-${index}`));
			const initial = observed.map(result => result.latest());
			const initialEditReads = editReads;

			chat = streamText(conn, chat);
			conn.setState(backendSession.toString(), { ...session, title: 'Renamed session' });
			conn.setState(chat.resource, chatReducer(chat, { type: ActionType.ChatTurnComplete, turnId: 'active', duration: 1 }));

			assert.deepStrictEqual({
				historyVisits,
				responseReads,
				extraEditReads: editReads - initialEditReads,
				runs: observed.map(result => result.runs()),
				sameResults: observed.every((result, index) => result.latest() === initial[index]),
				chatSubscriptions: conn.getSubscriptionCount(chat.resource),
				sessionSubscriptions: conn.getSubscriptionCount(backendSession.toString()),
			}, {
				historyVisits: 10,
				responseReads: status === ChangesetStatus.Ready ? 0 : 5,
				extraEditReads: 0,
				runs: [1, 1, 1, 1, 1],
				sameResults: true,
				chatSubscriptions: 1,
				sessionSubscriptions: 1,
			});
		});
	}

	test('only reparses the active fallback when file edits change and stops when a changeset takes over', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));
		let editReads = 0;
		let chat = chatWithTurns([], 't1');
		chat.activeTurn!.responseParts.push(toolCallPart(fileEdit('/repo/a.ts', 2, () => editReads++)));
		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(chat.resource, chat);
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Computing, files: [] } satisfies ChangesetState);
		const observed = observe(provider, ds);
		const initial = observed.latest();
		const initialReads = editReads;
		chat = streamText(conn, chat);
		const afterText = {
			sameResult: observed.latest() === initial,
			extraEditReads: editReads - initialReads,
			runs: observed.runs(),
		};

		chat = chatReducer(chat, {
			type: ActionType.ChatResponsePart,
			turnId: 't1',
			part: toolCallPart(fileEdit('/repo/a.ts', 3), 'second-tool'),
		});
		conn.setState(chat.resource, chat);
		const afterEdit = { added: observed.latest()[0].added, runs: observed.runs() };

		conn.setState(turnChangesetUri('t1'), {
			status: ChangesetStatus.Ready,
			files: [{ id: 'authoritative', edit: fileEdit('/repo/a.ts', 10) }],
		} satisfies ChangesetState);
		const authoritative = observed.latest();
		const authoritativeReads = editReads;
		chat = chatReducer(chat, {
			type: ActionType.ChatResponsePart,
			turnId: 't1',
			part: toolCallPart(fileEdit('/repo/b.ts'), 'third-tool'),
		});
		conn.setState(chat.resource, chat);
		streamText(conn, chat);

		assert.deepStrictEqual({
			afterText,
			afterEdit,
			afterChangeset: {
				sameResult: observed.latest() === authoritative,
				added: observed.latest()[0].added,
				extraEditReads: editReads - authoritativeReads,
				runs: observed.runs(),
			},
		}, {
			afterText: { sameResult: true, extraEditReads: 0, runs: 1 },
			afterEdit: { added: 5, runs: 2 },
			afterChangeset: { sameResult: true, added: 10, extraEditReads: 0, runs: 3 },
		});
	});

	test('only maps changeset files whose edits changed', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));
		let unchangedReads = 0;
		const files = [
			{ id: 'a', edit: fileEdit('/repo/a.ts', 1, () => unchangedReads++) },
			{ id: 'b', edit: fileEdit('/repo/b.ts', 2) },
		];
		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Ready, files } satisfies ChangesetState);
		const observed = observe(provider, ds);
		const initial = observed.latest();
		const initialReads = unchangedReads;
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Computing, files } satisfies ChangesetState);
		conn.setState(turnChangesetUri('t1'), {
			status: ChangesetStatus.Ready,
			files: files.map(file => ({ ...file, reviewed: true })),
			operations: [],
		} satisfies ChangesetState);
		const afterMetadata = { sameResult: observed.latest() === initial, runs: observed.runs() };
		conn.setState(turnChangesetUri('t1'), {
			status: ChangesetStatus.Ready,
			files: [files[0], { id: 'b', edit: fileEdit('/repo/b.ts', 5) }],
		} satisfies ChangesetState);

		assert.deepStrictEqual({
			afterMetadata,
			sameUnchangedEntry: observed.latest()[0] === initial[0],
			extraUnchangedReads: unchangedReads - initialReads,
			additions: observed.latest().map(diff => diff.added),
			runs: observed.runs(),
		}, {
			afterMetadata: { sameResult: true, runs: 1 },
			sameUnchangedEntry: true,
			extraUnchangedReads: 0,
			additions: [1, 5],
			runs: 2,
		});
	});

	test('updates file edits after history loading, truncation and replacement snapshots', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));
		let chat = chatWithTurns([completedTurn('t1')]);
		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(chat.resource, chat);
		const edits = provider.getFileEditsForRequest(chatResource, 'older')!;
		const observed: number[][] = [];
		ds.add(autorun(reader => observed.push(edits.read(reader).map(diff => diff.added))));
		chat = chatReducer(chat, {
			type: ActionType.ChatTurnsLoaded,
			turns: [completedTurn('older', fileEdit('/repo/older.ts', 2))],
		});
		conn.setState(chat.resource, chat);
		chat = chatReducer(chat, { type: ActionType.ChatTruncated, turnId: undefined });
		conn.setState(chat.resource, chat);
		chat = { ...chat, turns: [completedTurn('older', fileEdit('/repo/older.ts', 3))] };
		conn.setState(chat.resource, chat);
		conn.setState(chat.resource, undefined);
		conn.setState(chat.resource, { ...chat, turns: [completedTurn('older', fileEdit('/repo/older.ts', 4))] });

		assert.deepStrictEqual(observed, [[], [2], [], [3], [], [4]]);
	});

	test('keeps changeset mapping selective after reobserving', () => {
		const ds = store.add(new DisposableStore());
		const observers = ds.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));
		let unchangedReads = 0;
		const files = [
			{ id: 'a', edit: fileEdit('/repo/a.ts', 1, () => unchangedReads++) },
			{ id: 'b', edit: fileEdit('/repo/b.ts', 2) },
		];
		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Ready, files } satisfies ChangesetState);
		observe(provider, observers);
		observers.clear();
		const observed = observe(provider, observers);
		const initial = observed.latest();
		const initialReads = unchangedReads;
		const reviewed = { ...files[0], reviewed: true };
		conn.setState(turnChangesetUri('t1'), {
			status: ChangesetStatus.Ready,
			files: [reviewed, files[1]],
		} satisfies ChangesetState);
		conn.setState(turnChangesetUri('t1'), {
			status: ChangesetStatus.Ready,
			files: [reviewed, { id: 'b', edit: fileEdit('/repo/b.ts', 5) }],
		} satisfies ChangesetState);

		assert.deepStrictEqual({
			sameEntry: observed.latest()[0] === initial[0],
			extraReads: unchangedReads - initialReads,
			additions: observed.latest().map(diff => diff.added),
		}, { sameEntry: true, extraReads: 0, additions: [1, 5] });
	});

	test('reclassifies file edits only when workspace roots change', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));
		let editReads = 0;
		const chat = chatWithTurns([completedTurn('t1', fileEdit('/repo/a.ts', 1, () => editReads++))]);
		const session: SessionState = {
			...sessionStateWithTurnSupport(),
			project: { uri: URI.file('/repo').toString(), displayName: 'Repo' },
			workingDirectories: [URI.file('/repo').toString()],
		};
		conn.setState(backendSession.toString(), session);
		conn.setState(chat.resource, chat);
		const edits = provider.getFileEditsForRequest(chatResource, 't1')!;
		const outsideWorkspace: boolean[] = [];
		ds.add(autorun(reader => outsideWorkspace.push(edits.read(reader)[0].isOutsideWorkspace)));
		const initialReads = editReads;
		conn.setState(backendSession.toString(), {
			...session,
			title: 'Renamed',
			project: { ...session.project!, displayName: 'Renamed repo' },
			workingDirectories: [...session.workingDirectories!],
		});
		const metadataEditReads = editReads - initialReads;
		conn.setState(backendSession.toString(), {
			...session,
			project: { uri: URI.file('/other').toString(), displayName: 'Other repo' },
			workingDirectories: [URI.file('/other').toString()],
		});

		assert.deepStrictEqual({ metadataEditReads, outsideWorkspace }, {
			metadataEditReads: 0,
			outsideWorkspace: [false, true],
		});
	});

	test('keeps file edits consistent when an errored turn resumes and completes again', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));
		const turn = completedTurn('t1', fileEdit('/repo/a.ts', 2));
		turn.state = TurnState.Error;
		turn.responseParts.push({
			kind: ResponsePartKind.Error,
			error: { errorType: 'network', message: 'Retry' },
			resumable: true,
		});
		let chat: ChatState = { ...chatWithTurns([turn]), activeTurn: undefined };
		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(chat.resource, chat);
		const edits = provider.getFileEditsForRequest(chatResource, 't1')!;
		const observed: number[][] = [];
		ds.add(autorun(reader => observed.push(edits.read(reader).map(diff => diff.added))));
		chat = chatReducer(chat, { type: ActionType.ChatTurnResume, turnId: 't1' });
		conn.setState(chat.resource, chat);
		chat = chatReducer(chat, {
			type: ActionType.ChatResponsePart,
			turnId: 't1',
			part: toolCallPart(fileEdit('/repo/a.ts', 3), 'second-tool'),
		});
		conn.setState(chat.resource, chat);
		chat = chatReducer(chat, { type: ActionType.ChatTurnComplete, turnId: 't1', duration: 1 });
		conn.setState(chat.resource, chat);

		assert.deepStrictEqual(observed, [[2], [5]]);
	});

	test('discovers turns in newly listed peer chats', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));
		const session = sessionStateWithTurnSupport();
		const defaultChat = chatWithTurns();
		const peerChat = { ...chatWithTurns([completedTurn('t1')]), resource: 'ahp-chat://peer/sess-1' };
		conn.setState(backendSession.toString(), session);
		conn.setState(defaultChat.resource, defaultChat);
		conn.setState(peerChat.resource, peerChat);
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Computing, files: [] } satisfies ChangesetState);
		const observed = observe(provider, ds);
		const before = observed.latest().length;
		conn.setState(backendSession.toString(), { ...session, chats: [peerChat] } satisfies SessionState);
		const after = observed.latest();
		streamText(conn, defaultChat);

		assert.deepStrictEqual({
			before,
			after: after.map(diff => diff.added),
			sameResult: observed.latest() === after,
			peerSubscriptions: conn.getSubscriptionCount(peerChat.resource),
		}, {
			before: 0,
			after: [1],
			sameResult: true,
			peerSubscriptions: 1,
		});
	});

	test('shares lazy subscriptions and releases them when the last observer leaves', () => {
		const ds = store.add(new DisposableStore());
		const observers = ds.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));
		const chat = chatWithTurns([completedTurn('t1'), completedTurn('t2')]);
		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(chat.resource, chat);
		for (const id of ['t1', 't2']) {
			conn.setState(turnChangesetUri(id), { status: ChangesetStatus.Computing, files: [] } satisfies ChangesetState);
			provider.getChangesForRequest(chatResource, id);
			provider.getFileEditsForRequest(chatResource, id);
		}
		const beforeObserving = conn.activeSubscriptions;
		observe(provider, observers, 't1');
		observe(provider, observers, 't2');
		const fileEdits = provider.getFileEditsForRequest(chatResource, 't1')!;
		observers.add(autorun(reader => fileEdits.read(reader)));
		const whileObserving = {
			active: conn.activeSubscriptions,
			session: conn.getSubscriptionCount(backendSession.toString()),
			chat: conn.getSubscriptionCount(chat.resource),
		};
		observers.clear();
		const afterObserving = conn.activeSubscriptions;
		conn.setState(chat.resource, { ...chat, turns: [completedTurn('t1', fileEdit('/repo/replaced.ts', 5))] });
		let additions: number[] = [];
		observers.add(autorun(reader => { additions = fileEdits.read(reader).map(diff => diff.added); }));
		observers.clear();

		assert.deepStrictEqual({
			beforeObserving, whileObserving, afterObserving, additions,
			afterReobserving: conn.activeSubscriptions,
		}, {
			beforeObserving: 0,
			whileObserving: { active: 4, session: 1, chat: 1 },
			afterObserving: 0,
			additions: [5],
			afterReobserving: 0,
		});
	});

	for (const [component, label] of [[StateComponents.Session, 'session'], [StateComponents.Chat, 'chat']] as const) {
		for (const explicitChat of [false, true]) {
			test(`retries failed ${label} subscriptions for new and existing observers (${explicitChat ? 'explicit' : 'discovered'} chat)`, async () => {
				const ds = store.add(new DisposableStore());
				const firstObserver = ds.add(new DisposableStore());
				const secondObserver = ds.add(new DisposableStore());
				const { connection, manager, chat, failures, attempts } = createManagedConnection(ds);
				const failedUri = component === StateComponents.Session ? backendSession : URI.parse(chat.resource);
				failures.add(failedUri.toString());
				const provider = ds.add(createProvider(connection, () => backendSession, explicitChat ? () => URI.parse(chat.resource) : undefined));
				const secondChanges = provider.getChangesForRequest(chatResource, 't2')!;
				const beforeObserving = attempts.size;
				const first = observe(provider, firstObserver);
				await timeout(0);
				const afterFailure = {
					attempts: attempts.get(failedUri.toString()),
					files: first.latest().length,
					failed: manager.getSubscriptionUnmanaged(failedUri)?.value instanceof Error,
				};

				failures.clear();
				let second: readonly IEditSessionEntryDiff[] = [];
				secondObserver.add(autorun(reader => { second = secondChanges.read(reader); }));
				await timeout(0);
				const afterRecovery = {
					attempts: attempts.get(failedUri.toString()),
					first: first.latest().map(diff => diff.added),
					second: second.map(diff => diff.added),
					shared: manager.getActiveSubscriptions().every(subscription => subscription.refCount === 1),
				};
				secondObserver.clear();
				manager.applyReconnectSnapshot(chat.resource, {
					...chat,
					turns: [completedTurn('t1', fileEdit('/repo/t1.ts', 7))],
				} satisfies ChatState, 1);
				const firstAfterSecondLeaves = first.latest().map(diff => diff.added);
				firstObserver.clear();

				assert.deepStrictEqual({
					beforeObserving,
					afterFailure,
					afterRecovery,
					firstAfterSecondLeaves,
					remainingSubscriptions: manager.getActiveSubscriptions().length,
				}, {
					beforeObserving: 0,
					afterFailure: { attempts: 1, files: 0, failed: true },
					afterRecovery: { attempts: 2, first: [1], second: [2], shared: true },
					firstAfterSecondLeaves: [7],
					remainingSubscriptions: 0,
				});
			});
		}

		test(`does not retry a failed ${label} subscription until another request is observed`, async () => {
			const ds = store.add(new DisposableStore());
			const observers = ds.add(new DisposableStore());
			const { connection, manager, chat, failures, attempts } = createManagedConnection(ds);
			const failedUri = component === StateComponents.Session ? backendSession : URI.parse(chat.resource);
			failures.add(failedUri.toString());
			const provider = ds.add(createProvider(connection));
			observe(provider, observers);
			await timeout(0);
			for (let i = 0; i < 10; i++) {
				provider.getChangesForRequest(chatResource, 't2');
				provider.getFileEditsForRequest(chatResource, 't2');
			}
			await timeout(0);
			const afterUnobservedLookups = attempts.get(failedUri.toString());
			observe(provider, observers, 't2');
			await timeout(0);
			await timeout(0);
			const afterFailedRetry = attempts.get(failedUri.toString());
			failures.clear();
			const recovered = observe(provider, observers, 't3');
			await timeout(0);
			const afterRecovery = {
				attempts: attempts.get(failedUri.toString()),
				additions: recovered.latest().map(diff => diff.added),
			};
			observers.clear();

			assert.deepStrictEqual({
				afterUnobservedLookups,
				afterFailedRetry,
				afterRecovery,
				remainingSubscriptions: manager.getActiveSubscriptions().length,
			}, {
				afterUnobservedLookups: 1,
				afterFailedRetry: 2,
				afterRecovery: { attempts: 3, additions: [3] },
				remainingSubscriptions: 0,
			});
		});

		test(`joins an externally replaced ${label} subscription without another server subscribe`, async () => {
			const ds = store.add(new DisposableStore());
			const observers = ds.add(new DisposableStore());
			const { connection, manager, chat, failures, attempts } = createManagedConnection(ds);
			const failedUri = component === StateComponents.Session ? backendSession : URI.parse(chat.resource);
			failures.add(failedUri.toString());
			const provider = ds.add(createProvider(connection));
			const first = observe(provider, observers);
			await timeout(0);
			failures.clear();
			const external = ds.add(manager.getSubscription(component, failedUri, 'ExternalObserver'));
			await timeout(0);
			const second = observe(provider, observers, 't2');
			await timeout(0);
			const recovered = {
				attempts: attempts.get(failedUri.toString()),
				first: first.latest().map(diff => diff.added),
				second: second.latest().map(diff => diff.added),
			};
			external.dispose();
			observers.clear();

			assert.deepStrictEqual({
				...recovered,
				remainingSubscriptions: manager.getActiveSubscriptions().length,
			}, { attempts: 2, first: [1], second: [2], remainingSubscriptions: 0 });
		});

		test(`recovers the file edits API from a failed ${label} subscription`, async () => {
			const ds = store.add(new DisposableStore());
			const observers = ds.add(new DisposableStore());
			const { connection, manager, chat, failures, attempts } = createManagedConnection(ds);
			const failedUri = component === StateComponents.Session ? backendSession : URI.parse(chat.resource);
			failures.add(failedUri.toString());
			const provider = ds.add(createProvider(connection));
			const firstEdits = provider.getFileEditsForRequest(chatResource, 't1')!;
			const secondEdits = provider.getFileEditsForRequest(chatResource, 't2')!;
			let first: readonly IChatResponseFileEdit[] = [];
			let second: readonly IChatResponseFileEdit[] = [];
			observers.add(autorun(reader => { first = firstEdits.read(reader); }));
			await timeout(0);
			failures.clear();
			observers.add(autorun(reader => { second = secondEdits.read(reader); }));
			await timeout(0);
			const recovered = [first, second].map(edits => edits.map(edit => ({ added: edit.added, outside: edit.isOutsideWorkspace })));
			observers.clear();

			assert.deepStrictEqual({
				attempts: attempts.get(failedUri.toString()),
				recovered,
				remainingSubscriptions: manager.getActiveSubscriptions().length,
			}, {
				attempts: 2,
				recovered: [[{ added: 1, outside: false }], [{ added: 2, outside: false }]],
				remainingSubscriptions: 0,
			});
		});

		test(`retries a missing ${label} subscription when a cached request is reobserved`, async () => {
			const ds = store.add(new DisposableStore());
			const firstObserver = ds.add(new DisposableStore());
			const secondObserver = ds.add(new DisposableStore());
			const { connection, manager, chat, attempts } = createManagedConnection(ds);
			const failedUri = component === StateComponents.Session ? backendSession : URI.parse(chat.resource);
			const provider = ds.add(createProvider(connection));
			const first = observe(provider, firstObserver);
			observe(provider, secondObserver, 't2');
			await timeout(0);
			secondObserver.clear();
			manager.markSubscriptionsMissing([failedUri]);
			const retained = first.latest().map(diff => diff.added);
			const second = observe(provider, secondObserver, 't2');
			await timeout(0);
			const recovered = {
				attempts: attempts.get(failedUri.toString()),
				first: first.latest().map(diff => diff.added),
				second: second.latest().map(diff => diff.added),
				ready: !(manager.getSubscriptionUnmanaged(failedUri)?.value instanceof Error),
			};
			firstObserver.clear();
			secondObserver.clear();

			assert.deepStrictEqual({ retained, recovered, remainingSubscriptions: manager.getActiveSubscriptions().length }, {
				retained: [1],
				recovered: { attempts: 2, first: [1], second: [2], ready: true },
				remainingSubscriptions: 0,
			});
		});

		test(`shares pending ${label} subscriptions and releases them before hydration`, async () => {
			const ds = store.add(new DisposableStore());
			const observers = ds.add(new DisposableStore());
			const { connection, manager, chat, pending, attempts } = createManagedConnection(ds);
			const delayedUri = component === StateComponents.Session ? backendSession : URI.parse(chat.resource);
			const hydration = new DeferredPromise<void>();
			pending.set(delayedUri.toString(), hydration);
			const provider = ds.add(createProvider(connection));
			observe(provider, observers);
			observe(provider, observers, 't2');
			await timeout(0);
			const pendingAttempts = attempts.get(delayedUri.toString());
			observers.clear();
			const afterDisposal = manager.getActiveSubscriptions().length;
			await hydration.complete();
			await timeout(0);
			const afterHydration = manager.getActiveSubscriptions().length;
			const first = observe(provider, observers);
			await timeout(0);
			const reobserved = { attempts: attempts.get(delayedUri.toString()), additions: first.latest().map(diff => diff.added) };
			observers.clear();

			assert.deepStrictEqual({
				pendingAttempts, afterDisposal, afterHydration, reobserved,
				remainingSubscriptions: manager.getActiveSubscriptions().length,
			}, {
				pendingAttempts: 1,
				afterDisposal: 0,
				afterHydration: 0,
				reobserved: { attempts: 2, additions: [1] },
				remainingSubscriptions: 0,
			});
		});
	}

	test('falls back to the owning peer chat file edits when a turn checkpoint is unavailable', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const peerResource = URI.parse('agent-host-copilot:/sess-1/peer-1');
		const otherPeerResource = URI.parse('agent-host-copilot:/sess-1/peer-2');
		const peerChatUri = URI.parse('ahp-chat://peer-1/sess-1');
		const otherPeerChatUri = URI.parse('ahp-chat://peer-2/sess-1');
		const provider = ds.add(createProvider(
			conn,
			() => backendSession,
			resource => resource.toString() === peerResource.toString() ? peerChatUri : otherPeerChatUri,
		));
		const peerTurn = (file: string, added: number): ChatState => ({
			resource: peerChatUri.toString(),
			turns: [{
				id: 'same-turn-id',
				message: {},
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed,
						content: [{
							type: ToolResultContentType.FileEdit,
							after: { uri: URI.file(`/repo/${file}`).toString(), content: { uri: `git-blob://${file}` } },
							diff: { added, removed: 0 },
						}],
					},
				}],
				state: TurnState.Complete,
			}],
		} as unknown as ChatState);

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('same-turn-id'), { status: ChangesetStatus.Computing, files: [] } satisfies ChangesetState);
		conn.setState(peerChatUri.toString(), peerTurn('peer-1.ts', 1));
		conn.setState(otherPeerChatUri.toString(), peerTurn('peer-2.ts', 2));

		const obs = provider.getChangesForRequest(peerResource, 'same-turn-id')!;
		let latest: readonly IEditSessionEntryDiff[] = [];
		ds.add(autorun(reader => { latest = obs.read(reader); }));

		assert.deepStrictEqual(latest.map(diff => ({
			file: fromAgentHostUri(diff.modifiedURI).path,
			added: diff.added,
		})), [{ file: '/repo/peer-1.ts', added: 1 }]);

		assert.notStrictEqual(
			provider.getChangesForRequest(peerResource, 'same-turn-id'),
			provider.getChangesForRequest(otherPeerResource, 'same-turn-id'),
		);
	});

	test('includes deleted response edits when a turn checkpoint is unavailable', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		const provider = ds.add(createProvider(conn, () => backendSession, () => defaultChatUri));

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Computing, files: [] } satisfies ChangesetState);
		conn.setState(defaultChatUri.toString(), {
			turns: [{
				id: 't1',
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed,
						content: [{
							type: ToolResultContentType.FileEdit,
							before: { uri: URI.file('/repo/deleted.ts').toString(), content: { uri: 'git-blob://deleted-before' } },
							diff: { added: 0, removed: 6 },
						}],
					},
				}],
			}],
		} as unknown as ChatState);

		const { latest } = observe(provider, ds);
		assert.deepStrictEqual(latest().map(diff => ({
			file: fromAgentHostUri(diff.modifiedURI).path,
			before: fromAgentHostUri(diff.originalURI).authority,
			after: diff.modifiedSnapshotURI,
			isCreated: diff.isCreated,
			isDeleted: diff.isDeleted,
		})), [{
			file: '/repo/deleted.ts',
			before: 'deleted-before',
			after: undefined,
			isCreated: false,
			isDeleted: true,
		}]);
	});

	test('aggregates response edits by first and final file state', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		const provider = ds.add(createProvider(conn, () => backendSession, () => defaultChatUri));
		const replaceResource = URI.file('/repo/replaced.ts').toString();
		const transientResource = URI.file('/repo/transient.ts').toString();
		const responseParts = [
			{
				kind: ResponsePartKind.ToolCall,
				toolCall: {
					status: ToolCallStatus.Completed,
					content: [{
						type: ToolResultContentType.FileEdit,
						before: { uri: replaceResource, content: { uri: 'git-blob://replace-before' } },
						diff: { added: 0, removed: 4 },
					}],
				},
			},
			{
				kind: ResponsePartKind.ToolCall,
				toolCall: {
					status: ToolCallStatus.Completed,
					content: [{
						type: ToolResultContentType.FileEdit,
						after: { uri: replaceResource, content: { uri: 'git-blob://replace-after' } },
						diff: { added: 5, removed: 0 },
					}],
				},
			},
			{
				kind: ResponsePartKind.ToolCall,
				toolCall: {
					status: ToolCallStatus.Completed,
					content: [{
						type: ToolResultContentType.FileEdit,
						after: { uri: transientResource, content: { uri: 'git-blob://transient-after' } },
						diff: { added: 3, removed: 0 },
					}],
				},
			},
			{
				kind: ResponsePartKind.ToolCall,
				toolCall: {
					status: ToolCallStatus.Completed,
					content: [{
						type: ToolResultContentType.FileEdit,
						before: { uri: transientResource, content: { uri: 'git-blob://transient-before-delete' } },
						diff: { added: 0, removed: 3 },
					}],
				},
			},
		];

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Computing, files: [] } satisfies ChangesetState);
		conn.setState(defaultChatUri.toString(), {
			turns: [{ id: 't1', responseParts: responseParts.slice(0, 3) }],
		} as unknown as ChatState);

		const { latest } = observe(provider, ds);
		const beforeCancellation = latest().map(diff => fromAgentHostUri(diff.modifiedURI).path);
		conn.setState(defaultChatUri.toString(), {
			turns: [{ id: 't1', responseParts }],
		} as unknown as ChatState);
		const afterCancellation = latest().map(diff => ({
			file: fromAgentHostUri(diff.modifiedURI).path,
			before: fromAgentHostUri(diff.originalURI).authority,
			after: diff.modifiedSnapshotURI && fromAgentHostUri(diff.modifiedSnapshotURI).authority,
			added: diff.added,
			removed: diff.removed,
			isCreated: diff.isCreated,
			isDeleted: diff.isDeleted,
		}));
		conn.setState(defaultChatUri.toString(), {
			turns: [{ id: 't1', responseParts: responseParts.slice(2) }],
		} as unknown as ChatState);

		assert.deepStrictEqual({
			beforeCancellation,
			afterCancellation,
			isAuthoritativeEmpty: latest() === AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES,
			afterAllCancellation: latest(),
		}, {
			beforeCancellation: ['/repo/replaced.ts', '/repo/transient.ts'],
			afterCancellation: [{
				file: '/repo/replaced.ts',
				before: 'replace-before',
				after: 'replace-after',
				added: 5,
				removed: 4,
				isCreated: false,
				isDeleted: false,
			}],
			isAuthoritativeEmpty: true,
			afterAllCancellation: [],
		});
	});

	test('preserves an authoritative empty turn changeset', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		const provider = ds.add(createProvider(conn, () => backendSession, () => defaultChatUri));

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Ready, files: [] } satisfies ChangesetState);
		conn.setState(defaultChatUri.toString(), {
			turns: [{
				id: 't1',
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed,
						content: [{
							type: ToolResultContentType.FileEdit,
							after: { uri: URI.file('/repo/no-op.ts').toString(), content: { uri: 'git-blob://no-op' } },
							diff: { added: 1, removed: 0 },
						}],
					},
				}],
			}],
		} as unknown as ChatState);

		const { latest } = observe(provider, ds);
		assert.deepStrictEqual({
			diffs: latest(),
			isAuthoritativeEmpty: latest() === AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES,
		}, {
			diffs: [],
			isAuthoritativeEmpty: true,
		});
	});

	test('the recorded migrated turn falls back to the branch changeset when its turn changeset is empty', () => {
		// #333642: migrated legacy Copilot CLI sessions have no per-turn
		// checkpoints, so the committed-on-branch work only lives in the
		// session-wide branch changeset. Surface it under the recorded migration
		// boundary turn so the chat editor shows the same changes as the Agents window.
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		const provider = ds.add(createProvider(conn, () => backendSession, () => defaultChatUri));

		conn.setState(backendSession.toString(), adoptedSessionStateWithTurnSupport('t1'));
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Ready, files: [] } satisfies ChangesetState);
		conn.setState(branchChangesetUri(), { status: ChangesetStatus.Ready, files: [branchFile('/repo/committed.ts', 4, 2)] } as unknown as ChangesetState);

		const { latest } = observe(provider, ds);
		assert.deepStrictEqual(latest().map(d => ({ modified: d.modifiedURI.path, added: d.added, removed: d.removed })), [
			{ modified: '/repo/committed.ts', added: 4, removed: 2 },
		]);
	});

	test('a post-adoption turn with an empty changeset never shows the historical branch aggregate', () => {
		// A no-op turn added after migration is authoritatively empty; it must show
		// its own (empty) changes, not the migrated session's committed history.
		// The recorded boundary turn is 't1'; the requested turn 't2' is later.
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		const provider = ds.add(createProvider(conn, () => backendSession, () => defaultChatUri));

		conn.setState(backendSession.toString(), adoptedSessionStateWithTurnSupport('t1'));
		conn.setState(turnChangesetUri('t2'), { status: ChangesetStatus.Ready, files: [] } satisfies ChangesetState);
		conn.setState(branchChangesetUri(), { status: ChangesetStatus.Ready, files: [branchFile('/repo/committed.ts', 4, 2)] } as unknown as ChangesetState);

		const obs = provider.getChangesForRequest(chatResource, 't2')!;
		let latest: readonly IEditSessionEntryDiff[] = [];
		ds.add(autorun(r => { latest = obs.read(r); }));
		assert.deepStrictEqual(latest, []);
	});

	test('a native session never shows the branch changeset in place of an empty turn changeset', () => {
		// The fallback is gated on the durable migration boundary, so a normal
		// session with an authoritative empty turn changeset stays empty even if a
		// branch changeset exists.
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		const provider = ds.add(createProvider(conn, () => backendSession, () => defaultChatUri));

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Ready, files: [] } satisfies ChangesetState);
		conn.setState(branchChangesetUri(), { status: ChangesetStatus.Ready, files: [branchFile('/repo/committed.ts', 4, 2)] } as unknown as ChangesetState);

		const { latest } = observe(provider, ds);
		assert.deepStrictEqual(latest(), []);
	});

	test('keeps a turn visible across changeset recomputes and losses', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));
		const readyFiles = [
			{ id: '1', edit: { before: { uri: URI.file('/repo/a.ts').toString(), content: { uri: 'git-blob://a-before' } }, after: { uri: URI.file('/repo/a.ts').toString(), content: { uri: 'git-blob://a-after' } }, diff: { added: 3, removed: 1 } } },
		];

		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Ready, files: readyFiles } satisfies ChangesetState);

		const { latest } = observe(provider, ds);
		const counts: { files: number; added: number }[] = [];
		const record = () => counts.push({ files: latest().length, added: latest().reduce((total, diff) => total + diff.added, 0) });
		record();

		// Recompute, failure, reconnect, and an authoritative empty recompute.
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Computing, files: [] } satisfies ChangesetState);
		record();
		conn.setState(turnChangesetUri('t1'), new Error('compute failed'));
		record();
		conn.setState(backendSession.toString(), undefined);
		record();
		conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
		conn.setState(turnChangesetUri('t1'), { status: ChangesetStatus.Ready, files: [] } satisfies ChangesetState);
		record();

		assert.deepStrictEqual(counts, [
			{ files: 1, added: 3 },
			{ files: 1, added: 3 },
			{ files: 1, added: 3 },
			{ files: 1, added: 3 },
			{ files: 1, added: 3 },
		]);
	});

	test('bounds per-request observable caches', () => {
		const ds = store.add(new DisposableStore());
		const provider = ds.add(createProvider(new FakeAgentConnection()));
		const firstChanges = provider.getChangesForRequest(chatResource, 'request-0');
		const firstFileEdits = provider.getFileEditsForRequest(chatResource, 'request-0');

		for (let index = 1; index <= 1100; index++) {
			provider.getChangesForRequest(chatResource, `request-${index}`);
			provider.getFileEditsForRequest(chatResource, `request-${index}`);
		}

		const perRequest = Reflect.get(provider, '_perRequest') as { readonly size: number };
		const perRequestFileEdits = Reflect.get(provider, '_perRequestFileEdits') as { readonly size: number };
		assert.deepStrictEqual({
			perRequestSize: perRequest.size,
			perRequestFileEditsSize: perRequestFileEdits.size,
			firstChangesEvicted: provider.getChangesForRequest(chatResource, 'request-0') !== firstChanges,
			firstFileEditsEvicted: provider.getFileEditsForRequest(chatResource, 'request-0') !== firstFileEdits,
		}, {
			perRequestSize: 1000,
			perRequestFileEditsSize: 1000,
			firstChangesEvicted: true,
			firstFileEditsEvicted: true,
		});
	});

	test('bounds shared source caches without acquiring unobserved subscriptions', () => {
		const conn = new FakeAgentConnection();
		const provider = store.add(new AgentHostResponseFileChangesProvider(
			conn, authority, resource => resource, resource => resource, new NullLogService(),
		));
		for (let index = 0; index < 1100; index++) {
			provider.getChangesForRequest(URI.parse(`copilot:/session-${index}`), 't1');
		}
		const sessionSources = Reflect.get(provider, '_sessionSources') as { readonly size: number };
		const chatSources = Reflect.get(provider, '_chatSources') as { readonly size: number };

		assert.deepStrictEqual({
			sessions: sessionSources.size,
			chats: chatSources.size,
			activeSubscriptions: conn.activeSubscriptions,
		}, {
			sessions: 1000,
			chats: 1000,
			activeSubscriptions: 0,
		});
	});

	test('classifies project files as workspace files without working directories', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));

		conn.setState(backendSession.toString(), {
			project: { uri: URI.file('/repo').toString(), displayName: 'repo' },
			workingDirectories: [],
			chats: [],
		} as unknown as SessionState);
		conn.setState(defaultChatUri.toString(), {
			resource: defaultChatUri.toString(),
			title: 'Chat',
			status: SessionStatus.Idle,
			modifiedAt: new Date(0).toISOString(),
			turns: [{
				id: 't1',
				message: {},
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed,
						toolCallId: 'tool-1',
						toolName: 'write_file',
						displayName: 'Write File',
						invocationMessage: 'Write file',
						confirmed: ToolCallConfirmationReason.NotNeeded,
						success: true,
						pastTenseMessage: 'Wrote file',
						content: [
							{
								type: ToolResultContentType.FileEdit,
								after: { uri: URI.file('/outside/README.md').toString(), content: { uri: 'git-blob://readme-after' } },
								diff: { added: 7, removed: 0 },
							},
							{
								type: ToolResultContentType.FileEdit,
								after: { uri: URI.file('/repo/docs.md').toString(), content: { uri: 'git-blob://docs-after' } },
								diff: { added: 3, removed: 1 },
							},
						],
					},
				}],
				usage: undefined,
				state: TurnState.Complete,
			}],
		} as unknown as ChatState);

		const obs = provider.getFileEditsForRequest(chatResource, 't1')!;
		let latest: readonly IChatResponseFileEdit[] = [];
		ds.add(autorun(r => { latest = obs.read(r); }));

		assert.deepStrictEqual(latest.map(diff => ({
			modified: fromAgentHostUri(diff.modifiedURI).path,
			isOutsideWorkspace: diff.isOutsideWorkspace,
			added: diff.added,
			removed: diff.removed,
		})), [
			{ modified: '/outside/README.md', isOutsideWorkspace: true, added: 7, removed: 0 },
			{ modified: '/repo/docs.md', isOutsideWorkspace: false, added: 3, removed: 1 },
		]);
	});

	test('returns empty when the agent does not advertise a turn changeset', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		const provider = ds.add(createProvider(conn, () => backendSession, () => defaultChatUri));

		conn.setState(backendSession.toString(), { changesets: [{ label: 'All', uriTemplate: `${backendSession}/changeset/session`, changeKind: 'session' }] } as unknown as SessionState);
		conn.setState(defaultChatUri.toString(), {
			turns: [{
				id: 't1',
				responseParts: [{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed,
						content: [{
							type: ToolResultContentType.FileEdit,
							after: { uri: URI.file('/repo/unsupported.ts').toString(), content: { uri: 'git-blob://unsupported' } },
							diff: { added: 1, removed: 0 },
						}],
					},
				}],
			}],
		} as unknown as ChatState);

		const { latest } = observe(provider, ds);
		assert.deepStrictEqual(latest(), []);
	});

	test('memoizes the observable per request', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn));

		assert.strictEqual(
			provider.getChangesForRequest(chatResource, 't1'),
			provider.getChangesForRequest(chatResource, 't1')
		);
	});

	test('returns undefined when the backend session cannot be resolved', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(createProvider(conn, () => undefined));

		assert.strictEqual(provider.getChangesForRequest(chatResource, 't1'), undefined);
	});
});
