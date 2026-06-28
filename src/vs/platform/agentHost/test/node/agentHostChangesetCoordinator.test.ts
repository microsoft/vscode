/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { buildDefaultChangesetCatalogue, buildSessionChangesetUri, buildUncommittedChangesetUri, ChangesetKind, parseChangesetUri } from '../../common/changesetUri.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildSubagentSessionUri, SessionStatus, type ISessionFileDiff, type ISessionGitHubState } from '../../common/state/sessionState.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChangesetCoordinator } from '../../node/agentHostChangesetCoordinator.js';
import { IAgentHostChangesetService, IPersistedChangesetMetadata, IRestoredChangesetDiffs, StaticChangesetKind } from '../../common/agentHostChangesetService.js';
import { IAgentHostChangesetOperationService } from '../../common/agentHostChangesetOperationService.js';
import { IAgentHostFileMonitorOptions, IAgentHostFileMonitorService } from '../../node/agentHostFileMonitorService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createNoopGitService } from '../common/sessionTestHelpers.js';
import { ChangesSummary } from '../../common/state/protocol/state.js';
import { IAgentHostChangesetSubscriptionService } from '../../common/agentHostChangesetSubscriptionService.js';
import { AgentHostChangesetSubscriptionService } from '../../node/agentHostChangesetSubscriptionService.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';

