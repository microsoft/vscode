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
import { AgentSession } from '../../common/agent.js';
import { buildBranchChangesetUri, buildDefaultChangesetCatalog, buildSessionChangesetUri, buildUncommittedChangesetUri, ChangesetKind, parseChangesetUri } from '../../common/changesetUri.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildSubagentSessionUri, SessionStatus, type ISessionFileDiff, type ISessionGitHubState } from '../../common/state/sessionState.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChangesetCoordinator } from '../../node/agentHostChangesetCoordinator.js';
import { IAgentHostChangesetService, IPersistedChangesetMetadata, IRestoredChangesetDiffs, StaticChangesetKind } from '../../common/agentHostChangesetService.js';
import { IAgentHostChangesetOperationService } from '../../common/agentHostChangesetOperationService.js';
import { IAgentHostFileMonitorOptions, IAgentHostFileMonitorService } from '../../node/agentHostFileMonitorService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
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
			workingDirectories: workingDirectory ? [workingDirectory] : undefined,
		}, { emitNotification });
		stateManager.setSessionChangesets(session, buildDefaultChangesetCatalog(session));
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
	}

	function createMultiRootSession(stateManager: AgentHostStateManager, session: string, workingDirectories: readonly string[]): void {
		createSession(stateManager, session, workingDirectories[0]);
		for (const workingDirectory of workingDirectories.slice(1)) {
			stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workingDirectory });
		}
	}

	function createEnvironment(root: URI = URI.file('/repo'), gitServiceOverride?: IAgentHostGitService & { readonly rootLookupCalls: string[]; waitForRootLookups(count: number): Promise<void> }): {
		stateManager: AgentHostStateManager;
		changesets: TestChangesetService;
		subscriptions: IAgentHostChangesetSubscriptionService;
		monitor: TestFileMonitorService;
		gitService: IAgentHostGitService & { readonly rootLookupCalls: string[]; waitForRootLookups(count: number): Promise<void> };
		gitStateService: TestGitStateService;
		coordinator: AgentHostChangesetCoordinator;
		updateOperationsCalls: string[];
	} {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const logService = new NullLogService();
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const subscriptions = new AgentHostChangesetSubscriptionService();
		const changesets = new TestChangesetService(subscriptions);
		const monitor = disposables.add(new TestFileMonitorService());
		const gitService = gitServiceOverride ?? createGitService(root);
		const gitStateService = disposables.add(new TestGitStateService());
		const updateOperationsCalls: string[] = [];
		const operationContributionService: IAgentHostChangesetOperationService = {
			_serviceBrand: undefined,
			registerContribution: () => Disposable.None,
			getOperations: () => [],
			updateOperations: (sessionKey: string) => { updateOperationsCalls.push(sessionKey); },
			invokeChangesetOperation: async () => ({}),
			dispose: () => { },
		};
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentHostStateManager, stateManager],
			[IAgentConfigurationService, configurationService],
			[IAgentHostChangesetOperationService, operationContributionService],
			[IAgentHostChangesetService, changesets],
			[IAgentHostChangesetSubscriptionService, subscriptions],
			[IAgentHostFileMonitorService, monitor],
			[IAgentHostGitService, gitService],
			[IAgentHostGitStateService, gitStateService],
		), /*strict*/ true));
		const coordinator = disposables.add(instantiationService.createInstance(AgentHostChangesetCoordinator));
		return { stateManager, changesets, subscriptions, monitor, gitService, gitStateService, coordinator, updateOperationsCalls };
	}

	test('refreshes changeset operations when a session gains or loses a working directory', () => {
		const session = AgentSession.uri('mock', 'session-wd').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repoA');
		const baseline = environment.updateOperationsCalls.length;

		// Editor Window adds a second root -> multi-root: operations must refresh.
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///repoB' });
		assert.deepStrictEqual(environment.updateOperationsCalls.slice(baseline), [session], 'adding a root refreshes the session operations');

		// A no-op working-directory action (same root) must not refresh again.
		const afterAdd = environment.updateOperationsCalls.length;
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///repoB' });
		assert.strictEqual(environment.updateOperationsCalls.length, afterAdd, 'a no-op working-directory action does not refresh');

		// Removing the second root -> back to single-root: operations refresh again (restore).
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectoryRemoved, directory: 'file:///repoB' });
		assert.deepStrictEqual(environment.updateOperationsCalls.slice(afterAdd), [session], 'removing a root refreshes the session operations');
	});

	test('refreshes changeset operations when GitHub state changes', () => {
		const session = AgentSession.uri('mock', 'session-github').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repo');
		const baseline = environment.updateOperationsCalls.length;

		environment.gitStateService.fireGitHubStateChanged(session);

		assert.deepStrictEqual(environment.updateOperationsCalls.slice(baseline), [session]);
	});

	test('a parent working-directory change also refreshes inheriting subagent sessions', () => {
		const parentSession = AgentSession.uri('mock', 'session-parent').toString();
		const subagentSession = buildSubagentSessionUri(parentSession, 'tool-1');
		const environment = createEnvironment();
		createSession(environment.stateManager, parentSession, 'file:///repoA');
		// A subagent with NO own working directories inherits the parent's set,
		// so a parent root change flips its multi-root state too.
		createSession(environment.stateManager, subagentSession);
		const baseline = environment.updateOperationsCalls.length;

		environment.stateManager.dispatchServerAction(parentSession, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///repoB' });

		assert.deepStrictEqual(
			[...environment.updateOperationsCalls.slice(baseline)].sort(),
			[parentSession, subagentSession].sort(),
			'a parent root change refreshes both the parent and its inheriting subagent',
		);
	});

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
			gitStateRefreshes: environment.gitStateService.refreshed,
		}, {
			acquisitions: ['file:///repo'],
			branchRefreshes: [firstSession],
			uncommittedRefreshes: [secondSession],
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
		environment.stateManager.markSessionPersisted(session, { ...summary, workingDirectories: ['file:///repo/worktree'] });
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
		environment.stateManager.markSessionPersisted(session, { ...summary, workingDirectories: ['file:///repo/worktree'] });
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

	test('watches every git repository root in a multi-root session', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const rootA = URI.file('/projects/repoA');
		const rootB = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[rootA.toString(), rootA],
			[rootB.toString(), rootB],
		])));
		createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(2);

		assert.deepStrictEqual([...environment.monitor.acquisitions].sort(), [rootA.toString(), rootB.toString()].sort());
	});

	test('a secondary-root external edit refreshes the summary using the primary working directory', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const primaryRoot = URI.file('/projects/repoA');
		const secondaryRoot = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[primaryRoot.toString(), primaryRoot],
			[secondaryRoot.toString(), secondaryRoot],
		])));
		createMultiRootSession(environment.stateManager, session, [primaryRoot.toString(), secondaryRoot.toString()]);

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(2);
		environment.changesets.clearRefreshes();

		// An external edit in the SECONDARY repo must refresh the all-folder
		// summary, sourcing git state from the PRIMARY working directory (never
		// the secondary root that changed).
		environment.monitor.fire(secondaryRoot);
		await tick();

		assert.deepStrictEqual({
			refreshedWith: environment.gitStateService.refreshedWith,
			recomputed: environment.changesets.recomputed,
			branchRefreshes: environment.changesets.branchRefreshes,
		}, {
			refreshedWith: [{ sessionKey: session, workingDirectory: primaryRoot.toString() }],
			recomputed: [session],
			branchRefreshes: [session],
		});
	});

	test('a turn suspends and re-attaches every repository root', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const rootA = URI.file('/projects/repoA');
		const rootB = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[rootA.toString(), rootA],
			[rootB.toString(), rootB],
		])));
		createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(2);
		environment.coordinator.onSessionTurnActiveChanged(session, true);
		await environment.gitService.waitForRootLookups(3);
		await tick();
		environment.coordinator.onSessionTurnActiveChanged(session, false);
		await environment.monitor.waitForAcquisitions(4);

		assert.deepStrictEqual({
			acquisitions: [...environment.monitor.acquisitions].sort(),
			disposals: [...environment.monitor.disposals].sort(),
		}, {
			acquisitions: [rootA.toString(), rootA.toString(), rootB.toString(), rootB.toString()].sort(),
			disposals: [rootA.toString(), rootB.toString()].sort(),
		});
	});

	test('deduplicates working directories that resolve to the same repository', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const sharedRoot = URI.file('/projects/mono');
		const dirA = 'file:///projects/mono/packages/a';
		const dirB = 'file:///projects/mono/packages/b';
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[dirA, sharedRoot],
			[dirB, sharedRoot],
		])));
		createMultiRootSession(environment.stateManager, session, [dirA, dirB]);

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.gitService.waitForRootLookups(2);
		await tick();

		assert.deepStrictEqual(environment.monitor.acquisitions, [sharedRoot.toString()]);
	});

	test('releases every repository root when the last subscriber leaves', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const rootA = URI.file('/projects/repoA');
		const rootB = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[rootA.toString(), rootA],
			[rootB.toString(), rootB],
		])));
		createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(2);
		environment.coordinator.onLastSubscriber(URI.parse(session));
		await tick();

		assert.deepStrictEqual({
			acquisitions: [...environment.monitor.acquisitions].sort(),
			disposals: [...environment.monitor.disposals].sort(),
		}, {
			acquisitions: [rootA.toString(), rootB.toString()].sort(),
			disposals: [rootA.toString(), rootB.toString()].sort(),
		});
	});

	test('watches secondary git repositories even when the primary folder is not a git repository', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const nonGitPrimary = 'file:///projects';
		const secondaryRoot = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map<string, URI | undefined>([
			[nonGitPrimary, undefined],
			[secondaryRoot.toString(), secondaryRoot],
		])));
		createMultiRootSession(environment.stateManager, session, [nonGitPrimary, secondaryRoot.toString()]);

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(1);
		environment.changesets.clearRefreshes();
		environment.monitor.fire(secondaryRoot);
		await tick();

		assert.deepStrictEqual({
			acquisitions: environment.monitor.acquisitions,
			refreshedWith: environment.gitStateService.refreshedWith,
			recomputed: environment.changesets.recomputed,
		}, {
			acquisitions: [secondaryRoot.toString()],
			refreshedWith: [{ sessionKey: session, workingDirectory: nonGitPrimary }],
			recomputed: [session],
		});
	});

	test('does not refresh from any root while a turn is active', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const rootA = URI.file('/projects/repoA');
		const rootB = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[rootA.toString(), rootA],
			[rootB.toString(), rootB],
		])));
		createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(2);
		environment.coordinator.onSessionTurnActiveChanged(session, true);
		await environment.gitService.waitForRootLookups(3);
		await tick();
		environment.changesets.clearRefreshes();

		// While the turn runs, every root watcher is released; external edits to
		// any root must not trigger a mid-turn refresh (turn edits are captured
		// by the turn lifecycle instead).
		environment.monitor.fire(rootA);
		environment.monitor.fire(rootB);
		await tick();

		assert.deepStrictEqual({
			recomputed: environment.changesets.recomputed,
			refreshed: environment.gitStateService.refreshed,
		}, {
			recomputed: [],
			refreshed: [],
		});
	});

	test('does not refresh an idle session sharing a secondary root while another session runs a turn', async () => {
		const sessionA = AgentSession.uri('mock', 'session-a').toString();
		const sessionB = AgentSession.uri('mock', 'session-b').toString();
		const sharedRoot = URI.file('/projects/shared');
		const rootB = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[sharedRoot.toString(), sharedRoot],
			[rootB.toString(), rootB],
		])));
		// A's primary is the shared repo; B watches the shared repo as a secondary.
		createMultiRootSession(environment.stateManager, sessionA, [sharedRoot.toString()]);
		createMultiRootSession(environment.stateManager, sessionB, [rootB.toString(), sharedRoot.toString()]);

		environment.coordinator.onFirstSubscriber(URI.parse(sessionA));
		environment.coordinator.onFirstSubscriber(URI.parse(sessionB));
		await environment.monitor.waitForAcquisitions(2);
		environment.coordinator.onSessionTurnActiveChanged(sessionA, true);
		await environment.gitService.waitForRootLookups(4);
		await tick();
		environment.changesets.clearRefreshes();

		// While A runs a turn the shared root is active, so an external edit
		// there must NOT refresh the idle sharer B (documented, accepted
		// shared-root suspension — decision D4).
		environment.monitor.fire(sharedRoot);
		await tick();

		assert.deepStrictEqual(environment.changesets.recomputed, []);
	});

	test('disposing a session with a live branch subscription clears watch interest', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repo/worktree');

		// Subscribe via the BRANCH changeset URI (tracks the branch subscription key).
		environment.coordinator.onFirstSubscriber(URI.parse(buildBranchChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(1);

		// An abrupt dispose (no onLastSubscriber) must clear the branch watch
		// interest, so a later materialization retry cannot resurrect a watcher.
		environment.coordinator.onSessionDisposed(session);
		environment.coordinator.onSessionMaterialized(session);
		await tick();

		assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals }, {
			acquisitions: ['file:///repo'],
			disposals: ['file:///repo'],
		});
	});

	test('detaches a repository root watcher when a session stops resolving to it', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const rootA = URI.file('/projects/repoA');
		const rootB = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[rootA.toString(), rootA],
			[rootB.toString(), rootB],
		])));
		createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(2);

		// repoB drops out of the session's working directories; the next
		// re-attach must detach and dispose only repoB's watcher.
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectoryRemoved, directory: rootB.toString() });
		environment.coordinator.onSessionMaterialized(session);
		await environment.gitService.waitForRootLookups(3);
		await tick();

		assert.deepStrictEqual({
			acquisitions: [...environment.monitor.acquisitions].sort(),
			disposals: environment.monitor.disposals,
		}, {
			acquisitions: [rootA.toString(), rootB.toString()].sort(),
			disposals: [rootB.toString()],
		});
	});

	test('keeps a shared secondary root watched for an idle session while another session runs a turn', async () => {
		const sessionA = AgentSession.uri('mock', 'session-a').toString();
		const sessionB = AgentSession.uri('mock', 'session-b').toString();
		const rootA = URI.file('/projects/repoA');
		const rootB = URI.file('/projects/repoB');
		const sharedRoot = URI.file('/projects/shared');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[rootA.toString(), rootA],
			[rootB.toString(), rootB],
			[sharedRoot.toString(), sharedRoot],
		])));
		// The shared repo is a SECONDARY root for A (primary repoA) and for B.
		createMultiRootSession(environment.stateManager, sessionA, [rootA.toString(), sharedRoot.toString()]);
		createMultiRootSession(environment.stateManager, sessionB, [rootB.toString(), sharedRoot.toString()]);

		environment.coordinator.onFirstSubscriber(URI.parse(sessionA));
		environment.coordinator.onFirstSubscriber(URI.parse(sessionB));
		await environment.monitor.waitForAcquisitions(3);
		environment.coordinator.onSessionTurnActiveChanged(sessionA, true);
		await environment.gitService.waitForRootLookups(5);
		await tick();
		environment.changesets.clearRefreshes();

		// A's active root is its PRIMARY (repoA); the shared secondary stays
		// watched for the idle sharer B, so an edit there still refreshes B (D4).
		environment.monitor.fire(sharedRoot);
		await tick();

		assert.deepStrictEqual(environment.changesets.recomputed, [sessionB]);
	});

	test('retries a repository root whose watcher acquisition failed on the next re-attach', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const rootA = URI.file('/projects/repoA');
		const rootB = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[rootA.toString(), rootA],
			[rootB.toString(), rootB],
		])));
		createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);

		// repoB's watcher acquisition fails on the first attempt.
		environment.monitor.failAcquireFor.add(rootB.toString());
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(2);
		await tick();

		// The failure clears; a re-attach must retry repoB (not short-circuit on
		// a cached signature) so an edit there then refreshes the summary.
		environment.monitor.failAcquireFor.delete(rootB.toString());
		environment.coordinator.onSessionMaterialized(session);
		await environment.monitor.waitForAcquisitions(3);
		environment.changesets.clearRefreshes();
		environment.monitor.fire(rootB);
		await tick();

		assert.deepStrictEqual({
			acquisitions: [...environment.monitor.acquisitions].sort(),
			recomputed: environment.changesets.recomputed,
		}, {
			acquisitions: [rootA.toString(), rootB.toString(), rootB.toString()].sort(),
			recomputed: [session],
		});
	});

	test('re-attaches root watchers when a working directory is added or removed mid-session', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const rootA = URI.file('/projects/repoA');
		const rootB = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[rootA.toString(), rootA],
			[rootB.toString(), rootB],
		])));
		createSession(environment.stateManager, session, rootA.toString());

		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(1);

		// Adding a second root mid-session must start watching it (no lifecycle
		// event required) so external edits there refresh the summary.
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: rootB.toString() });
		await environment.monitor.waitForAcquisitions(2);

		// Removing it again must stop watching that root.
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectoryRemoved, directory: rootB.toString() });
		await environment.monitor.waitForDisposals(1);

		assert.deepStrictEqual({
			acquisitions: [...environment.monitor.acquisitions].sort(),
			disposals: [...environment.monitor.disposals],
		}, {
			acquisitions: [rootA.toString(), rootB.toString()].sort(),
			disposals: [rootB.toString()],
		});
	});

	test('a subagent inheriting a multi-root parent watches every parent root and refreshes via the parent primary', async () => {
		const parentSession = AgentSession.uri('mock', 'session-parent').toString();
		const subagentSession = buildSubagentSessionUri(parentSession, 'tool-1');
		const primaryRoot = URI.file('/projects/repoA');
		const secondaryRoot = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[primaryRoot.toString(), primaryRoot],
			[secondaryRoot.toString(), secondaryRoot],
		])));
		createMultiRootSession(environment.stateManager, parentSession, [primaryRoot.toString(), secondaryRoot.toString()]);
		// The subagent has NO own working directories, so it inherits the parent's set.
		createSession(environment.stateManager, subagentSession);

		environment.coordinator.onFirstSubscriber(URI.parse(subagentSession));
		await environment.monitor.waitForAcquisitions(2);
		environment.changesets.clearRefreshes();

		// An external edit in the parent's SECONDARY repo refreshes the subagent,
		// sourcing git state from the parent's PRIMARY working directory.
		environment.monitor.fire(secondaryRoot);
		await tick();

		assert.deepStrictEqual({
			acquisitions: [...environment.monitor.acquisitions].sort(),
			refreshedWith: environment.gitStateService.refreshedWith,
			recomputed: environment.changesets.recomputed,
		}, {
			acquisitions: [primaryRoot.toString(), secondaryRoot.toString()].sort(),
			refreshedWith: [{ sessionKey: subagentSession, workingDirectory: primaryRoot.toString() }],
			recomputed: [subagentSession],
		});
	});

	test('re-attaches an inheriting subagent when the parent gains a working directory mid-session', async () => {
		const parentSession = AgentSession.uri('mock', 'session-parent').toString();
		const subagentSession = buildSubagentSessionUri(parentSession, 'tool-1');
		const rootA = URI.file('/projects/repoA');
		const rootB = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[rootA.toString(), rootA],
			[rootB.toString(), rootB],
		])));
		// The parent starts single-root; the subagent inherits its set.
		createSession(environment.stateManager, parentSession, rootA.toString());
		createSession(environment.stateManager, subagentSession);

		environment.coordinator.onFirstSubscriber(URI.parse(subagentSession));
		await environment.monitor.waitForAcquisitions(1);

		// The PARENT gains a second root mid-session: the inheriting subagent must
		// start watching it too (fan-out to subagents on a parent change).
		environment.stateManager.dispatchServerAction(parentSession, { type: ActionType.SessionWorkingDirectorySet, directory: rootB.toString() });
		await environment.monitor.waitForAcquisitions(2);

		assert.deepStrictEqual([...environment.monitor.acquisitions].sort(), [rootA.toString(), rootB.toString()].sort());
	});
});

