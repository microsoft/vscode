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
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ChangesetStatus, StateComponents, type ChangesetState, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { AgentHostResponseFileChangesProvider } from '../../../browser/agentSessions/agentHost/agentHostResponseFileChanges.js';

class FakeAgentConnection extends mock<IAgentConnection>() {
	override readonly clientId = 'test-client';

	private readonly _emitters = new Map<string, Emitter<unknown>>();
	private readonly _values = new Map<string, unknown>();

	setState(resource: string, value: unknown): void {
		this._values.set(resource, value);
		this._emitters.get(resource)?.fire(value);
	}

	override getSubscription<T extends StateComponents>(_kind: T, resource: URI, _owner: string): IReference<IAgentSubscription<never>> {
		const key = resource.toString();
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
			],
		} satisfies ChangesetState);

		const { latest } = observe(provider, ds);
		assert.deepStrictEqual(latest().map(d => ({ added: d.added, removed: d.removed, modified: d.modifiedURI.path })), [
			{ added: 3, removed: 1, modified: '/repo/a.ts' },
			{ added: 5, removed: 0, modified: '/repo/b.ts' },
		]);
	});

	test('returns empty when the agent does not advertise a turn changeset', () => {
		const ds = store.add(new DisposableStore());
		const conn = new FakeAgentConnection();
		const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));

		conn.setState(backendSession.toString(), { changesets: [{ label: 'All', uriTemplate: `${backendSession}/changeset/session`, changeKind: 'session' }] } as unknown as SessionState);

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