suite('ChangesetSessionCoordinator', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(stateManager: AgentHostStateManager, session: string, workingDirectory?: string, emitNotification = true): void {
		stateManager.createSession({
			resource: session,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///test-project', displayName: 'Test Project' },
			workingDirectory,
		}, { emitNotification });
		stateManager.setSessionChangesets(session, buildDefaultChangesetCatalogue(session));
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
	}

	function createEnvironment(root: URI = URI.file('/repo')): {
		stateManager: AgentHostStateManager;
		changesets: TestChangesetService;
		subscriptions: IAgentHostChangesetSubscriptionService;
		monitor: TestFileMonitorService;
		gitService: IAgentHostGitService & { readonly rootLookupCalls: string[]; waitForRootLookups(count: number): Promise<void> };
		gitStateService: TestGitStateService;
		coordinator: AgentHostChangesetCoordinator;
	} {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const logService = new NullLogService();
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const subscriptions = new AgentHostChangesetSubscriptionService();
		const changesets = new TestChangesetService(subscriptions);
		const monitor = disposables.add(new TestFileMonitorService());
		const gitService = createGitService(root);
		const gitStateService = disposables.add(new TestGitStateService());
		const operationContributionService: IAgentHostChangesetOperationService = {
			_serviceBrand: undefined,
			registerContribution: () => Disposable.None,
			getOperations: () => undefined,
			updateOperations: () => { },
			invokeChangesetOperation: async () => ({}),
			dispose: () => { },
		};
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentConfigurationService, configurationService],
			[IAgentHostChangesetOperationService, operationContributionService],
			[IAgentHostChangesetService, changesets],
			[IAgentHostChangesetSubscriptionService, subscriptions],
			[IAgentHostFileMonitorService, monitor],
			[IAgentHostGitService, gitService],
			[IAgentHostGitStateService, gitStateService],
		), /*strict*/ true));
		const coordinator = disposables.add(instantiationService.createInstance(AgentHostChangesetCoordinator, stateManager));
		return { stateManager, changesets, subscriptions, monitor, gitService, gitStateService, coordinator };
	}

	test('shares root watchers across sessions and fans out root changes to static refreshes', async () => {
		const firstSession = AgentSession.uri('mock', 'session-1').toString();
		const secondSession = AgentSession.uri('mock', 'session-2').toString();
		const root = URI.file('/repo');
		const environment = createEnvironment(root);
		createSession(environment.stateManager, firstSession, 'file:///repo/worktree-a');
		createSession(environment.stateManager, secondSession, 'file:///repo/worktree-b');

		environment.coordinator.onFirstSubscriber(URI.parse(firstSession));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
		await environment.gitService.waitForRootLookups(2);
		await tick();
		environment.changesets.clearRefreshes();

		environment.monitor.fire(root);
		await tick();

		assert.deepStrictEqual({
			acquisitions: environment.monitor.acquisitions,
			branchRefreshes: environment.changesets.branchRefreshes,
			uncommittedRefreshes: environment.changesets.uncommittedRefreshes,
			sessionRefreshes: environment.changesets.sessionRefreshes,
			gitStateRefreshes: environment.gitStateService.refreshed,
		}, {
			acquisitions: ['file:///repo'],
			branchRefreshes: [firstSession],
			uncommittedRefreshes: [secondSession],
			sessionRefreshes: [firstSession],
			gitStateRefreshes: [firstSession, secondSession],
		});
	});

	test('releases a root watcher after the last interested session unsubscribes', async () => {
		const firstSession = AgentSession.uri('mock', 'session-1').toString();
		const secondSession = AgentSession.uri('mock', 'session-2').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, firstSession, 'file:///repo/worktree-a');
		createSession(environment.stateManager, secondSession, 'file:///repo/worktree-b');

		environment.coordinator.onFirstSubscriber(URI.parse(firstSession));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
		await environment.gitService.waitForRootLookups(2);
		await tick();

		environment.coordinator.onLastSubscriber(URI.parse(firstSession));
		assert.deepStrictEqual(environment.monitor.disposals, []);
		environment.coordinator.onLastSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
		assert.deepStrictEqual(environment.monitor.disposals, ['file:///repo']);
	});

	test('attaches deferred watch interest on materialization without re-querying an unchanged root', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, undefined, false);

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await tick();
		assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, rootLookups: environment.gitService.rootLookupCalls }, { acquisitions: [], rootLookups: [] });

		const summary = environment.stateManager.getSessionSummary(session)!;
		environment.stateManager.markSessionPersisted(session, { ...summary, workingDirectory: 'file:///repo/worktree' });
		environment.coordinator.onSessionMaterialized(session);
		await environment.monitor.waitForAcquisitions(1);

		environment.coordinator.onSessionMaterialized(session);
		await tick();

		assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, rootLookups: environment.gitService.rootLookupCalls }, {
			acquisitions: ['file:///repo'],
			rootLookups: ['file:///repo/worktree'],
		});
	});

	test('forwards session changeset refresh to the changeset service and drains pending work on materialization', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, undefined, false);

		environment.coordinator.onFirstSubscriber(URI.parse(buildSessionChangesetUri(session)));
		await tick();

		const summary = environment.stateManager.getSessionSummary(session)!;
		environment.stateManager.markSessionPersisted(session, { ...summary, workingDirectory: 'file:///repo/worktree' });
		environment.coordinator.onSessionMaterialized(session);
		await tick();

		assert.deepStrictEqual({
			sessionRefreshes: environment.changesets.sessionRefreshes,
			workingDirectoryAvailable: environment.changesets.workingDirectoryAvailable,
		}, {
			sessionRefreshes: [session],
			workingDirectoryAvailable: [session],
		});
	});

	test('exposes subscriptions and drops them when the last subscriber leaves', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const environment = createEnvironment();
		const changeset = buildSessionChangesetUri(session);
		createSession(environment.stateManager, session, undefined, false);

		environment.coordinator.onFirstSubscriber(URI.parse(changeset));
		const subscribed = [...environment.subscriptions.getSessionSubscriptions(session)];

		environment.coordinator.onLastSubscriber(URI.parse(changeset));
		const afterUnsubscribe = [...environment.subscriptions.getSessionSubscriptions(session)];

		assert.deepStrictEqual({ subscribed, afterUnsubscribe }, {
			subscribed: [changeset],
			afterUnsubscribe: [],
		});
	});

	test('does not attach root state when watcher acquisition fails', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repo/worktree');

		environment.monitor.failAcquire = true;
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.gitService.waitForRootLookups(1);
		await tick();
		environment.monitor.fire(URI.file('/repo'));
		await tick();

		assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, refreshes: environment.changesets.uncommittedRefreshes }, {
			acquisitions: ['file:///repo'],
			refreshes: [],
		});
	});

	test('active turn suspends and resumes root watcher when interest remains', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const root = URI.file('/repo');
		const environment = createEnvironment(root);
		createSession(environment.stateManager, session, 'file:///repo/worktree');

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onSessionTurnActiveChanged(session, true);
		await environment.gitService.waitForRootLookups(2);
		await tick();
		environment.changesets.clearRefreshes();
		environment.monitor.fire(root);
		await tick();

		environment.coordinator.onSessionTurnActiveChanged(session, false);
		await environment.monitor.waitForAcquisitions(2);
		environment.monitor.fire(root);
		await tick();

		assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, refreshes: environment.changesets.uncommittedRefreshes }, {
			acquisitions: ['file:///repo', 'file:///repo'],
			disposals: ['file:///repo'],
			refreshes: [],
		});
	});

	test('active session sharing a root suspends watcher for other subscribed sessions', async () => {
		const firstSession = AgentSession.uri('mock', 'session-1').toString();
		const secondSession = AgentSession.uri('mock', 'session-2').toString();
		const root = URI.file('/repo');
		const environment = createEnvironment(root);
		createSession(environment.stateManager, firstSession, 'file:///repo/worktree-a');
		createSession(environment.stateManager, secondSession, 'file:///repo/worktree-b');

		environment.coordinator.onFirstSubscriber(URI.parse(firstSession));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onFirstSubscriber(URI.parse(secondSession));
		await environment.gitService.waitForRootLookups(2);
		await tick();
		environment.coordinator.onSessionTurnActiveChanged(secondSession, true);
		await environment.gitService.waitForRootLookups(3);
		await tick();
		environment.changesets.clearRefreshes();
		environment.monitor.fire(root);
		await tick();

		environment.coordinator.onSessionTurnActiveChanged(secondSession, false);
		await environment.monitor.waitForAcquisitions(2);
		environment.monitor.fire(root);
		await tick();

		assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, uncommittedRefreshes: environment.changesets.uncommittedRefreshes }, {
			acquisitions: ['file:///repo', 'file:///repo'],
			disposals: ['file:///repo'],
			uncommittedRefreshes: [],
		});
	});

	test('active subagent maps to parent root and suspends watcher until subagent completes', async () => {
		const parentSession = AgentSession.uri('mock', 'session-1').toString();
		const subagentSession = buildSubagentSessionUri(parentSession, 'tool-1');
		const root = URI.file('/repo');
		const environment = createEnvironment(root);
		createSession(environment.stateManager, parentSession, 'file:///repo/worktree');
		createSession(environment.stateManager, subagentSession, undefined);

		environment.coordinator.onFirstSubscriber(URI.parse(parentSession));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onSessionTurnActiveChanged(subagentSession, true);
		await environment.gitService.waitForRootLookups(2);
		await tick();
		environment.changesets.clearRefreshes();
		environment.monitor.fire(root);
		await tick();

		environment.coordinator.onSessionTurnActiveChanged(subagentSession, false);
		await environment.monitor.waitForAcquisitions(2);
		environment.monitor.fire(root);
		await tick();

		assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, refreshes: environment.changesets.uncommittedRefreshes }, {
			acquisitions: ['file:///repo', 'file:///repo'],
			disposals: ['file:///repo'],
			refreshes: [],
		});
	});

	test('turn ending after unsubscribe or dispose does not reattach watcher', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repo/worktree');

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onSessionTurnActiveChanged(session, true);
		await environment.gitService.waitForRootLookups(2);
		await tick();
		environment.coordinator.onLastSubscriber(URI.parse(session));
		environment.coordinator.onSessionDisposed(session);
		environment.coordinator.onSessionTurnActiveChanged(session, false);
		await tick();

		assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals }, {
			acquisitions: ['file:///repo'],
			disposals: ['file:///repo'],
		});
	});
});

