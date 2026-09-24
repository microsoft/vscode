/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AgentSession } from '../../common/agent.js';
import { NULL_CHECKPOINT_SERVICE, type IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import { type IAgentHostChangesetOperationService } from '../../common/agentHostChangesetOperationService.js';
import { type ChangesetDiffStrategy } from '../../common/agentHostChangesetService.js';
import { type IAgentHostChangesetSubscriptionService } from '../../common/agentHostChangesetSubscriptionService.js';
import { NULL_REVIEW_SERVICE } from '../../common/agentHostReviewService.js';
import { buildBranchChangesetUri, buildDefaultChangesetCatalog, buildFolderChangesetOwnerUri, buildSessionChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { buildSessionDbUri } from '../../common/sessionDbUri.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChangesetStatus, FileEditKind, MessageKind, SessionStatus, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChangesetService } from '../../node/agentHostChangesetService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
import { createNoopGitService, createSessionDataService, encodeString, TestDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

suite('AgentHostChangesetStrategy', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = AgentSession.uri('mock', 'strategy').toString();
	const turnId = 'turn-1';
	const sessionChangeset = buildSessionChangesetUri(session);
	const turnChangeset = buildTurnChangesetUri(session, turnId);
	const trackedPath = '/repo/tracked.txt';
	const gitOnlyDiff: ISessionFileDiff = {
		after: { uri: URI.file('/repo/terminal.txt').toString(), content: { uri: 'git:/terminal.txt' } },
		diff: { added: 7, removed: 2 },
	};

	function addEdit(db: TestSessionDatabase, filePath = trackedPath, id = turnId, toolCallId = 'edit-1', before = 'before', after = 'before\nafter'): void {
		db.addEdit({
			turnId: id,
			toolCallId,
			filePath,
			kind: FileEditKind.Edit,
			addedLines: undefined,
			removedLines: undefined,
			beforeContent: encodeString(before),
			afterContent: encodeString(after),
		});
	}

	function trackedDiff(filePath = trackedPath, owner = session, toolCallId = 'edit-1', added = 1): ISessionFileDiff {
		return {
			before: { uri: URI.file(filePath).toString(), content: { uri: buildSessionDbUri(owner, toolCallId, filePath, 'before') } },
			after: { uri: URI.file(filePath).toString(), content: { uri: buildSessionDbUri(owner, toolCallId, filePath, 'after') } },
			diff: { added, removed: 0 },
		};
	}

	function setIsolation(state: AgentHostStateManager, isolation: string | undefined, resource = session): void {
		state.setSessionConfig(resource, {
			schema: { type: 'object', properties: {} },
			values: isolation === undefined ? {} : { [SessionConfigKey.Isolation]: isolation },
		});
	}

	function addTurn(state: AgentHostStateManager, id: string, chat = buildDefaultChatUri(session)): void {
		state.dispatchServerAction(chat, {
			type: ActionType.ChatTurnStarted,
			turnId: id,
			startedAt: '2026-09-01T00:00:00.000Z',
			message: { text: 'Edit files', origin: { kind: MessageKind.User } },
		});
		state.dispatchServerAction(chat, { type: ActionType.ChatTurnComplete, turnId: id, duration: 1 });
	}

	function createFixture(options: {
		isolation?: string;
		workingDirectories?: string[];
		db?: TestSessionDatabase;
		peer?: { resource: string; db: TestSessionDatabase; turnId: string };
		unavailableDatabase?: string;
	} = {}) {
		const state = disposables.add(new AgentHostStateManager(new NullLogService()));
		const configuration = disposables.add(new AgentConfigurationService(state, new NullLogService()));
		const db = options.db ?? new TestSessionDatabase();
		const diff = new TestDiffComputeService();
		const gitCalls: { directory: string; fromRef: string; toRef: string }[] = [];
		const repositoryCalls: string[] = [];
		const checkpointCalls: string[] = [];
		const databaseCalls: string[] = [];
		const results: {
			git: readonly ISessionFileDiff[] | undefined;
			pair: { parent: string; current: string } | undefined;
			baseline: string | undefined;
		} = { git: [gitOnlyDiff], pair: { parent: 'parent', current: 'current' }, baseline: 'baseline' };
		const git = createNoopGitService();
		git.computeFileDiffsBetweenRefs = async (directory, refs) => {
			gitCalls.push({ directory: directory.toString(), fromRef: refs.fromRef, toRef: refs.toRef });
			return results.git;
		};
		git.getRepositoryRoot = async directory => {
			repositoryCalls.push(directory.toString());
			return directory;
		};
		const checkpoints: IAgentHostCheckpointService = {
			...NULL_CHECKPOINT_SERVICE,
			getBaselineCheckpoint: async () => {
				checkpointCalls.push('baseline');
				return results.baseline;
			},
			getTurnCheckpointPair: async (_session, id) => {
				checkpointCalls.push(id);
				return results.pair;
			},
		};
		const subscriptions = new Set([sessionChangeset, turnChangeset]);
		const subscriptionService: IAgentHostChangesetSubscriptionService = {
			_serviceBrand: undefined,
			onDidChangeSessionSubscriptions: Event.None,
			getSessionSubscriptions: () => subscriptions,
			addSubscription: (_session, uri) => { subscriptions.add(uri); },
			removeSubscription: (_session, uri) => { subscriptions.delete(uri); },
			clearSessionSubscriptions: () => { subscriptions.clear(); },
		};
		const operations: IAgentHostChangesetOperationService = {
			_serviceBrand: undefined,
			registerContribution: () => Disposable.None,
			updateOperations: () => { },
			getOperations: () => undefined,
			invokeChangesetOperation: async () => ({}),
			dispose: () => { },
		};
		const data = createSessionDataService(db);
		const peerData = options.peer ? createSessionDataService(options.peer.db) : undefined;
		class TestChangesetService extends AgentHostChangesetService {
			protected override _createDiffComputeService() { return diff; }
		}
		const service = disposables.add(new TestChangesetService(
			state, new NullLogService(), {
			...data,
			openDatabase: resource => {
				databaseCalls.push(resource.toString());
				if (resource.toString() === options.unavailableDatabase) {
					throw new Error('Database unavailable');
				}
				return options.peer?.resource === resource.toString() && peerData
					? peerData.openDatabase(resource)
					: data.openDatabase(resource);
			},
		},
			git, checkpoints, configuration, operations, subscriptionService,
			NULL_REVIEW_SERVICE, NullTelemetryService, {
			_serviceBrand: undefined,
			onDidRefreshSessionGitState: Event.None,
			onDidChangeSessionGitHubState: Event.None,
			refreshSessionGitState: async () => { },
			getSessionGitState: () => undefined,
			getMaterializedWorktreeMeta: () => undefined,
			resolveSessionBaseBranchName: async () => undefined,
			setSessionGitHubState: async () => { },
			recordSessionMerge: async () => { },
			attachSessionGitHubPullRequest: async () => { },
		}, new NullAgentHostWorktreeIsolation(),
		));
		state.createSession({
			resource: session,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: '2026-09-01T00:00:00.000Z',
			modifiedAt: '2026-09-01T00:00:00.000Z',
			workingDirectories: options.workingDirectories ?? ['file:///repo'],
		});
		state.setSessionChangesets(session, buildDefaultChangesetCatalog(session));
		state.dispatchServerAction(session, { type: ActionType.SessionReady });
		setIsolation(state, options.isolation);
		addTurn(state, turnId);
		if (options.peer) {
			state.addChat(session, options.peer.resource);
			addTurn(state, options.peer.turnId, options.peer.resource);
		}
		return { service, state, db, diff, git, checkpoints, results, subscriptions, gitCalls, repositoryCalls, checkpointCalls, databaseCalls };
	}

	function nextPublication(state: AgentHostStateManager, uri: string): Promise<void> {
		const onPublication = Event.filter(state.onDidEmitEnvelope, e => e.channel === uri && (
			e.action.type === ActionType.ChangesetContentChanged ||
			(e.action.type === ActionType.ChangesetStatusChanged && e.action.status === ChangesetStatus.Error)
		));
		return new Promise(resolve => disposables.add(Event.once(onPublication)(() => resolve())));
	}

	async function refresh(fixture: ReturnType<typeof createFixture>, strategy?: ChangesetDiffStrategy): Promise<void> {
		const published = nextPublication(fixture.state, sessionChangeset);
		fixture.service.refreshSessionChangeset(session, strategy);
		await published;
	}

	function snapshot(state: AgentHostStateManager, uri: string) {
		const value = state.getChangesetState(uri);
		return {
			status: value?.status,
			errorType: value?.error?.errorType,
			edits: value?.files.map(file => file.edit).sort((a, b) => (a.after?.uri ?? a.before!.uri).localeCompare(b.after?.uri ?? b.before!.uri)),
		};
	}

	function ready(edits: ISessionFileDiff[]) {
		return { status: ChangesetStatus.Ready, errorType: undefined, edits };
	}

	function recordSessionPublications(fixture: ReturnType<typeof createFixture>, count: number) {
		const done = new DeferredPromise<void>();
		const publications: ReturnType<typeof snapshot>[] = [];
		disposables.add(fixture.state.onDidEmitEnvelope(envelope => {
			if (envelope.channel === sessionChangeset && envelope.action.type === ActionType.ChangesetStatusChanged && envelope.action.status === ChangesetStatus.Ready) {
				publications.push(snapshot(fixture.state, sessionChangeset));
				if (publications.length === count) {
					void done.complete();
				}
			}
		}));
		return { publications, done: done.p };
	}

	for (const isolation of ['folder', 'worktree', undefined, 'unrecognized']) {
		for (const strategy of [undefined, 'auto', 'git', 'fileEditTracker'] as const) {
			test(`${isolation ?? 'legacy'} isolation with ${strategy ?? 'omitted'} strategy selects the requested session and turn sources`, async () => {
				const fixture = createFixture({ isolation });
				addEdit(fixture.db);
				const tracker = strategy === 'fileEditTracker';

				await refresh(fixture, strategy);
				await fixture.service.computeTurnChangeset(session, turnId, strategy);

				assert.deepStrictEqual({
					session: snapshot(fixture.state, sessionChangeset),
					turn: snapshot(fixture.state, turnChangeset),
					git: fixture.gitCalls,
					checkpoints: fixture.checkpointCalls.sort(),
					repositories: fixture.repositoryCalls,
					tracked: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls, fixture.diff.callCount],
				}, {
					session: ready(tracker ? [trackedDiff()] : [gitOnlyDiff]),
					turn: ready(tracker ? [trackedDiff()] : [gitOnlyDiff]),
					git: tracker ? [] : [
						{ directory: 'file:///repo', fromRef: 'baseline', toRef: 'current' },
						{ directory: 'file:///repo', fromRef: 'parent', toRef: 'current' },
					],
					checkpoints: tracker ? [] : ['baseline', turnId, turnId],
					repositories: [],
					tracked: tracker ? [1, 1, 2] : [0, 0, 0],
				});
			});
		}
	}

	test('explicit overrides are one-shot rather than a session preference', async () => {
		const fixture = createFixture({ isolation: 'folder' });
		addEdit(fixture.db);
		await refresh(fixture, 'fileEditTracker');
		await fixture.service.computeTurnChangeset(session, turnId, 'fileEditTracker');
		await refresh(fixture);
		await fixture.service.computeTurnChangeset(session, turnId);

		assert.deepStrictEqual({
			session: snapshot(fixture.state, sessionChangeset),
			turn: snapshot(fixture.state, turnChangeset),
			gitCalls: fixture.gitCalls.length,
			isolation: fixture.state.getSessionState(session)?.config?.values[SessionConfigKey.Isolation],
		}, { session: ready([gitOnlyDiff]), turn: ready([gitOnlyDiff]), gitCalls: 2, isolation: 'folder' });
	});

	for (const strategies of [
		['git', 'fileEditTracker'],
		['fileEditTracker', 'git'],
		['auto', 'fileEditTracker'],
		['fileEditTracker', 'auto'],
		['git', 'fileEditTracker', 'git'],
		['git', 'git', 'fileEditTracker', 'fileEditTracker'],
	] as const) {
		test(`same-tick refreshes preserve ${strategies.join(', ')} requests in order`, async () => {
			const fixture = createFixture();
			addEdit(fixture.db);
			fixture.subscriptions.delete(turnChangeset);
			const distinctStrategies = strategies.filter((strategy, index) => index === 0 || strategy !== strategies[index - 1]);
			const { publications, done } = recordSessionPublications(fixture, distinctStrategies.length);

			for (const strategy of strategies) {
				if (strategy !== 'fileEditTracker') {
					fixture.service.refreshSessionChangeset(session, strategy);
				} else {
					fixture.service.onTurnComplete(session, turnId);
				}
			}
			await done;

			assert.deepStrictEqual({
				publications,
				gitCalls: fixture.gitCalls.length,
				trackerReads: fixture.db.getAllFileEditsCalls,
			}, {
				publications: distinctStrategies.map(strategy => ready([strategy === 'fileEditTracker' ? trackedDiff() : gitOnlyDiff])),
				gitCalls: distinctStrategies.filter(strategy => strategy !== 'fileEditTracker').length,
				trackerReads: distinctStrategies.filter(strategy => strategy === 'fileEditTracker').length,
			});
		});
	}

	test('different strategies remain ordered behind an in-flight Git computation', async () => {
		const fixture = createFixture();
		addEdit(fixture.db);
		fixture.subscriptions.delete(turnChangeset);
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const computeGit = fixture.git.computeFileDiffsBetweenRefs;
		fixture.git.computeFileDiffsBetweenRefs = async (directory, refs) => {
			void started.complete();
			await release.p;
			return computeGit(directory, refs);
		};
		const { publications, done } = recordSessionPublications(fixture, 3);
		fixture.service.refreshSessionChangeset(session, 'git');
		await started.p;
		fixture.service.onTurnComplete(session, turnId);
		fixture.service.refreshSessionChangeset(session, 'git');
		await timeout(0);
		const beforeRelease = { publications: [...publications], trackerReads: fixture.db.getAllFileEditsCalls };
		await release.complete();
		await done;

		assert.deepStrictEqual({ beforeRelease, publications }, {
			beforeRelease: { publications: [], trackerReads: 0 },
			publications: [ready([gitOnlyDiff]), ready([trackedDiff()]), ready([gitOnlyDiff])],
		});
	});

	test('removing an owner cancels all queued strategies', async () => {
		const fixture = createFixture();
		addEdit(fixture.db);
		fixture.service.refreshSessionChangeset(session, 'git');
		fixture.service.refreshSessionChangeset(session, 'fileEditTracker');
		fixture.service.onChangesetOwnerRemoved(session);
		await timeout(0);
		assert.deepStrictEqual({ git: fixture.gitCalls, databases: fixture.databaseCalls }, { git: [], databases: [] });
	});

	for (const workingDirectories of [['file:///repo'], ['file:///repo', 'file:///second']]) {
		const peer = buildChatUri(session, 'peer');
		for (const [owner, id, unavailableDatabase] of [
			[session, turnId, session],
			[buildDefaultChatUri(session), turnId, session],
			[peer, 'peer-turn', peer],
			[session, 'peer-turn', peer],
		]) {
			test(`strict Git bypasses unavailable tracked storage for ${owner}/${id} with ${workingDirectories.length} roots`, async () => {
				const peerDb = new TestSessionDatabase();
				const fixture = createFixture({ workingDirectories, peer: { resource: peer, db: peerDb, turnId: 'peer-turn' }, unavailableDatabase });
				addEdit(fixture.db);
				addEdit(peerDb, '/repo/peer.txt', 'peer-turn');
				const uri = await fixture.service.computeTurnChangeset(owner, id, 'git');
				assert.deepStrictEqual({
					state: snapshot(fixture.state, uri),
					databases: fixture.databaseCalls,
					gitCalls: fixture.gitCalls.length,
					checkpoints: fixture.checkpointCalls,
					trackedReads: [fixture.db.getFileEditsByTurnCalls, peerDb.getFileEditsByTurnCalls],
				}, {
					state: ready([gitOnlyDiff]),
					databases: [],
					gitCalls: workingDirectories.length,
					checkpoints: workingDirectories.map(() => id),
					trackedReads: [0, 0],
				});
			});
		}
	}

	test('strict Git reports missing turn checkpoints without opening unavailable tracked storage', async () => {
		const fixture = createFixture({ unavailableDatabase: session });
		fixture.results.pair = undefined;
		await fixture.service.computeTurnChangeset(session, turnId, 'git');
		assert.deepStrictEqual({
			state: snapshot(fixture.state, turnChangeset),
			databases: fixture.databaseCalls,
			checkpoints: fixture.checkpointCalls,
			git: fixture.gitCalls,
		}, {
			state: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [] },
			databases: [],
			checkpoints: [turnId],
			git: [],
		});
	});

	for (const isolation of ['folder', 'worktree']) {
		for (const strategy of [undefined, 'auto'] as const) {
			for (const failure of ['missing checkpoints', 'unavailable diff']) {
				test(`${isolation} isolation with ${strategy ?? 'omitted'} strategy retains fallback for ${failure}`, async () => {
					const fixture = createFixture({ isolation });
					addEdit(fixture.db);
					if (failure === 'missing checkpoints') {
						fixture.results.pair = undefined;
					} else {
						fixture.results.git = undefined;
					}
					await refresh(fixture, strategy);
					await fixture.service.computeTurnChangeset(session, turnId, strategy);
					assert.deepStrictEqual({
						session: snapshot(fixture.state, sessionChangeset),
						turn: snapshot(fixture.state, turnChangeset),
						reads: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls],
						gitCalls: fixture.gitCalls.length,
					}, {
						session: ready([trackedDiff()]), turn: ready([trackedDiff()]),
						reads: [1, 1], gitCalls: failure === 'missing checkpoints' ? 0 : 2,
					});
				});
			}
		}
	}

	test('tracker with no edits succeeds empty even when Git has changes', async () => {
		const fixture = createFixture({ isolation: 'folder' });
		await refresh(fixture, 'fileEditTracker');
		await fixture.service.computeTurnChangeset(session, turnId, 'fileEditTracker');
		assert.deepStrictEqual({
			session: snapshot(fixture.state, sessionChangeset),
			turn: snapshot(fixture.state, turnChangeset),
			gitCalls: fixture.gitCalls,
			checkpoints: fixture.checkpointCalls,
		}, { session: ready([]), turn: ready([]), gitCalls: [], checkpoints: [] });
	});

	for (const failure of ['missing checkpoints', 'unavailable diff', 'thrown diff'] as const) {
		test(`strict Git reports ${failure} without replacing cached files or reading tracked edits`, async () => {
			const fixture = createFixture();
			addEdit(fixture.db);
			await refresh(fixture, 'git');
			await fixture.service.computeTurnChangeset(session, turnId, 'git');
			if (failure === 'missing checkpoints') {
				fixture.results.pair = undefined;
			} else if (failure === 'unavailable diff') {
				fixture.results.git = undefined;
			} else {
				fixture.git.computeFileDiffsBetweenRefs = async () => { throw new Error('Git failed'); };
			}

			await refresh(fixture, 'git');
			await fixture.service.computeTurnChangeset(session, turnId, 'git');
			assert.deepStrictEqual({
				session: snapshot(fixture.state, sessionChangeset),
				turn: snapshot(fixture.state, turnChangeset),
				tracked: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls, fixture.diff.callCount],
			}, {
				session: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [gitOnlyDiff] },
				turn: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [gitOnlyDiff] },
				tracked: [0, 0, 0],
			});
		});
	}

	test('strict session Git requires a baseline rather than manufacturing zero changes', async () => {
		const fixture = createFixture();
		addEdit(fixture.db);
		fixture.results.baseline = undefined;
		await refresh(fixture, 'git');
		assert.deepStrictEqual({
			state: snapshot(fixture.state, sessionChangeset),
			git: fixture.gitCalls,
			tracked: fixture.db.getAllFileEditsCalls,
		}, { state: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [] }, git: [], tracked: 0 });
	});

	for (const strategy of ['auto', 'git'] as const) {
		test(`${strategy} accepts an empty Git result without tracked fallback`, async () => {
			const fixture = createFixture();
			addEdit(fixture.db);
			fixture.results.git = [];
			await refresh(fixture, strategy);
			await fixture.service.computeTurnChangeset(session, turnId, strategy);
			assert.deepStrictEqual({
				session: snapshot(fixture.state, sessionChangeset),
				turn: snapshot(fixture.state, turnChangeset),
				gitCalls: fixture.gitCalls.length,
				tracked: fixture.diff.callCount,
			}, { session: ready([]), turn: ready([]), gitCalls: 2, tracked: 0 });
		});

		test(`${strategy} accepts equal turn refs while tracker still returns recorded edits`, async () => {
			const fixture = createFixture();
			addEdit(fixture.db);
			fixture.results.pair = { parent: 'same', current: 'same' };
			await fixture.service.computeTurnChangeset(session, turnId, strategy);
			const gitState = snapshot(fixture.state, turnChangeset);
			await fixture.service.computeTurnChangeset(session, turnId, 'fileEditTracker');
			assert.deepStrictEqual({
				gitState,
				trackedState: snapshot(fixture.state, turnChangeset),
				gitCalls: fixture.gitCalls,
				checkpoints: fixture.checkpointCalls,
			}, { gitState: ready([]), trackedState: ready([trackedDiff()]), gitCalls: [], checkpoints: [turnId] });
		});
	}

	test('auto retains session fallback for Git exceptions without changing single-root turn errors', async () => {
		const fixture = createFixture({ isolation: 'folder' });
		addEdit(fixture.db);
		fixture.git.computeFileDiffsBetweenRefs = async () => { throw new Error('Git failed'); };
		await refresh(fixture, 'auto');
		await fixture.service.computeTurnChangeset(session, turnId, 'auto');
		assert.deepStrictEqual({
			session: snapshot(fixture.state, sessionChangeset),
			turn: snapshot(fixture.state, turnChangeset),
			tracked: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls],
		}, {
			session: ready([trackedDiff()]),
			turn: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [] },
			tracked: [1, 0],
		});
	});

	test('tracker errors never reverse-fallback to Git', async () => {
		class FailingDatabase extends TestSessionDatabase {
			override async getAllFileEdits(): Promise<never> { throw new Error('Unavailable snapshots'); }
			override async getFileEditsByTurn(): Promise<never> { throw new Error('Unavailable snapshots'); }
		}
		const fixture = createFixture({ isolation: 'folder', db: new FailingDatabase() });
		await refresh(fixture, 'fileEditTracker');
		await fixture.service.computeTurnChangeset(session, turnId, 'fileEditTracker');
		assert.deepStrictEqual({
			session: snapshot(fixture.state, sessionChangeset),
			turn: snapshot(fixture.state, turnChangeset),
			git: fixture.gitCalls,
			checkpoints: fixture.checkpointCalls,
		}, {
			session: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [] },
			turn: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [] },
			git: [], checkpoints: [],
		});
	});

	test('tracker unions peer snapshots and resolves the owning turn database', async () => {
		const peer = buildChatUri(session, 'peer');
		const peerDb = new TestSessionDatabase();
		const fixture = createFixture({ isolation: 'folder', peer: { resource: peer, db: peerDb, turnId: 'peer-turn' } });
		addEdit(fixture.db);
		addEdit(peerDb, trackedPath, 'peer-turn', 'peer-edit', 'before\nafter', 'before\nafter\npeer');
		await refresh(fixture, 'fileEditTracker');
		const uri = await fixture.service.computeTurnChangeset(session, 'peer-turn', 'fileEditTracker');
		const union = trackedDiff();
		union.after = trackedDiff(trackedPath, peer, 'peer-edit').after;
		union.diff = { added: 2, removed: 0 };
		assert.deepStrictEqual({
			session: snapshot(fixture.state, sessionChangeset),
			turn: snapshot(fixture.state, uri),
			reads: [fixture.db.getAllFileEditsCalls, peerDb.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls, peerDb.getFileEditsByTurnCalls],
			git: fixture.gitCalls,
			checkpoints: fixture.checkpointCalls,
		}, {
			session: ready([union]),
			turn: ready([trackedDiff(trackedPath, peer, 'peer-edit')]),
			reads: [1, 1, 0, 1],
			git: [], checkpoints: [],
		});
	});

	test('ambiguous tracker turn ownership errors without reading an unrelated database', async () => {
		const peer = buildChatUri(session, 'peer');
		const peerDb = new TestSessionDatabase();
		const fixture = createFixture({ isolation: 'folder', peer: { resource: peer, db: peerDb, turnId } });
		addEdit(fixture.db);
		addEdit(peerDb);
		await fixture.service.computeTurnChangeset(session, turnId, 'fileEditTracker');
		assert.deepStrictEqual({
			turn: snapshot(fixture.state, turnChangeset),
			reads: [fixture.db.getFileEditsByTurnCalls, peerDb.getFileEditsByTurnCalls],
			git: fixture.gitCalls,
		}, { turn: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [] }, reads: [0, 0], git: [] });
	});

	test('tracker preserves cached session files when a peer database cannot be opened', async () => {
		const peer = buildChatUri(session, 'peer');
		const fixture = createFixture({
			peer: { resource: peer, db: new TestSessionDatabase(), turnId: 'peer-turn' },
			unavailableDatabase: peer,
		});
		addEdit(fixture.db);
		fixture.service.restoreStaticChangeset(session, 'session', [gitOnlyDiff]);
		await refresh(fixture, 'fileEditTracker');
		assert.deepStrictEqual({
			state: snapshot(fixture.state, sessionChangeset),
			git: fixture.gitCalls,
			tracked: fixture.db.getAllFileEditsCalls,
		}, { state: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [gitOnlyDiff] }, git: [], tracked: 0 });
	});

	test('tracker includes every tracked root without repository partitioning or path filtering', async () => {
		const fixture = createFixture({ isolation: 'folder', workingDirectories: ['file:///repo', 'file:///non-git'] });
		const paths = ['/non-git/file.txt', '/outside/file.txt', trackedPath];
		for (const path of paths) {
			addEdit(fixture.db, path);
		}
		await refresh(fixture, 'fileEditTracker');
		await fixture.service.computeTurnChangeset(session, turnId, 'fileEditTracker');
		assert.deepStrictEqual({
			session: snapshot(fixture.state, sessionChangeset),
			turn: snapshot(fixture.state, turnChangeset),
			repositories: fixture.repositoryCalls,
			checkpoints: fixture.checkpointCalls,
			git: fixture.gitCalls,
		}, { session: ready(paths.map(path => trackedDiff(path))), turn: ready(paths.map(path => trackedDiff(path))), repositories: [], checkpoints: [], git: [] });
	});

	for (const failure of ['non-git root', 'missing checkpoint', 'unavailable diff', 'thrown diff'] as const) {
		test(`strict multi-root Git rejects ${failure} rather than publishing partial success`, async () => {
			const fixture = createFixture({ workingDirectories: ['file:///repo', 'file:///second'] });
			addEdit(fixture.db);
			await refresh(fixture, 'git');
			await fixture.service.computeTurnChangeset(session, turnId, 'git');
			const repositoryRoot = fixture.git.getRepositoryRoot;
			const checkpointPair = fixture.checkpoints.getTurnCheckpointPair;
			const computeGit = fixture.git.computeFileDiffsBetweenRefs;
			if (failure === 'non-git root') {
				fixture.git.getRepositoryRoot = async directory => directory.path === '/second' ? undefined : repositoryRoot(directory);
			} else if (failure === 'missing checkpoint') {
				fixture.checkpoints.getTurnCheckpointPair = async (resource, id, directory) => directory?.path === '/second' ? undefined : checkpointPair(resource, id, directory);
			} else {
				fixture.git.computeFileDiffsBetweenRefs = async (directory, refs) => {
					if (directory.path === '/second') {
						if (failure === 'thrown diff') {
							throw new Error('Second repository failed');
						}
						return undefined;
					}
					return computeGit(directory, refs);
				};
			}
			await refresh(fixture, 'git');
			await fixture.service.computeTurnChangeset(session, turnId, 'git');
			assert.deepStrictEqual({
				session: snapshot(fixture.state, sessionChangeset),
				turn: snapshot(fixture.state, turnChangeset),
				tracked: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls, fixture.diff.callCount],
			}, {
				session: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [gitOnlyDiff] },
				turn: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [gitOnlyDiff] },
				tracked: [0, 0, 0],
			});
		});
	}

	for (const baseline of ['git', 'restored'] as const) {
		test(`an explicit tracker refresh replaces the entire ${baseline} cache`, async () => {
			const fixture = createFixture({ isolation: 'folder' });
			addEdit(fixture.db);
			if (baseline === 'git') {
				await refresh(fixture, 'git');
			} else {
				fixture.service.restoreStaticChangeset(session, 'session', [gitOnlyDiff]);
			}
			addEdit(fixture.db, '/repo/second.txt', 'turn-2', 'edit-2');
			await refresh(fixture, 'fileEditTracker');
			assert.deepStrictEqual({
				state: snapshot(fixture.state, sessionChangeset),
				reads: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls, fixture.diff.callCount],
			}, {
				state: ready([trackedDiff('/repo/second.txt', session, 'edit-2'), trackedDiff()]),
				reads: [1, 0, 2],
			});
		});

		test(`a lifecycle tracker recompute does not incrementally reuse a ${baseline} cache`, async () => {
			const fixture = createFixture();
			addEdit(fixture.db);
			if (baseline === 'git') {
				await refresh(fixture, 'git');
			} else {
				fixture.service.restoreStaticChangeset(session, 'session', [gitOnlyDiff]);
			}
			addEdit(fixture.db, '/repo/second.txt', 'turn-2', 'edit-2');
			const published = nextPublication(fixture.state, sessionChangeset);
			fixture.service.onTurnComplete(session, 'turn-2');
			await published;
			assert.deepStrictEqual({
				state: snapshot(fixture.state, sessionChangeset),
				reads: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls],
			}, {
				state: ready([trackedDiff('/repo/second.txt', session, 'edit-2'), trackedDiff()]),
				reads: [1, 0],
			});
		});
	}

	test('auto fallback retains incremental tracker computation for the next turn', async () => {
		const fixture = createFixture({ isolation: 'worktree' });
		fixture.results.git = undefined;
		addEdit(fixture.db);
		await refresh(fixture);
		addEdit(fixture.db, '/repo/second.txt', 'turn-2', 'edit-2');
		const published = nextPublication(fixture.state, sessionChangeset);
		fixture.service.onTurnComplete(session, 'turn-2');
		await published;
		assert.deepStrictEqual({
			state: snapshot(fixture.state, sessionChangeset),
			reads: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls, fixture.diff.callCount],
		}, { state: ready([trackedDiff('/repo/second.txt', session, 'edit-2'), trackedDiff()]), reads: [1, 1, 2] });
	});

	for (const isolation of ['folder', 'worktree']) {
		test(`tool edits and turn completion use tracker for ${isolation} changesets`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const fixture = createFixture({ isolation });
			addEdit(fixture.db);
			let published = Promise.all([nextPublication(fixture.state, sessionChangeset), nextPublication(fixture.state, turnChangeset)]);
			fixture.service.onToolCallEditsApplied(session, turnId);
			await published;
			const midTurn = [snapshot(fixture.state, sessionChangeset), snapshot(fixture.state, turnChangeset)];
			addEdit(fixture.db, '/repo/second.txt', turnId, 'edit-2');
			published = Promise.all([nextPublication(fixture.state, sessionChangeset), nextPublication(fixture.state, turnChangeset)]);
			fixture.service.onToolCallEditsApplied(session, turnId);
			fixture.service.onTurnComplete(session, turnId);
			await published;
			await timeout(6_000);
			assert.deepStrictEqual({
				midTurn,
				completed: [snapshot(fixture.state, sessionChangeset), snapshot(fixture.state, turnChangeset)],
				gitCalls: fixture.gitCalls.length,
				trackedReads: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls],
			}, {
				midTurn: [ready([trackedDiff()]), ready([trackedDiff()])],
				completed: [
					ready([trackedDiff('/repo/second.txt', session, 'edit-2'), trackedDiff()]),
					ready([trackedDiff('/repo/second.txt', session, 'edit-2'), trackedDiff()]),
				],
				gitCalls: 0,
				trackedReads: [2, 3],
			});
		}));
	}

	for (const owner of ['default', 'peer'] as const) {
		test(`${owner} chat lifecycle changesets use only that chat's tracked snapshots`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const peer = buildChatUri(session, 'peer');
			const peerDb = new TestSessionDatabase();
			const fixture = createFixture({ peer: { resource: peer, db: peerDb, turnId: 'peer-turn' } });
			addEdit(fixture.db);
			addEdit(peerDb, '/repo/peer.txt', 'peer-turn', 'peer-edit');
			const chat = owner === 'default' ? buildDefaultChatUri(session) : peer;
			const id = owner === 'default' ? turnId : 'peer-turn';
			const chatChangeset = buildSessionChangesetUri(chat);
			const chatTurnChangeset = buildTurnChangesetUri(chat, id);
			fixture.subscriptions.add(chatTurnChangeset);
			const expected = ready([owner === 'default' ? trackedDiff() : trackedDiff('/repo/peer.txt', peer, 'peer-edit')]);
			let published = Promise.all([nextPublication(fixture.state, chatChangeset), nextPublication(fixture.state, chatTurnChangeset)]);
			fixture.service.onToolCallEditsApplied(chat, id);
			await published;
			const midTurn = [snapshot(fixture.state, chatChangeset), snapshot(fixture.state, chatTurnChangeset)];
			published = Promise.all([nextPublication(fixture.state, chatChangeset), nextPublication(fixture.state, chatTurnChangeset)]);
			fixture.service.onTurnComplete(chat, id);
			await published;
			assert.deepStrictEqual({
				midTurn,
				completed: [snapshot(fixture.state, chatChangeset), snapshot(fixture.state, chatTurnChangeset)],
				git: fixture.gitCalls,
				checkpoints: fixture.checkpointCalls,
			}, { midTurn: [expected, expected], completed: [expected, expected], git: [], checkpoints: [] });
		}));
	}

	test('truncation drops removed edits instead of reusing the previous tracker baseline', async () => {
		const fixture = createFixture({ isolation: 'folder' });
		addEdit(fixture.db);
		addEdit(fixture.db, '/repo/deleted-turn.txt', 'turn-2', 'edit-2');
		await refresh(fixture, 'fileEditTracker');
		await fixture.db.deleteTurn('turn-2');
		const published = nextPublication(fixture.state, sessionChangeset);
		fixture.service.onSessionTruncated(session);
		await published;
		assert.deepStrictEqual({
			state: snapshot(fixture.state, sessionChangeset),
			reads: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls],
			git: fixture.gitCalls,
		}, { state: ready([trackedDiff()]), reads: [2, 0], git: [] });
	});

	test('restore and subscription refreshes select tracker after isolation changes', async () => {
		const fixture = createFixture();
		addEdit(fixture.db);
		await refresh(fixture);
		await fixture.service.computeTurnChangeset(session, turnId);
		setIsolation(fixture.state, 'folder');
		const published = Promise.all([nextPublication(fixture.state, sessionChangeset), nextPublication(fixture.state, turnChangeset)]);
		fixture.service.onWorkingDirectoryAvailable(session);
		await published;
		assert.deepStrictEqual({
			session: snapshot(fixture.state, sessionChangeset),
			turn: snapshot(fixture.state, turnChangeset),
			gitCalls: fixture.gitCalls.length,
			reads: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls],
		}, { session: ready([trackedDiff()]), turn: ready([trackedDiff()]), gitCalls: 2, reads: [1, 1] });
	});

	test('branch, uncommitted, and compare-turns computations remain Git-backed', async () => {
		const fixture = createFixture();
		addEdit(fixture.db);
		const workingTreeCalls: string[] = [];
		fixture.git.computeSessionFileDiffs = async directory => {
			workingTreeCalls.push(directory.toString());
			return [gitOnlyDiff];
		};
		fixture.checkpoints.getTurnCheckpointPair = async (_resource, id) => ({ parent: 'parent', current: id });
		const branchUri = buildBranchChangesetUri(buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId(['file:///repo'])));
		const published = nextPublication(fixture.state, branchUri);
		fixture.service.refreshBranchChangeset(session);
		await published;
		fixture.subscriptions.add(buildUncommittedChangesetUri(session));
		const uncommittedUri = await fixture.service.computeUncommittedChangeset(session);
		const compareUri = await fixture.service.computeCompareTurnsChangeset(session, turnId, 'turn-2');
		assert.deepStrictEqual({
			states: [branchUri, uncommittedUri, compareUri].map(uri => snapshot(fixture.state, uri)),
			workingTreeCalls,
			checkpointDiffs: fixture.gitCalls,
			trackedReads: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls],
		}, {
			states: [ready([gitOnlyDiff]), ready([gitOnlyDiff]), ready([gitOnlyDiff])],
			workingTreeCalls: ['file:///repo', 'file:///repo'],
			checkpointDiffs: [{ directory: 'file:///repo', fromRef: turnId, toRef: 'turn-2' }],
			trackedReads: [0, 0],
		});
	});

	for (const failure of ['non-git folder', 'unavailable diff', 'thrown diff'] as const) {
		test(`branch and uncommitted changes never fall back to tracked edits for ${failure}`, async () => {
			const fixture = createFixture();
			addEdit(fixture.db);
			fixture.git.computeSessionFileDiffs = async () => [gitOnlyDiff];
			const branchUri = buildBranchChangesetUri(buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId(['file:///repo'])));
			const published = nextPublication(fixture.state, branchUri);
			fixture.service.refreshBranchChangeset(session);
			await published;
			fixture.subscriptions.add(buildUncommittedChangesetUri(session));
			const uncommittedUri = await fixture.service.computeUncommittedChangeset(session);

			if (failure === 'non-git folder') {
				fixture.git.getRepositoryRoot = async () => undefined;
			}
			fixture.git.computeSessionFileDiffs = async () => {
				if (failure === 'thrown diff') {
					throw new Error('Git failed');
				}
				return undefined;
			};
			const onBranchRestored = Event.filter(fixture.state.onDidEmitEnvelope, e => e.channel === branchUri
				&& e.action.type === ActionType.ChangesetStatusChanged && e.action.status === ChangesetStatus.Ready);
			const restored = new Promise<void>(resolve => disposables.add(Event.once(onBranchRestored)(() => resolve())));
			fixture.service.refreshBranchChangeset(session);
			await restored;
			await fixture.service.computeUncommittedChangeset(session);

			assert.deepStrictEqual({
				branch: snapshot(fixture.state, branchUri),
				uncommitted: snapshot(fixture.state, uncommittedUri),
				trackedReads: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls],
			}, {
				branch: ready([gitOnlyDiff]),
				uncommitted: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [gitOnlyDiff] },
				trackedReads: [0, 0],
			});
		});
	}
});
