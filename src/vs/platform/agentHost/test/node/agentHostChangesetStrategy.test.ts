/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun, observableFromEvent, observableValue, type ISettableObservable } from '../../../../base/common/observable.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AgentSession } from '../../common/agent.js';
import { NULL_CHECKPOINT_SERVICE, type IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import { type IAgentHostChangesetOperationService } from '../../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService, type ChangesetDiffStrategy } from '../../common/agentHostChangesetService.js';
import type { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { type IAgentHostChangesetSubscriptionService } from '../../common/agentHostChangesetSubscriptionService.js';
import { NULL_REVIEW_SERVICE } from '../../common/agentHostReviewService.js';
import { buildBranchChangesetUri, buildDefaultChangesetCatalog, buildFolderChangesetOwnerUri, buildSessionChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { buildSessionDbUri } from '../../common/sessionDbUri.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChangesetStatus, FileEditKind, MessageKind, SessionStatus, withSessionGitState, type ISessionFileDiff, type ISessionGitState } from '../../common/state/sessionState.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { GitRepositoryRootsContribution } from '../../node/chatContributions/gitRepositoryRoots/gitRepositoryRootsContribution.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { AgentHostChangesetService } from '../../node/agentHostChangesetService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
import { createNoopGitService, createSessionDataService, encodeString, TestDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { createLegacyChatMetadataPersistence } from './chatMetadataTestHelpers.js';

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
		peer?: { resource: string; db: TestSessionDatabase; turnId: string; workingDirectories?: readonly string[] };
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
		const gitStates = new Map<string, ISessionGitState>();
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
		const subscriptionChanged = disposables.add(new Emitter<string>());
		const subscriptionService: IAgentHostChangesetSubscriptionService = {
			_serviceBrand: undefined,
			onDidChangeSessionSubscriptions: subscriptionChanged.event,
			getSessionSubscriptions: () => subscriptions,
			addSubscription: (_session, uri) => { subscriptions.add(uri); },
			removeSubscription: (_session, uri) => { subscriptions.delete(uri); },
			clearSessionSubscriptions: () => { subscriptions.clear(); },
		};
		const operations: IAgentHostChangesetOperationService = {
			_serviceBrand: undefined,
			registerContribution: () => Disposable.None,
			updateOperations: () => { },
			scheduleRelatedOperationsUpdate: () => { },
			scheduleOwnerOperationsUpdate: () => { },
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
			getSessionGitState: resource => gitStates.get(resource),
			getMaterializedWorktreeMeta: () => undefined,
			setFolderGitState: async () => { },
			resolveSessionBaseBranchName: async () => undefined,
			setSessionGitHubState: async () => { },
			recordSessionMerge: async () => { },
			attachSessionGitHubPullRequest: async () => { },
		}, new NullAgentHostWorktreeIsolation(),
			{ _serviceBrand: undefined, setRead: async () => { }, setArchived: async () => { }, ...createLegacyChatMetadataPersistence(data) },
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
			state.addChat(session, options.peer.resource, { workingDirectories: options.peer.workingDirectories });
			addTurn(state, options.peer.turnId, options.peer.resource);
		}
		return { service, state, db, diff, git, gitStates, checkpoints, results, subscriptions, gitCalls, repositoryCalls, checkpointCalls, databaseCalls, configuration, subscriptionChanged };
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

	test('subscribed session refreshes preserve checkpoint edits from default and peer chats', async () => {
		const fixture = createFixture({
			peer: { resource: buildChatUri(session, 'peer'), db: new TestSessionDatabase(), turnId: 'peer-turn' },
		});
		const edits = ['default-provider.txt', 'peer-provider.txt'].map(name => ({
			after: { uri: URI.file(`/repo/${name}`).toString(), content: { uri: `git:/${name}` } },
			diff: { added: 1, removed: 0 },
		}));
		fixture.results.git = edits;
		await refresh(fixture);

		const { publications, done } = recordSessionPublications(fixture, 1);
		fixture.service.recomputeSubscribedChangesets(session);
		await done;

		assert.deepStrictEqual(publications, [ready(edits)]);
	});

	test('subscribed session refreshes fall back to tracked edits without checkpoints', async () => {
		const fixture = createFixture();
		fixture.results.baseline = undefined;
		addEdit(fixture.db);
		const { publications, done } = recordSessionPublications(fixture, 1);

		fixture.service.recomputeSubscribedChangesets(session);
		await done;

		assert.deepStrictEqual(publications, [ready([trackedDiff()])]);
	});

	for (const owner of ['default', 'peer'] as const) {
		for (const workingDirectories of [['file:///repo'], ['file:///repo', 'file:///other']]) {
			test(`subscription and background refreshes preserve an active ${owner} chat edit across ${workingDirectories.length} folder(s)`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
				const peer = buildChatUri(session, 'peer');
				const peerDb = new TestSessionDatabase();
				const fixture = createFixture({
					workingDirectories,
					peer: owner === 'peer' ? { resource: peer, db: peerDb, turnId: 'peer-turn' } : undefined,
				});
				await refresh(fixture);
				const chat = owner === 'default' ? buildDefaultChatUri(session) : peer;
				const activeTurnId = 'active-turn';
				fixture.state.dispatchServerAction(chat, {
					type: ActionType.ChatTurnStarted,
					turnId: activeTurnId,
					startedAt: '2026-09-01T00:00:01.000Z',
					message: { text: 'Edit another file', origin: { kind: MessageKind.User } },
				});
				addEdit(owner === 'default' ? fixture.db : peerDb, '/repo/active.txt', activeTurnId, 'active-edit');
				const published = nextPublication(fixture.state, sessionChangeset);
				fixture.service.onToolCallEditsApplied(chat, activeTurnId);
				await published;
				const beforeRefresh = snapshot(fixture.state, sessionChangeset);

				// First subscription and background Git-state refreshes both select auto.
				await refresh(fixture);
				const afterSubscribe = snapshot(fixture.state, sessionChangeset);
				const backgroundPublished = nextPublication(fixture.state, sessionChangeset);
				fixture.service.recomputeSubscribedChangesets(session);
				await backgroundPublished;
				const afterBackgroundRefresh = snapshot(fixture.state, sessionChangeset);
				const activeState = {
					id: fixture.state.getChatState(chat)?.activeTurn?.id,
					completed: fixture.state.getChatState(chat)?.turns.map(turn => turn.id),
				};

				fixture.state.dispatchServerAction(chat, { type: ActionType.ChatTurnComplete, turnId: activeTurnId, duration: 1 });
				const completedDiff: ISessionFileDiff = {
					after: { uri: URI.file('/repo/active.txt').toString(), content: { uri: 'git:/active.txt' } },
					diff: { added: 1, removed: 0 },
				};
				fixture.results.git = [completedDiff, gitOnlyDiff];
				await refresh(fixture);
				const expectedActive = ready([trackedDiff('/repo/active.txt', owner === 'default' ? session : peer, 'active-edit')]);
				assert.deepStrictEqual({ beforeRefresh, afterSubscribe, afterBackgroundRefresh, activeState, afterCompletion: snapshot(fixture.state, sessionChangeset) }, {
					beforeRefresh: expectedActive,
					afterSubscribe: expectedActive,
					afterBackgroundRefresh: expectedActive,
					activeState: { id: activeTurnId, completed: [owner === 'default' ? turnId : 'peer-turn'] },
					afterCompletion: ready([completedDiff, gitOnlyDiff]),
				});
			}));
		}
	}

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

	test('an auto refresh queued before a turn starts uses the active turn edits', async () => {
		const fixture = createFixture();
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const computeGit = fixture.git.computeFileDiffsBetweenRefs;
		fixture.git.computeFileDiffsBetweenRefs = async (directory, refs) => {
			void started.complete();
			await release.p;
			return computeGit(directory, refs);
		};
		const { publications, done } = recordSessionPublications(fixture, 2);
		fixture.service.refreshSessionChangeset(session, 'git');
		await started.p;
		fixture.service.refreshSessionChangeset(session);
		fixture.state.dispatchServerAction(buildDefaultChatUri(session), {
			type: ActionType.ChatTurnStarted,
			turnId: 'active-turn',
			startedAt: '2026-09-01T00:00:01.000Z',
			message: { text: 'Edit another file', origin: { kind: MessageKind.User } },
		});
		addEdit(fixture.db, '/repo/active.txt', 'active-turn', 'active-edit');
		await release.complete();
		await done;

		assert.deepStrictEqual(publications, [ready([gitOnlyDiff]), ready([trackedDiff('/repo/active.txt', session, 'active-edit')])]);
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

	test('tracker includes every working directory without repository partitioning and excludes files outside them', async () => {
		const fixture = createFixture({ isolation: 'folder', workingDirectories: ['file:///repo', 'file:///non-git'] });
		const paths = ['/non-git/file.txt', '/outside/file.txt', trackedPath];
		for (const path of paths) {
			addEdit(fixture.db, path);
		}
		await refresh(fixture, 'fileEditTracker');
		await fixture.service.computeTurnChangeset(session, turnId, 'fileEditTracker');
		const workspacePaths = ['/non-git/file.txt', trackedPath];
		assert.deepStrictEqual({
			session: snapshot(fixture.state, sessionChangeset),
			turn: snapshot(fixture.state, turnChangeset),
			repositories: fixture.repositoryCalls,
			checkpoints: fixture.checkpointCalls,
			git: fixture.gitCalls,
		}, { session: ready(workspacePaths.map(path => trackedDiff(path))), turn: ready(workspacePaths.map(path => trackedDiff(path))), repositories: [], checkpoints: [], git: [] });
	});

	for (const strategy of ['fileEditTracker', 'auto'] as const) {
		test(`${strategy} tracked edits exclude files outside the working directory`, async () => {
			const fixture = createFixture();
			// Without checkpoints, `auto` falls back to tracked edits.
			fixture.results.pair = undefined;
			addEdit(fixture.db);
			addEdit(fixture.db, '/session-state/plan.md', turnId, 'edit-2');
			await refresh(fixture, strategy);
			await fixture.service.computeTurnChangeset(session, turnId, strategy);
			assert.deepStrictEqual({
				session: snapshot(fixture.state, sessionChangeset),
				turn: snapshot(fixture.state, turnChangeset),
			}, { session: ready([trackedDiff()]), turn: ready([trackedDiff()]) });
		});
	}

	test('tracker excludes peer chat edits outside the working directory', async () => {
		const peer = buildChatUri(session, 'peer');
		const peerDb = new TestSessionDatabase();
		const fixture = createFixture({ peer: { resource: peer, db: peerDb, turnId: 'peer-turn' } });
		addEdit(fixture.db);
		addEdit(peerDb, '/session-state/plan.md', 'peer-turn', 'peer-edit');
		await refresh(fixture, 'fileEditTracker');
		const uri = await fixture.service.computeTurnChangeset(session, 'peer-turn', 'fileEditTracker');
		assert.deepStrictEqual({
			session: snapshot(fixture.state, sessionChangeset),
			turn: snapshot(fixture.state, uri),
		}, { session: ready([trackedDiff()]), turn: ready([]) });
	});

	test('auto fallback scopes peer turn edits to the peer working directory', async () => {
		const peer = buildChatUri(session, 'peer');
		const peerDb = new TestSessionDatabase();
		const fixture = createFixture({ peer: { resource: peer, db: peerDb, turnId: 'peer-turn', workingDirectories: ['file:///peer'] } });
		fixture.results.pair = undefined;
		addEdit(peerDb, '/peer/file.txt', 'peer-turn', 'peer-edit');
		addEdit(peerDb, '/repo/parent.txt', 'peer-turn', 'parent-edit');
		const uri = await fixture.service.computeTurnChangeset(session, 'peer-turn', 'auto');
		assert.deepStrictEqual(snapshot(fixture.state, uri), ready([trackedDiff('/peer/file.txt', peer, 'peer-edit')]));
	});

	test('incremental tracker recompute excludes edits outside the working directory', async () => {
		const fixture = createFixture();
		addEdit(fixture.db);
		await refresh(fixture, 'fileEditTracker');
		addEdit(fixture.db, '/session-state/plan.md', 'turn-2', 'edit-2');
		addEdit(fixture.db, '/repo/second.txt', 'turn-2', 'edit-3');
		const published = nextPublication(fixture.state, sessionChangeset);
		fixture.service.onTurnComplete(session, 'turn-2');
		await published;
		assert.deepStrictEqual({
			state: snapshot(fixture.state, sessionChangeset),
			reads: [fixture.db.getAllFileEditsCalls, fixture.db.getFileEditsByTurnCalls],
		}, { state: ready([trackedDiff('/repo/second.txt', session, 'edit-3'), trackedDiff()]), reads: [1, 1] });
	});

	test('tracker leaves turn edits unscoped when no working directory is known', async () => {
		const fixture = createFixture({ workingDirectories: [] });
		addEdit(fixture.db, '/session-state/plan.md');
		await fixture.service.computeTurnChangeset(session, turnId, 'fileEditTracker');
		assert.deepStrictEqual(snapshot(fixture.state, turnChangeset), ready([trackedDiff('/session-state/plan.md')]));
	});

	for (const strategy of ['fileEditTracker', 'auto'] as const) {
		test(`${strategy} tracked edits exclude every file for a peer chat without working-directory access`, async () => {
			const peer = buildChatUri(session, 'peer');
			const peerDb = new TestSessionDatabase();
			const fixture = createFixture({ peer: { resource: peer, db: peerDb, turnId: 'peer-turn', workingDirectories: [] } });
			// Without checkpoints, `auto` falls back to tracked edits.
			fixture.results.pair = undefined;
			addEdit(peerDb, '/repo/peer.txt', 'peer-turn', 'peer-edit');
			addEdit(peerDb, '/session-state/plan.md', 'peer-turn', 'plan-edit');
			const uri = await fixture.service.computeTurnChangeset(session, 'peer-turn', strategy);
			assert.deepStrictEqual(snapshot(fixture.state, uri), ready([]));
		});
	}

	test('tracker excludes every file when the default chat has no working-directory access', async () => {
		const fixture = createFixture();
		const defaultChat = buildDefaultChatUri(session);
		fixture.state.dispatchServerAction(defaultChat, { type: ActionType.ChatWorkingDirectorySet, directory: 'file:///repo' });
		fixture.state.dispatchServerAction(defaultChat, { type: ActionType.ChatWorkingDirectoryRemoved, directory: 'file:///repo' });
		addEdit(fixture.db);
		addEdit(fixture.db, '/session-state/plan.md', turnId, 'edit-2');
		// Refreshes skip sessions without a working directory; turn completion still recomputes.
		const published = nextPublication(fixture.state, sessionChangeset);
		fixture.service.onTurnComplete(session, turnId);
		await published;
		await fixture.service.computeTurnChangeset(session, turnId, 'fileEditTracker');
		assert.deepStrictEqual({
			session: snapshot(fixture.state, sessionChangeset),
			turn: snapshot(fixture.state, turnChangeset),
		}, { session: ready([]), turn: ready([]) });
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
			// Session Changes is session-owned, so a chat's lifecycle computes no chat-owned copy of it.
			const chatChangeset = buildSessionChangesetUri(chat);
			const chatTurnChangeset = buildTurnChangesetUri(chat, id);
			fixture.subscriptions.add(chatTurnChangeset);
			const expected = ready([owner === 'default' ? trackedDiff() : trackedDiff('/repo/peer.txt', peer, 'peer-edit')]);
			let published = nextPublication(fixture.state, chatTurnChangeset);
			fixture.service.onToolCallEditsApplied(chat, id);
			await published;
			const midTurn = snapshot(fixture.state, chatTurnChangeset);
			published = nextPublication(fixture.state, chatTurnChangeset);
			fixture.service.onTurnComplete(chat, id);
			await published;
			assert.deepStrictEqual({
				midTurn,
				completed: snapshot(fixture.state, chatTurnChangeset),
				chatOwnedSessionChanges: fixture.state.getChangesetState(chatChangeset),
				git: fixture.gitCalls,
				checkpoints: fixture.checkpointCalls,
			}, { midTurn: expected, completed: expected, chatOwnedSessionChanges: undefined, git: [], checkpoints: [] });
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

	test('restore and subscription refreshes preserve session checkpoints after isolation changes', async () => {
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
		}, { session: ready([gitOnlyDiff]), turn: ready([trackedDiff()]), gitCalls: 3, reads: [0, 1] });
	});

	test('main branch changes retain the persisted baseline while using the session folder', async () => {
		const fixture = createFixture();
		await fixture.db.setMetadata(META_DIFF_BASE_BRANCH, 'release-A');
		fixture.gitStates.set(buildDefaultChatUri(session), { baseBranchName: 'main' });
		const calls: (string | undefined)[] = [];
		fixture.git.computeSessionFileDiffs = async (_directory, options) => {
			calls.push(options?.baseBranch);
			return [];
		};
		const branch = buildBranchChangesetUri(buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId(['file:///repo'])));
		const published = nextPublication(fixture.state, branch);
		fixture.service.refreshBranchChangeset(session);
		await published;
		assert.deepStrictEqual(calls, ['release-A']);
	});

	test('single-chat folder replacement uses the destination baseline after clearing worktree metadata', async () => {
		const fixture = createFixture();
		const destination = 'file:///destination';
		const main = buildDefaultChatUri(session);
		await fixture.db.setMetadata(META_DIFF_BASE_BRANCH, '');
		fixture.state.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectoryReplaced, directory: 'file:///repo', replacement: destination });
		fixture.state.dispatchServerAction(main, { type: ActionType.ChatWorkingDirectorySet, directory: destination });
		fixture.gitStates.set(main, { baseBranchName: 'main' });
		const calls: { directory: string; baseBranch: string | undefined }[] = [];
		fixture.git.computeSessionFileDiffs = async (directory, options) => {
			calls.push({ directory: directory.toString(), baseBranch: options?.baseBranch });
			return [];
		};
		const branch = buildBranchChangesetUri(buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId([destination])));
		const published = nextPublication(fixture.state, branch);
		fixture.service.refreshBranchChangeset(main);
		await published;
		assert.deepStrictEqual(calls, [{ directory: destination, baseBranch: 'main' }]);
	});

	test('moved peer branch changes use the destination baseline after clearing inherited fork metadata', async () => {
		const original = 'file:///repo';
		const destination = 'file:///destination';
		const main = buildDefaultChatUri(session);
		const peer = buildChatUri(session, 'peer');
		const peerDb = new TestSessionDatabase();
		const fixture = createFixture({
			workingDirectories: [original, destination],
			peer: { resource: peer, db: peerDb, turnId: 'peer-turn', workingDirectories: [destination] },
		});
		fixture.state.dispatchServerAction(main, { type: ActionType.ChatWorkingDirectorySet, directory: original });
		fixture.state.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: main, changes: { workingDirectories: [original] } });
		await fixture.db.setMetadata(META_DIFF_BASE_BRANCH, 'release-A');
		await peerDb.setMetadata(META_DIFF_BASE_BRANCH, '');
		fixture.gitStates.set(peer, { baseBranchName: 'main' });
		const calls: { directory: string; baseBranch: string | undefined }[] = [];
		fixture.git.computeSessionFileDiffs = async (directory, options) => {
			calls.push({ directory: directory.toString(), baseBranch: options?.baseBranch });
			return [];
		};
		for (const [chat, directory] of [[main, original], [peer, destination]]) {
			const branch = buildBranchChangesetUri(buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId([directory])));
			const published = nextPublication(fixture.state, branch);
			fixture.service.refreshBranchChangeset(chat);
			await published;
		}
		assert.deepStrictEqual(calls, [
			{ directory: original, baseBranch: 'release-A' },
			{ directory: destination, baseBranch: 'main' },
		]);
	});

	for (const destinationBase of ['main', undefined]) {
		test(`relocated main branch changes ignore the session baseline with destination base ${destinationBase}`, async () => {
			const original = 'file:///repo';
			const destination = 'file:///destination';
			const main = buildDefaultChatUri(session);
			const peer = buildChatUri(session, 'peer');
			const peerDb = new TestSessionDatabase();
			const fixture = createFixture({
				workingDirectories: [original, destination],
				peer: { resource: peer, db: peerDb, turnId: 'peer-turn', workingDirectories: [original] },
			});
			await fixture.db.setMetadata(META_DIFF_BASE_BRANCH, 'release-A');
			await peerDb.setMetadata(META_DIFF_BASE_BRANCH, 'release-A');
			fixture.state.setSessionMeta(session, withSessionGitState(undefined, { baseBranchName: 'release-A' }));
			fixture.state.dispatchServerAction(main, { type: ActionType.ChatWorkingDirectorySet, directory: destination });
			fixture.state.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: main, changes: { workingDirectories: [destination] } });
			if (destinationBase) {
				fixture.gitStates.set(main, { baseBranchName: destinationBase });
			}
			fixture.gitStates.set(peer, { baseBranchName: 'release-A' });
			const calls: { directory: string; baseBranch: string | undefined }[] = [];
			fixture.git.computeSessionFileDiffs = async (directory, options) => {
				calls.push({ directory: directory.toString(), baseBranch: options?.baseBranch });
				return [];
			};
			for (const [chat, directory] of [[main, destination], [peer, original]]) {
				const branch = buildBranchChangesetUri(buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId([directory])));
				const published = nextPublication(fixture.state, branch);
				fixture.service.refreshBranchChangeset(chat);
				await published;
			}
			assert.deepStrictEqual(calls, [
				{ directory: destination, baseBranch: destinationBase },
				{ directory: original, baseBranch: 'release-A' },
			]);
		});
	}

	suite('uncommitted availability', () => {
		const uncommitted = buildUncommittedChangesetUri(session);

		function createRootFixture(options: Parameters<typeof createFixture>[0] = {}) {
			const fixture = createFixture(options);
			const roots = new Map<string, ISettableObservable<boolean | undefined>>();
			const resolvedRoots = new Map<string, URI | undefined>();
			const rootState = (directory: URI) => {
				let value = roots.get(directory.toString());
				if (!value) {
					value = observableValue<boolean | undefined>(roots, undefined);
					roots.set(directory.toString(), value);
				}
				return value;
			};
			const repository = { resolve: fixture.git.getRepositoryRoot };
			const workingTree = { compute: fixture.git.computeSessionFileDiffs };
			const rootObservers = { count: 0 };
			fixture.git.hasGitRoot = directory => observableFromEvent(roots, listener => {
				rootObservers.count++;
				const subscription = autorun(reader => {
					rootState(directory).read(reader);
					listener(undefined);
				});
				return toDisposable(() => {
					subscription.dispose();
					rootObservers.count--;
				});
			}, () => rootState(directory).get());
			fixture.git.getRepositoryRoot = async (directory, options) => {
				const state = rootState(directory);
				if (state.get() === true || state.get() === false && !options?.refreshIfNone) {
					return resolvedRoots.get(directory.toString());
				}
				try {
					const root = await repository.resolve(directory, options);
					resolvedRoots.set(directory.toString(), root);
					state.set(root !== undefined, undefined);
					return root;
				} catch (error) {
					resolvedRoots.delete(directory.toString());
					state.set(undefined, undefined);
					throw error;
				}
			};
			fixture.git.computeSessionFileDiffs = async (directory, options) => {
				return await fixture.git.getRepositoryRoot(directory) ? workingTree.compute(directory, options) : undefined;
			};
			return { ...fixture, repository, rootState, workingTree, rootObservers };
		}

		test('an invalid working-directory URI produces an error changeset instead of throwing synchronously', async () => {
			const fixture = createRootFixture({ workingDirectories: ['foo bar:/x'] });
			fixture.subscriptions.add(uncommitted);

			await fixture.service.computeUncommittedChangeset(session);

			assert.deepStrictEqual(snapshot(fixture.state, uncommitted), { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [] });
		});

		test('suppresses repeated computations and status churn after a confirmed non-repository result', async () => {
			const fixture = createRootFixture();
			fixture.subscriptions.add(uncommitted);
			let computes = 0;
			let rootLookups = 0;
			fixture.workingTree.compute = async () => { computes++; return undefined; };
			fixture.repository.resolve = async () => { rootLookups++; return undefined; };
			const statuses: string[] = [];
			disposables.add(fixture.state.onDidEmitEnvelope(envelope => {
				if (envelope.channel === uncommitted && envelope.action.type === ActionType.ChangesetStatusChanged) {
					statuses.push(envelope.action.status);
				}
			}));
			await fixture.service.computeUncommittedChangeset(session);
			const firstStatusCount = statuses.length;

			await Promise.all(Array.from({ length: 20 }, () => fixture.service.computeUncommittedChangeset(session)));
			fixture.service.recomputeSubscribedChangesets(session);
			await timeout(0);

			assert.deepStrictEqual({
				computes,
				rootLookups,
				laterStatuses: statuses.slice(firstStatusCount),
				state: snapshot(fixture.state, uncommitted),
			}, {
				computes: 0,
				rootLookups: 1,
				laterStatuses: [],
				state: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [] },
			});
		});

		test('suppresses requests queued before the first unavailable computation settles', async () => {
			const fixture = createRootFixture();
			fixture.subscriptions.add(uncommitted);
			const gate = new DeferredPromise<void>();
			let computes = 0;
			let rootLookups = 0;
			fixture.workingTree.compute = async () => { computes++; return undefined; };
			fixture.repository.resolve = async () => { rootLookups++; await gate.p; return undefined; };
			try {
				const first = fixture.service.computeUncommittedChangeset(session);
				await timeout(0);
				const queued = Array.from({ length: 10 }, () => fixture.service.computeUncommittedChangeset(session));
				gate.complete();
				await Promise.all([first, ...queued]);

				assert.deepStrictEqual({ computes, rootLookups, state: snapshot(fixture.state, uncommitted) }, {
					computes: 0,
					rootLookups: 1,
					state: { status: ChangesetStatus.Error, errorType: 'computeFailed', edits: [] },
				});
			} finally {
				gate.complete();
			}
		});

		for (const failure of ['undefined', 'exception', 'root lookup'] as const) {
			test(`retries a transient ${failure} failure instead of marking the directory permanently unavailable`, async () => {
				const fixture = createRootFixture();
				fixture.subscriptions.add(uncommitted);
				let computes = 0;
				let rootLookups = 0;
				fixture.repository.resolve = async directory => {
					if (++rootLookups === 1 && failure === 'root lookup') {
						throw new Error('Git root lookup timed out');
					}
					return directory;
				};
				fixture.workingTree.compute = async () => {
					if (++computes === 1) {
						if (failure === 'exception') {
							throw new Error('Git diff failed');
						}
						return failure === 'root lookup' ? [gitOnlyDiff] : undefined;
					}
					return [gitOnlyDiff];
				};
				await fixture.service.computeUncommittedChangeset(session);
				await fixture.service.computeUncommittedChangeset(session);

				assert.deepStrictEqual({ computes, state: snapshot(fixture.state, uncommitted) }, {
					computes: failure === 'root lookup' ? 1 : 2,
					state: ready([gitOnlyDiff]),
				});
			});
		}

		test('retries an unavailable changeset after repository discovery becomes available', async () => {
			const fixture = createRootFixture();
			fixture.subscriptions.add(uncommitted);
			let computes = 0;
			let available = false;
			fixture.repository.resolve = async directory => available ? directory : undefined;
			fixture.workingTree.compute = async () => {
				computes++;
				return available ? [gitOnlyDiff] : undefined;
			};
			await fixture.service.computeUncommittedChangeset(session);
			available = true;

			const recovered = nextPublication(fixture.state, uncommitted);
			await fixture.git.getRepositoryRoot(URI.file('/repo'), { refreshIfNone: true });
			await recovered;

			assert.deepStrictEqual({ computes, state: snapshot(fixture.state, uncommitted) }, {
				computes: 1,
				state: ready([gitOnlyDiff]),
			});
		});

		test('root discovery does not duplicate a successful changeset computation', async () => {
			const fixture = createRootFixture();
			fixture.subscriptions.add(uncommitted);
			let computes = 0;
			fixture.workingTree.compute = async () => { computes++; return [gitOnlyDiff]; };
			await fixture.service.computeUncommittedChangeset(session);
			await fixture.git.getRepositoryRoot(URI.file('/repo'), { refreshIfNone: true });
			await timeout(0);

			assert.deepStrictEqual({ computes, state: snapshot(fixture.state, uncommitted) }, {
				computes: 1,
				state: ready([gitOnlyDiff]),
			});
		});

		for (const boundary of ['start', 'end'] as const) {
			test(`turn ${boundary} contribution recovers both chat and session changesets after git init`, async () => {
				const fixture = createRootFixture();
				const chat = buildDefaultChatUri(session);
				const chatUncommitted = buildUncommittedChangesetUri(chat);
				fixture.subscriptions.add(uncommitted);
				fixture.subscriptions.add(chatUncommitted);
				let initialized = false;
				let cachedRoot: URI | undefined;
				const diffOwners: string[] = [];
				fixture.repository.resolve = async (directory, options) => {
					if (!cachedRoot && options?.refreshIfNone) {
						cachedRoot = initialized ? directory : undefined;
					}
					return cachedRoot;
				};
				fixture.workingTree.compute = async (_directory, options) => {
					diffOwners.push(options.sessionUri);
					return [gitOnlyDiff];
				};
				await fixture.service.computeUncommittedChangeset(session);
				await fixture.service.computeUncommittedChangeset(chat);
				initialized = true;
				const log = new NullLogService();
				const instantiation = disposables.add(new InstantiationService(new ServiceCollection(
					[ILogService, log],
					[IAgentHostGitService, fixture.git],
					[IAgentConfigurationService, fixture.configuration],
					[IAgentHostChangesetService, fixture.service],
				)));
				const contributions: IAgentHostChatContributions = disposables.add(new AgentHostChatContributions(log, instantiation));
				disposables.add(contributions.registerContribution(GitRepositoryRootsContribution));
				const recovered = Promise.all([nextPublication(fixture.state, uncommitted), nextPublication(fixture.state, chatUncommitted)]);

				if (boundary === 'start') {
					contributions.incomingRequest({
						session, chat, turnChannel: chat, turnId: 'root-recovery',
						message: { text: 'Discover repository', origin: { kind: MessageKind.User } },
						source: 'direct', clientId: undefined,
						clientContext: createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow),
					});
				} else {
					contributions.turnEnd({ session, channel: chat, turnId: 'root-recovery', reason: { kind: 'success' } });
				}
				await recovered;

				assert.deepStrictEqual({
					diffOwners: [...diffOwners].sort(),
					states: [snapshot(fixture.state, chatUncommitted), snapshot(fixture.state, uncommitted)],
				}, { diffOwners: [chat, session].sort(), states: [ready([gitOnlyDiff]), ready([gitOnlyDiff])] });
			});
		}

		test('changing the primary working directory permits another computation', async () => {
			const fixture = createRootFixture();
			fixture.subscriptions.add(uncommitted);
			const directories: string[] = [];
			fixture.repository.resolve = async directory => directory.toString() === 'file:///next' ? directory : undefined;
			fixture.workingTree.compute = async directory => {
				directories.push(directory.toString());
				return directory.toString() === 'file:///next' ? [gitOnlyDiff] : undefined;
			};
			await fixture.service.computeUncommittedChangeset(session);
			fixture.state.dispatchServerAction(session, {
				type: ActionType.SessionWorkingDirectoryReplaced,
				directory: 'file:///repo',
				replacement: 'file:///next',
			});

			await fixture.service.computeUncommittedChangeset(session);

			assert.deepStrictEqual({ directories, state: snapshot(fixture.state, uncommitted) }, {
				directories: ['file:///next'],
				state: ready([gitOnlyDiff]),
			});
		});

		test('unavailable changesets are scoped to their owner, including peer chats', async () => {
			const peer = buildChatUri(session, 'peer');
			const fixture = createRootFixture({ peer: { resource: peer, db: new TestSessionDatabase(), turnId: 'peer-turn' } });
			fixture.subscriptions.add(uncommitted);
			fixture.subscriptions.add(buildUncommittedChangesetUri(peer));
			const owners: string[] = [];
			const lookups: string[] = [];
			fixture.repository.resolve = async directory => { lookups.push(directory.toString()); return undefined; };
			fixture.workingTree.compute = async (_directory, options) => { owners.push(options.sessionUri); return undefined; };

			await fixture.service.computeUncommittedChangeset(session);
			await fixture.service.computeUncommittedChangeset(peer);
			await fixture.service.computeUncommittedChangeset(session);
			await fixture.service.computeUncommittedChangeset(peer);

			assert.deepStrictEqual({ owners, lookups }, { owners: [], lookups: ['file:///repo', 'file:///repo'] });
		});

		test('a new subscription retries discovery after git init without waiting for another turn', async () => {
			const fixture = createRootFixture();
			fixture.subscriptions.add(uncommitted);
			let initialized = false;
			let cachedRoot: URI | undefined;
			const rootOptions: (boolean | undefined)[] = [];
			fixture.repository.resolve = async (directory, options) => {
				rootOptions.push(options?.refreshIfNone);
				if (options?.refreshIfNone && !cachedRoot) {
					cachedRoot = initialized ? directory : undefined;
				}
				return cachedRoot;
			};
			fixture.workingTree.compute = async () => [gitOnlyDiff];
			await fixture.service.computeUncommittedChangeset(session);
			fixture.subscriptions.delete(uncommitted);
			fixture.subscriptionChanged.fire(session);
			initialized = true;
			fixture.subscriptions.add(uncommitted);

			fixture.subscriptionChanged.fire(session);
			await fixture.service.computeUncommittedChangeset(session);
			await timeout(0);

			assert.deepStrictEqual({ rootOptions, state: snapshot(fixture.state, uncommitted) }, {
				rootOptions: [undefined, true],
				state: ready([gitOnlyDiff]),
			});
		});

		test('unsubscribe and resubscribe do not retain a late non-repository result', async () => {
			const fixture = createRootFixture();
			fixture.subscriptions.add(uncommitted);
			const gate = new DeferredPromise<URI | undefined>();
			let rootLookups = 0;
			fixture.repository.resolve = async directory => ++rootLookups === 1 ? gate.p : directory;
			fixture.workingTree.compute = async () => [gitOnlyDiff];
			try {
				const pending = fixture.service.computeUncommittedChangeset(session);
				await timeout(0);
				fixture.subscriptions.delete(uncommitted);
				fixture.subscriptionChanged.fire(session);
				fixture.subscriptions.add(uncommitted);
				gate.complete(undefined);
				await pending;

				fixture.subscriptionChanged.fire(session);
				await fixture.service.computeUncommittedChangeset(session);
				await timeout(0);

				assert.deepStrictEqual({ rootLookups, state: snapshot(fixture.state, uncommitted) }, {
					rootLookups: 2,
					state: ready([gitOnlyDiff]),
				});
			} finally {
				gate.complete(undefined);
			}
		});

		test('owner removal releases the root observer', async () => {
			const fixture = createRootFixture();
			fixture.subscriptions.add(uncommitted);
			let computes = 0;
			let rootLookups = 0;
			fixture.repository.resolve = async () => { rootLookups++; return undefined; };
			fixture.workingTree.compute = async () => { computes++; return undefined; };
			await fixture.service.computeUncommittedChangeset(session);

			fixture.service.onChangesetOwnerRemoved(session);

			assert.deepStrictEqual({ computes, rootLookups, observers: fixture.rootObservers.count }, { computes: 0, rootLookups: 1, observers: 0 });
		});

		test('unsubscribing releases the root observer while other changeset interest remains', async () => {
			const fixture = createRootFixture();
			fixture.subscriptions.add(uncommitted);
			fixture.repository.resolve = async () => undefined;
			await fixture.service.computeUncommittedChangeset(session);
			fixture.subscriptions.delete(uncommitted);

			fixture.subscriptionChanged.fire(session);

			assert.deepStrictEqual({
				subscriptions: [...fixture.subscriptions],
				observers: fixture.rootObservers.count,
			}, { subscriptions: [sessionChangeset, turnChangeset], observers: 0 });
		});

		test('an in-flight unavailable result is not retained after the owner is removed', async () => {
			const fixture = createRootFixture();
			fixture.subscriptions.add(uncommitted);
			const gate = new DeferredPromise<void>();
			let computes = 0;
			let rootLookups = 0;
			fixture.workingTree.compute = async () => { computes++; return undefined; };
			fixture.repository.resolve = async () => { rootLookups++; await gate.p; return undefined; };
			try {
				const pending = fixture.service.computeUncommittedChangeset(session);
				await timeout(0);
				fixture.subscriptions.delete(uncommitted);
				fixture.service.onChangesetOwnerRemoved(session);
				gate.complete();
				await pending;

				assert.deepStrictEqual({ computes, rootLookups, observers: fixture.rootObservers.count }, { computes: 0, rootLookups: 1, observers: 0 });
			} finally {
				gate.complete();
			}
		});
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
