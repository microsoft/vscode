/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { buildTurnChangesetUri } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { fromAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import {
	buildDefaultChatUri,
	ChangesetStatus,
	ResponsePartKind,
	SessionStatus,
	StateComponents,
	ToolCallConfirmationReason,
	ToolCallStatus,
	ToolResultContentType,
	TurnState,
	type ChangesetState,
	type ChatState,
	type SessionState
} from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { AgentHostResponseFileChangesProvider } from '../../../browser/agentSessions/agentHost/agentHostResponseFileChanges.js';
import { IChatResponseFileEdit } from '../../../browser/chatResponseFileChangesService.js';

class FakeAgentConnection extends mock<IAgentConnection>() {
	override readonly clientId = 'test-client';

	private readonly _emitters = new Map<string, Emitter<unknown>>();
	private readonly _values = new Map<string, unknown>();
	private readonly _subscriptionCounts = new Map<string, number>();

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
		return { object: sub, dispose: () => { } };
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

	function observe(provider: AgentHostResponseFileChangesProvider, ds: DisposableStore): { latest: () => readonly IEditSessionEntryDiff[] } {
		const obs = provider.getChangesForRequest(chatResource, 't1')!;
		let latest: readonly IEditSessionEntryDiff[] = [];
		ds.add(autorun(r => { latest = obs.read(r); }));
		return { latest: () => latest };
	}

	test('maps per-turn changeset files into entry diffs', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));

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

	test('keeps the changeset subscription when session state updates', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));

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

	test('falls back to the owning peer chat file edits when a turn checkpoint is unavailable', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const peerResource = URI.parse('agent-host-copilot:/sess-1/peer-1');
		const otherPeerResource = URI.parse('agent-host-copilot:/sess-1/peer-2');
		const peerChatUri = URI.parse('ahp-chat://peer-1/sess-1');
		const otherPeerChatUri = URI.parse('ahp-chat://peer-2/sess-1');
		const provider = ds.add(new AgentHostResponseFileChangesProvider(
			conn,
			authority,
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

	test('preserves an authoritative empty turn changeset', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession, () => defaultChatUri));

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
		assert.deepStrictEqual(latest(), []);
	});

	test('bounds per-request observable caches', () => {
		const ds = store.add(new DisposableStore());
		const provider = ds.add(new AgentHostResponseFileChangesProvider(new FakeAgentConnection(), authority, () => backendSession));
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

	test('classifies project files as workspace files without working directories', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));
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
		const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession, () => defaultChatUri));

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
		const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));

		assert.strictEqual(
			provider.getChangesForRequest(chatResource, 't1'),
			provider.getChangesForRequest(chatResource, 't1')
		);
	});

	test('returns undefined when the backend session cannot be resolved', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => undefined));

		assert.strictEqual(provider.getChangesForRequest(chatResource, 't1'), undefined);
	});
});