function createGitService(root: URI): IAgentHostGitService & { readonly rootLookupCalls: string[]; waitForRootLookups(count: number): Promise<void> } {
	const rootLookupCalls: string[] = [];
	const waiters: Array<{ count: number; deferred: DeferredPromise<void> }> = [];
	const releaseWaiters = () => {
		for (const waiter of [...waiters]) {
			if (rootLookupCalls.length >= waiter.count) {
				waiters.splice(waiters.indexOf(waiter), 1);
				void waiter.deferred.complete(undefined);
			}
		}
	};
	return {
		...createNoopGitService(),
		rootLookupCalls,
		async getRepositoryRoot(workingDirectory: URI): Promise<URI> {
			rootLookupCalls.push(workingDirectory.toString());
			releaseWaiters();
			return root;
		},
		waitForRootLookups(count: number): Promise<void> {
			if (rootLookupCalls.length >= count) {
				return Promise.resolve();
			}
			const deferred = new DeferredPromise<void>();
			waiters.push({ count, deferred });
			return deferred.p;
		},
	};
}

class TestGitStateService extends Disposable implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRefreshSessionGitState = this._register(new Emitter<string>());
	readonly onDidRefreshSessionGitState = this._onDidRefreshSessionGitState.event;

	readonly refreshed: string[] = [];

	async refreshSessionGitState(sessionKey: string, _workingDirectory?: URI): Promise<void> {
		// Mirror the production service: record the refresh and notify
		// listeners so the coordinator recomputes the subscribed changesets.
		this.refreshed.push(sessionKey);
		this._onDidRefreshSessionGitState.fire(sessionKey);
	}
	async setSessionGitHubState(_sessionKey: string, _state: ISessionGitHubState): Promise<void> { }
	async attachSessionGitHubPullRequest(_sessionKey: string): Promise<void> { }
}

class TestFileMonitorService extends Disposable implements IAgentHostFileMonitorService {
	declare readonly _serviceBrand: undefined;

	readonly acquisitions: string[] = [];
	readonly disposals: string[] = [];
	failAcquire = false;
	private readonly _callbacks = new Map<string, Set<() => void>>();
	private readonly _acquisitionWaiters: Array<{ count: number; deferred: DeferredPromise<void> }> = [];