function createGitService(root: URI): IAgentHostGitService & { readonly rootLookupCalls: string[]; waitForRootLookups(count: number): Promise<void> } {
	return createGitServiceFromResolver(() => root);
}

function createRoutingGitService(routes: ReadonlyMap<string, URI | undefined>): IAgentHostGitService & { readonly rootLookupCalls: string[]; waitForRootLookups(count: number): Promise<void> } {
	return createGitServiceFromResolver(workingDirectory => routes.get(workingDirectory.toString()));
}

function createGitServiceFromResolver(resolveRoot: (workingDirectory: URI) => URI | undefined): IAgentHostGitService & { readonly rootLookupCalls: string[]; waitForRootLookups(count: number): Promise<void> } {
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
		async getRepositoryRoot(workingDirectory: URI): Promise<URI | undefined> {
			rootLookupCalls.push(workingDirectory.toString());
			releaseWaiters();
			return resolveRoot(workingDirectory);
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
	private readonly _onDidChangeSessionGitHubState = this._register(new Emitter<string>());
	readonly onDidChangeSessionGitHubState = this._onDidChangeSessionGitHubState.event;

	readonly refreshed: string[] = [];
	readonly refreshedWith: Array<{ readonly sessionKey: string; readonly workingDirectory: string | undefined }> = [];

	async refreshSessionGitState(sessionKey: string, workingDirectory?: URI): Promise<void> {
		// Mirror the production service: record the refresh (and the working
		// directory it was asked to refresh from) and notify listeners so the
		// coordinator recomputes the subscribed changesets.
		this.refreshed.push(sessionKey);
		this.refreshedWith.push({ sessionKey, workingDirectory: workingDirectory?.toString() });
		this._onDidRefreshSessionGitState.fire(sessionKey);
	}
	async resolveSessionBaseBranchName(): Promise<string | undefined> { return undefined; }
	async setSessionGitHubState(_sessionKey: string, _state: ISessionGitHubState): Promise<void> { }
	async recordSessionMerge(_sessionKey: string, _commit?: string): Promise<void> { }
	async attachSessionGitHubPullRequest(_sessionKey: string): Promise<void> { }

	fireGitHubStateChanged(sessionKey: string): void {
		this._onDidChangeSessionGitHubState.fire(sessionKey);
	}
}

class TestFileMonitorService extends Disposable implements IAgentHostFileMonitorService {
	declare readonly _serviceBrand: undefined;

	readonly acquisitions: string[] = [];
	readonly disposals: string[] = [];
	failAcquire = false;
	readonly failAcquireFor = new Set<string>();
	private readonly _callbacks = new Map<string, Set<() => void>>();
	private readonly _acquisitionWaiters: Array<{ count: number; deferred: DeferredPromise<void> }> = [];
	private readonly _disposalWaiters: Array<{ count: number; deferred: DeferredPromise<void> }> = [];

	acquire(folder: URI, callback: () => void, _options?: IAgentHostFileMonitorOptions): IDisposable | undefined {
		const root = folder.toString();
		this.acquisitions.push(root);
		if (this.failAcquire || this.failAcquireFor.has(root)) {
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
			this._releaseDisposalWaiters();
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

	waitForDisposals(count: number): Promise<void> {
		if (this.disposals.length >= count) {
			return Promise.resolve();
		}
		const deferred = new DeferredPromise<void>();
		this._disposalWaiters.push({ count, deferred });
		return deferred.p;
	}

	private _releaseDisposalWaiters(): void {
		for (const waiter of [...this._disposalWaiters]) {
			if (this.disposals.length >= waiter.count) {
				this._disposalWaiters.splice(this._disposalWaiters.indexOf(waiter), 1);
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
	refreshChangesetCatalog(_session: string): void { }
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
