/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../base/common/async.js';
import { constObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IAgentHostGitService, type IGitRemote } from '../../common/agentHostGitService.js';
import { ActionType, type ActionEnvelope, type ChatDeltaAction } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, type ProjectInfo, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { MissionControlSessionMirror, type MissionControlMirrorEvent } from '../../node/missionControl/missionControlSessionMirror.js';
import { MissionControlSessionPublisher } from '../../node/missionControl/missionControlSessionPublisher.js';

const session = 'ahp-session:/native';
const directory = URI.file('/workspace/checkout');
const localProject = { uri: URI.file('/workspace/repository').toString(), displayName: 'repository' };
const at = '2026-10-15T00:00:00Z';

function envelope(serverSeq = 1): ActionEnvelope & { readonly action: ChatDeltaAction } {
	return { channel: 'ahp-chat:/peer', action: { type: ActionType.ChatDelta, turnId: 'turn', partId: 'part', content: 'Peer delta' }, serverSeq, origin: undefined };
}

suite('MissionControlSessionPublisher', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;
	setup(() => { clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
	teardown(() => sinon.restore());

	function fixture(options: {
		remotes?: readonly IGitRemote[] | null;
		project?: ProjectInfo;
		workingDirectories?: string[];
		root?: URI | false | null;
		gate?: Promise<void>;
		repositoryMetadataEnabled?: boolean;
	} = {}) {
		const instantiation = store.add(new TestInstantiationService());
		const log = store.add(new NullLogService());
		const errors = sinon.spy(log, 'error');
		const state = store.add(new AgentHostStateManager(log));
		state.restoreSession({
			resource: session, defaultChat: buildDefaultChatUri(session), provider: 'copilotcli',
			title: 'Test', status: SessionStatus.Idle, createdAt: at, modifiedAt: at,
			project: options.project ?? localProject, workingDirectories: options.workingDirectories ?? [directory.toString()],
		}, [], creationTimeChatStorageResource);
		const reads: string[] = [];
		instantiation.stub(IAgentHostStateManager, state);
		instantiation.stub(IAgentHostGitService, new class extends mock<IAgentHostGitService>() {
			override async getRepositoryRoot(resource: URI) {
				reads.push(resource.toString());
				await options.gate;
				return options.root === false || options.root === null ? undefined : options.root ?? directory;
			}
			override hasGitRoot() {
				return constObservable(options.root === null ? undefined : options.root !== false);
			}
			override async getFetchRemotes() {
				if (options.remotes === null) {
					return undefined;
				}
				return options.remotes ?? [{ name: 'origin', url: 'git@github.com:microsoft/vscode.git' }];
			}
		}());
		instantiation.stub(ILogService, log);
		const mirror = store.add(instantiation.createInstance(MissionControlSessionMirror, 'environment', {}));
		const events: MissionControlMirrorEvent[] = [];
		store.add(mirror.attach(event => { events.push(event); }));
		let enabled = true;
		let repositoryMetadataEnabled = options.repositoryMetadataEnabled ?? true;
		const publisher = store.add(instantiation.createInstance(MissionControlSessionPublisher, mirror, () => enabled, () => repositoryMetadataEnabled));
		return {
			state, publisher, mirror, events, reads, errors,
			frames: () => events.flatMap(event => event.event === 'sessionEvents' ? [event.data] : []),
			setEnabled: (value: boolean) => { enabled = value; },
			setRepositoryMetadataEnabled: (value: boolean) => { repositoryMetadataEnabled = value; },
		};
	}

	for (const [remote, uri, displayName] of [
		['https://github.com/microsoft/vscode.git', 'https://github.com/microsoft/vscode', 'microsoft/vscode'],
		['git@github.com:microsoft/vscode.git', 'https://github.com/microsoft/vscode', 'microsoft/vscode'],
		['ssh://git@github.com:2222/microsoft/vscode.git', 'https://github.com/microsoft/vscode', 'microsoft/vscode'],
		['https://user:password@github.com:8443/microsoft/vscode.git', 'https://github.com/microsoft/vscode', 'microsoft/vscode'],
		['git@acme.ghe.com:team/repo.git', 'https://acme.ghe.com/team/repo', 'team/repo'],
		['https://other.example/team/repo.git', 'https://other.example/team/repo', 'team/repo'],
		['https://dev.azure.com/organization/project/repo', 'https://dev.azure.com/organization/project/repo', 'organization/project/repo'],
	] as const) {
		test(`projects ${remote} without rewriting its host`, async () => {
			const f = fixture({ remotes: [{ name: 'origin', url: remote }] });
			f.publisher.enqueue(envelope(), session);
			await f.publisher.registerSession(session);
			clock.runAll();
			assert.deepStrictEqual({
				projects: f.frames().map(frame => frame.project),
				localProject: f.state.getSessionSummary(session)?.project,
			}, {
				projects: [{ uri, display_name: displayName }],
				localProject,
			});
		});
	}

	test('shares one resolution across both first-frame namespaces, snapshots pending actions, and retains it for backfill', async () => {
		const gate = new DeferredPromise<void>();
		const f = fixture({ gate: gate.p });
		const ready = f.publisher.registerSession(session);
		const action = envelope();
		f.publisher.enqueue(action, session);
		if (action.action.type === ActionType.ChatDelta) {
			action.action.content = 'Mutated after dispatch';
		}
		f.publisher.enqueue(envelope(2), session);
		clock.tick(1);
		assert.deepStrictEqual(f.events, []);
		await gate.complete();
		await ready;
		f.mirror.reserveSdkSequences(session, 0, 1024);
		f.mirror.enqueueSdk(session, { type: 'session.idle', data: {} }, at);
		clock.runAll();
		f.mirror.backfill({ kind: 'backfill_request', environment_id: 'environment', session_id: session, ns: 'ahp', from_seq: 0, to_seq: 1, request_id: 'backfill' });
		clock.runAll();
		assert.deepStrictEqual({
			reads: f.reads,
			frames: f.frames().map(frame => ({
				ns: frame.ns, session: frame.session_id, project: frame.project,
				seq: frame.seq, payload: frame.payload,
			})),
		}, {
			reads: [directory.toString()],
			frames: [
				...['ahp', 'sdk', 'ahp', 'ahp', 'ahp'].map((ns, index) => ({
					ns, session,
					project: { uri: 'https://github.com/microsoft/vscode', display_name: 'microsoft/vscode' },
					seq: [0, 0, 1, 0, 1][index],
					payload: ns === 'sdk' ? { type: 'session.idle', data: {} }
						: { kind: 'message', data: JSON.parse(JSON.stringify(envelope([1, 0, 2, 1, 2][index]))) },
				})),
			],
		});
	});

	for (const project of [localProject, { uri: 'https://github.com/microsoft/vscode', displayName: 'vscode' }]) {
		test(`omits repository metadata from both namespaces and backfill without Git probes: ${project.uri}`, async () => {
			const f = fixture({ project, repositoryMetadataEnabled: false, root: null, remotes: null });
			f.publisher.enqueue(envelope(), session);
			await f.publisher.registerSession(session);
			f.setRepositoryMetadataEnabled(true);
			f.mirror.reserveSdkSequences(session, 0, 1024);
			f.mirror.enqueueSdk(session, { type: 'session.idle', data: {} }, at);
			clock.runAll();
			f.mirror.backfill({ kind: 'backfill_request', environment_id: 'environment', session_id: session, ns: 'ahp', from_seq: 0, to_seq: 0, request_id: 'backfill' });
			clock.runAll();
			assert.deepStrictEqual({
				reads: f.reads,
				frames: f.frames().map(frame => ({ ns: frame.ns, project: frame.project, payload: frame.payload })),
				localProject: f.state.getSessionSummary(session)?.project,
				errors: f.errors.callCount,
			}, {
				reads: [],
				frames: [
					{ ns: 'ahp', project: undefined, payload: { kind: 'message', data: JSON.parse(JSON.stringify(envelope())) } },
					{ ns: 'sdk', project: undefined, payload: { type: 'session.idle', data: {} } },
					{ ns: 'ahp', project: undefined, payload: { kind: 'message', data: JSON.parse(JSON.stringify(envelope())) } },
				],
				localProject: project,
				errors: 0,
			});
		});
	}

	for (const remotes of [
		[],
		[{ name: 'upstream', url: 'https://github.com/microsoft/vscode' }],
		[{ name: 'origin', url: '/local/repository.git' }],
		[{ name: 'origin', url: 'C:/repos/example.git' }],
		[{ name: 'origin', url: 'C:\\repos\\example.git' }],
	]) {
		test(`retains local checkout identity without a usable origin: ${JSON.stringify(remotes)}`, async () => {
			const f = fixture({ remotes });
			f.publisher.enqueue(envelope(), session);
			await f.publisher.registerSession(session);
			clock.runAll();
			assert.deepStrictEqual(f.frames().map(frame => frame.project), [{ uri: localProject.uri, display_name: 'repository' }]);
		});
	}

	test('omits project outside Git', async () => {
		const f = fixture({ root: false });
		f.publisher.enqueue(envelope(), session);
		await f.publisher.registerSession(session);
		clock.runAll();
		assert.deepStrictEqual(f.frames().map(frame => frame.project), [undefined]);
	});

	test('accepts an already canonical host project without a local directory', async () => {
		const f = fixture({ project: { uri: 'https://github.com/microsoft/vscode', displayName: 'vscode' }, workingDirectories: [] });
		f.publisher.enqueue(envelope(), session);
		await f.publisher.registerSession(session);
		clock.runAll();
		assert.deepStrictEqual({ reads: f.reads, projects: f.frames().map(frame => frame.project) }, {
			reads: [], projects: [{ uri: 'https://github.com/microsoft/vscode', display_name: 'microsoft/vscode' }],
		});
	});

	test('does no project work while disabled and does not publish buffered frames after withdrawal', async () => {
		const gate = new DeferredPromise<void>();
		const f = fixture({ gate: gate.p });
		f.setEnabled(false);
		f.publisher.enqueue(envelope(), session);
		assert.deepStrictEqual(f.reads, []);
		f.setEnabled(true);
		f.publisher.enqueue(envelope(), session);
		f.setEnabled(false);
		await gate.complete();
		await f.publisher.registerSession(session);
		clock.runAll();
		assert.deepStrictEqual({ frames: f.frames(), failure: f.mirror.getSessionStatus(session).failure }, {
			frames: [], failure: { namespace: 'ahp', reason: 'source_lag', skipped: 1 },
		});
	});

	test('bounds pending frames and reports integrity loss rather than publishing incomplete history', async () => {
		const gate = new DeferredPromise<void>();
		const f = fixture({ gate: gate.p });
		for (let index = 0; index < 257; index++) {
			f.publisher.enqueue(envelope(index), session);
		}
		await gate.complete();
		await f.publisher.registerSession(session);
		clock.runAll();
		assert.deepStrictEqual({
			frames: f.frames(), errors: f.errors.callCount, failure: f.mirror.getSessionStatus(session).failure,
		}, { frames: [], errors: 2, failure: { namespace: 'ahp', reason: 'source_lag', skipped: 1 } });
	});

	test('reports actions skipped during a temporary withdrawal before project resolution completes', async () => {
		const gate = new DeferredPromise<void>();
		const f = fixture({ gate: gate.p });
		f.publisher.enqueue(envelope(1), session);
		f.setEnabled(false);
		f.publisher.enqueue(envelope(2), session);
		f.setEnabled(true);
		f.publisher.enqueue(envelope(3), session);
		await gate.complete();
		await f.publisher.registerSession(session);
		clock.runAll();
		assert.deepStrictEqual({ frames: f.frames(), failure: f.mirror.getSessionStatus(session).failure }, {
			frames: [], failure: { namespace: 'ahp', reason: 'source_lag', skipped: 1 },
		});
	});

	test('reports a failed action snapshot as integrity loss before draining buffered actions', async () => {
		const gate = new DeferredPromise<void>();
		const f = fixture({ gate: gate.p });
		const circular: Record<string, object> = {};
		circular.self = circular;
		const action = envelope(2);
		f.publisher.enqueue(envelope(1), session);
		f.publisher.enqueue({ ...action, action: { ...action.action, _meta: circular } }, session);
		f.publisher.enqueue(envelope(3), session);
		await gate.complete();
		await f.publisher.registerSession(session);
		clock.runAll();
		assert.deepStrictEqual({
			frames: f.frames(), errors: f.errors.callCount, failure: f.mirror.getSessionStatus(session).failure,
		}, { frames: [], errors: 2, failure: { namespace: 'ahp', reason: 'source_lag', skipped: 1 } });
	});

	test('does not register a late resolution after disposal', async () => {
		const gate = new DeferredPromise<void>();
		const f = fixture({ gate: gate.p });
		f.publisher.enqueue(envelope(), session);
		const ready = f.publisher.registerSession(session);
		f.publisher.dispose();
		await gate.complete();
		await assert.rejects(ready, /Canceled/);
		clock.runAll();
		assert.deepStrictEqual({ events: f.events, sessions: f.mirror.statistics.sessions, errors: f.errors.callCount }, { events: [], sessions: 0, errors: 0 });
	});

	test('reports a failed repository lookup without creating an incorrectly unassociated MC record', async () => {
		const gate = new DeferredPromise<void>();
		const f = fixture({ gate: gate.p });
		f.publisher.enqueue(envelope(), session);
		const ready = f.publisher.registerSession(session);
		await gate.error(new Error('Git unavailable'));
		await assert.rejects(ready, /Git unavailable/);
		f.publisher.enqueue(envelope(2), session);
		clock.runAll();
		assert.deepStrictEqual({ events: f.events, sessions: f.mirror.statistics.sessions, errors: f.errors.callCount }, { events: [], sessions: 0, errors: 1 });
	});

	for (const options of [{ root: null }, { remotes: null }]) {
		test(`does not freeze missing repository identity after an inconclusive Git probe: ${JSON.stringify(options)}`, async () => {
			const f = fixture(options);
			f.publisher.enqueue(envelope(), session);
			await assert.rejects(f.publisher.registerSession(session), /could not be resolved/);
			clock.runAll();
			assert.deepStrictEqual({ events: f.events, sessions: f.mirror.statistics.sessions, errors: f.errors.callCount }, { events: [], sessions: 0, errors: 1 });
		});
	}
});