	acquire(folder: URI, callback: () => void, _options?: IAgentHostFileMonitorOptions): IDisposable | undefined {
		const root = folder.toString();
		this.acquisitions.push(root);
		if (this.failAcquire) {
			this._releaseAcquisitionWaiters();
			return undefined;
		}
		let callbacks = this._callbacks.get(root);
		if (!callbacks) {
			callbacks = new Set<() => void>();
			this._callbacks.set(root, callbacks);
		}
		callbacks.add(callback);
		this._releaseAcquisitionWaiters();
		return toDisposable(() => {
			callbacks.delete(callback);
			this.disposals.push(root);
		});
	}

	fire(root: URI): void {
		for (const callback of this._callbacks.get(root.toString()) ?? []) {
			callback();
		}
	}

	waitForAcquisitions(count: number): Promise<void> {
		if (this.acquisitions.length >= count) {
			return Promise.resolve();
		}
		const deferred = new DeferredPromise<void>();
		this._acquisitionWaiters.push({ count, deferred });
		return deferred.p;
	}

	private _releaseAcquisitionWaiters(): void {
		for (const waiter of [...this._acquisitionWaiters]) {
			if (this.acquisitions.length >= waiter.count) {
				this._acquisitionWaiters.splice(this._acquisitionWaiters.indexOf(waiter), 1);
				void waiter.deferred.complete(undefined);
			}
		}
	}
}

class TestChangesetService implements IAgentHostChangesetService {
	declare readonly _serviceBrand: undefined;

	readonly branchRefreshes: string[] = [];
	readonly uncommittedRefreshes: string[] = [];
	readonly sessionRefreshes: string[] = [];
	readonly workingDirectoryAvailable: string[] = [];
	readonly recomputed: string[] = [];
	readonly disposed: string[] = [];

	constructor(private readonly _subscriptions: IAgentHostChangesetSubscriptionService) { }

	registerStaticChangesets(_session: string): void { }
	restoreStaticChangeset(_session: string, _kind: StaticChangesetKind, _diffs: readonly ISessionFileDiff[]): void { }
	parsePersistedStaticChangesets(_sessionUri: string, _metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs { return {}; }
	applyPersistedStaticChangesets(_sessionUri: string, _diffs: IRestoredChangesetDiffs): void { }
	restorePersistedStaticChangesets(_sessionUri: string, _metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs { return {}; }
	persistChangesSummary(_sessionUri: string, _summary: ChangesSummary): void { }
	isStaticChangesetComputeActive(_changesetUri: string): boolean { return false; }
	refreshBranchChangeset(session: string): void {
		this.branchRefreshes.push(session);
	}
	refreshSessionChangeset(session: string): void {
		this.sessionRefreshes.push(session);
	}
	onWorkingDirectoryAvailable(session: string): void {
		this.workingDirectoryAvailable.push(session);
	}
	recomputeSubscribedChangesets(session: string): void {
		this.recomputed.push(session);
		for (const changeset of this._subscriptions.getSessionSubscriptions(session)) {
			const parsed = parseChangesetUri(changeset);
			switch (parsed?.kind) {
				case ChangesetKind.Branch:
					this.refreshBranchChangeset(session);
					break;
				case ChangesetKind.Session:
					this.refreshSessionChangeset(session);
					break;
				case ChangesetKind.Uncommitted:
					void this.computeUncommittedChangeset(session);
					break;
				default:
					if (changeset === session) {
						this.refreshBranchChangeset(session);
						this.refreshSessionChangeset(session);
					}
					break;
			}
		}
	}
	onSessionDisposed(session: string): void {
		this.disposed.push(session);
	}
	async computeUncommittedChangeset(session: string): Promise<string> {
		if (this._subscriptions.getSessionSubscriptions(session).has(URI.parse(buildUncommittedChangesetUri(session)).toString())) {
			this.uncommittedRefreshes.push(session);
		}
		return `${session}/changeset/uncommitted`;
	}
	async computeTurnChangeset(session: string, turnId: string): Promise<string> { return `${session}/changeset/turn/${turnId}`; }
	async computeCompareTurnsChangeset(session: string, originalTurnId: string, modifiedTurnId: string): Promise<string> { return `${session}/changeset/compare/${originalTurnId}/${modifiedTurnId}`; }
	onToolCallEditsApplied(_session: string, _turnId: string): void { }
	onTurnComplete(_session: string, _turnId: string | undefined): void { }
	onSessionTruncated(_session: string): void { }

	clearRefreshes(): void {
		this.branchRefreshes.length = 0;
		this.uncommittedRefreshes.length = 0;
		this.sessionRefreshes.length = 0;
		this.recomputed.length = 0;
	}

	getListMetadataKeys(_sessionStr: string): Record<string, true> | undefined { return undefined; }
	computeListEntryChanges(_sessionUri: string, _metadata: Record<string, string | undefined>): ChangesSummary | undefined { return undefined; }
}

function tick(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}
