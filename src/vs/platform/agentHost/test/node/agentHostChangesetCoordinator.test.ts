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
import { buildBranchChangesetUri, buildDefaultChangesetCatalog, buildSessionChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri, buildFolderChangesetOwnerUri, buildWorkingSetChangesetUri, ChangesetKind, parseChangesetUri } from '../../common/changesetUri.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentSessionUri, ChangesetOperationScope, ChangesetStatus, ChatOriginKind, ChangesetOperationStatus, SessionStatus, withSessionGitState, type ChangesetOperation, type ISessionFileDiff, type ISessionGitHubState, type ISessionGitState } from '../../common/state/sessionState.js';
import { AgentConfigurationService, getEffectiveWorkingDirectories, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChangesetCoordinator } from '../../node/agentHostChangesetCoordinator.js';
import { resolveChangesetSubscriptions } from '../../node/agentHostChangesetSummary.js';
import { ChangesetDiffStrategy, IAgentHostChangesetService, StaticChangesetKind } from '../../common/agentHostChangesetService.js';
import { IAgentHostChangesetOperationService } from '../../common/agentHostChangesetOperationService.js';
import { AgentHostChangesetOperationService } from '../../node/agentHostChangesetOperationService.js';
import { AgentHostFileEditCoordinator } from '../../node/agentHostFileEditCoordinator.js';
import { AgentHostFileMonitorCallback, IAgentHostFileMonitorOptions, IAgentHostFileMonitorService } from '../../node/agentHostFileMonitorService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentHostGitStateService, IRefreshSessionGitStateOptions } from '../../common/agentHostGitStateService.js';
import { AgentHostStateManager, IAgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { createNoopGitService } from '../common/sessionTestHelpers.js';
import { ChangesSummary } from '../../common/state/protocol/state.js';
import { IAgentHostChangesetSubscriptionService } from '../../common/agentHostChangesetSubscriptionService.js';
import { AgentHostChangesetSubscriptionService } from '../../node/agentHostChangesetSubscriptionService.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { IAgentHostChatOwnershipService } from '../../node/agentHostChatOwnershipService.js';

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
			defaultChat: buildDefaultChatUri(session),
		}, { emitNotification });
		stateManager.setSessionChangesets(session, buildDefaultChangesetCatalog(session, false, false));
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
	}

	function createMultiRootSession(stateManager: AgentHostStateManager, session: string, workingDirectories: readonly string[]): void {
		createSession(stateManager, session, workingDirectories[0]);
		for (const workingDirectory of workingDirectories.slice(1)) {
			stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workingDirectory });
		}
	}

	function buildDefaultBranchChangesetUri(session: string, workingDirectories: readonly string[] = []): string {
		return buildBranchChangesetUri(buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId(workingDirectories)));
	}

	function buildBranchChangesetOwner(session: string, workingDirectories: readonly string[] = []): string {
		return parseChangesetUri(buildDefaultBranchChangesetUri(session, workingDirectories))!.ownerUri;
	}

	function createEnvironment(root: URI = URI.file('/repo'), gitServiceOverride?: IAgentHostGitService & { readonly rootLookupCalls: string[]; waitForRootLookups(count: number): Promise<void> }): {
		stateManager: AgentHostStateManager;
		changesets: TestChangesetService;
		subscriptions: IAgentHostChangesetSubscriptionService;
		monitor: TestFileMonitorService;
		gitService: IAgentHostGitService & { readonly rootLookupCalls: string[]; waitForRootLookups(count: number): Promise<void> };
		gitStateService: TestGitStateService;
		coordinator: AgentHostChangesetCoordinator;
		operationService: IAgentHostChangesetOperationService;
		updateOperationsCalls: string[];
	} {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const logService = new NullLogService();
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const subscriptions = disposables.add(new AgentHostChangesetSubscriptionService());
		const changesets = new TestChangesetService(subscriptions, stateManager);
		const monitor = disposables.add(new TestFileMonitorService());
		const gitService = gitServiceOverride ?? createGitService(root);
		const gitStateService = disposables.add(new TestGitStateService());
		const updateOperationsCalls: string[] = [];
		class RecordingOperationService extends AgentHostChangesetOperationService {
			override updateOperations(sessionKey: string, changeset?: string, gitState?: ISessionGitState, gitHubState?: ISessionGitHubState): void {
				updateOperationsCalls.push(sessionKey);
				super.updateOperations(sessionKey, changeset, gitState, gitHubState);
			}

			override scheduleRelatedOperationsUpdate(resourceKey: string): void {
				updateOperationsCalls.push(resourceKey);
				super.scheduleRelatedOperationsUpdate(resourceKey);
			}

			override scheduleOwnerOperationsUpdate(ownerKey: string): void {
				updateOperationsCalls.push(ownerKey);
				super.scheduleOwnerOperationsUpdate(ownerKey);
			}
		}
		const operationService = disposables.add(new RecordingOperationService(stateManager, gitStateService, subscriptions, configurationService, createTestChatOwnershipService(stateManager), disposables.add(new AgentHostFileEditCoordinator()), logService));
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentHostStateManager, stateManager],
			[IAgentHostChatOwnershipService, createTestChatOwnershipService(stateManager)],
			[IAgentConfigurationService, configurationService],
			[IAgentHostChangesetOperationService, operationService],
			[IAgentHostChangesetService, changesets],
			[IAgentHostChangesetSubscriptionService, subscriptions],
			[IAgentHostFileMonitorService, monitor],
			[IAgentHostGitService, gitService],
			[IAgentHostGitStateService, gitStateService],
		), /*strict*/ true));
		const coordinator = disposables.add(instantiationService.createInstance(AgentHostChangesetCoordinator));
		return { stateManager, changesets, subscriptions, monitor, gitService, gitStateService, coordinator, operationService, updateOperationsCalls };
	}

	const largeSessionOperations: readonly ChangesetOperation[] = [{
		id: 'test-operation',
		label: 'Test',
		scopes: [ChangesetOperationScope.Changeset],
		status: ChangesetOperationStatus.Idle,
	}];

	function registerLargeSessionOperations(operationService: IAgentHostChangesetOperationService): IDisposable {
		return operationService.registerContribution({
			registerHandlers: () => Disposable.None,
			getOperations: () => largeSessionOperations,
			dispose: () => { },
		});
	}

	function seedLargeSessionGitState(gitStateService: TestGitStateService, session: string, chats: readonly string[]): void {
		const gitState: ISessionGitState = { branchName: 'feature' };
		gitStateService.setGitState(session, gitState);
		for (const chat of chats) {
			gitStateService.setGitState(chat, gitState);
		}
	}

	async function seedLargeMultiChatChangesets(stateManager: AgentHostStateManager, subscriptions: IAgentHostChangesetSubscriptionService, session: string): Promise<{
		readonly chats: string[];
		readonly sessionChangesets: string[];
		readonly chatChangesets: ReadonlyMap<string, readonly string[]>;
	}> {
		const defaultChat = buildDefaultChatUri(session);
		stateManager.dispatchServerAction(defaultChat, { type: ActionType.ChatWorkingDirectorySet, directory: 'file:///repoA' });
		const chats = [defaultChat];
		for (let i = 1; i < 32; i++) {
			const chat = buildChatUri(session, `peer-${i}`);
			stateManager.addChat(session, chat, creationTimeChatStorageResource(session, chat, buildDefaultChatUri(session)), { workingDirectories: ['file:///repoA'] });
			chats.push(chat);
		}
		await tick();

		const chatChangesets = new Map<string, readonly string[]>();
		for (const chat of chats) {
			const changesets: string[] = [];
			for (let i = 0; i < 25; i++) {
				const changeset = buildTurnChangesetUri(chat, `turn-${i}`);
				stateManager.registerChangeset(changeset);
				subscriptions.addSubscription(chat, changeset);
				stateManager.dispatchServerAction(changeset, { type: ActionType.ChangesetOperationsChanged, operations: [...largeSessionOperations] });
				changesets.push(changeset);
			}
			chatChangesets.set(chat, changesets);
		}
		const sessionChangesets: string[] = [];
		for (let i = 0; i < 4; i++) {
			const changeset = buildTurnChangesetUri(session, `aggregate-${i}`);
			stateManager.registerChangeset(changeset);
			subscriptions.addSubscription(session, changeset);
			stateManager.dispatchServerAction(changeset, { type: ActionType.ChangesetOperationsChanged, operations: [...largeSessionOperations] });
			sessionChangesets.push(changeset);
		}
		return { chats, sessionChangesets, chatChangesets };
	}

	for (const cancelled of [false, true]) {
		test(`cold turn subscription ${cancelled ? 'does not refresh after cancellation' : 'refreshes once after restore'}`, async () => {
			const { coordinator, stateManager, changesets } = createEnvironment();
			const session = AgentSession.uri('mock', 'cold-turn').toString();
			const turn = buildTurnChangesetUri(buildDefaultChatUri(session), 'turn-1');
			stateManager.registerChangeset(turn);
			coordinator.onFirstSubscriber(URI.parse(turn));
			if (cancelled) {
				coordinator.onLastSubscriber(URI.parse(turn));
			}

			let restores = 0;
			const restore = async () => {
				restores++;
				createSession(stateManager, session, 'file:///repo');
				return session;
			};
			await coordinator.restoreSessionIfChangesetSubscription(URI.parse(turn), restore);
			await coordinator.restoreSessionIfChangesetSubscription(URI.parse(turn), restore);

			assert.deepStrictEqual({ restores, turnRefreshes: changesets.turnRefreshes }, {
				restores: 1,
				turnRefreshes: cancelled ? [] : [turn],
			});
		});
	}

	for (const kind of ['branch', 'uncommitted'] as const) {
		test(`cold ${kind} subscription refreshes once after restore`, async () => {
			const { coordinator, stateManager, changesets, monitor } = createEnvironment();
			const session = AgentSession.uri('mock', 'cold-static').toString();
			const owner = kind === 'branch' ? buildBranchChangesetOwner(session, ['file:///repo'])
				: buildDefaultChatUri(session);
			const resource = kind === 'branch' ? buildBranchChangesetUri(owner)
				: buildUncommittedChangesetUri(owner);
			coordinator.onFirstSubscriber(URI.parse(resource));
			const refreshes = kind === 'branch' ? changesets.branchRefreshes
				: changesets.uncommittedRefreshes;
			const before = refreshes.length;

			let restores = 0;
			const restore = async () => {
				restores++;
				createSession(stateManager, session, 'file:///repo');
				return session;
			};
			await coordinator.restoreSessionIfChangesetSubscription(URI.parse(resource), restore);
			await coordinator.restoreSessionIfChangesetSubscription(URI.parse(resource), restore);
			await monitor.waitForAcquisitions(1);

			assert.deepStrictEqual({ restores, refreshes: refreshes.slice(before), monitored: monitor.acquisitions }, {
				restores: 1,
				refreshes: [owner],
				monitored: ['file:///repo'],
			});
		});
	}

	for (const isolation of ['folder', 'worktree', undefined]) {
		test(`session subscription refreshes the summary source for ${isolation ?? 'unresolved'} isolation`, () => {
			const { coordinator, stateManager, changesets, subscriptions } = createEnvironment();
			const session = AgentSession.uri('mock', 'summary-source').toString();
			createSession(stateManager, session);
			stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: isolation } });

			coordinator.onFirstSubscriber(URI.parse(session));
			const subscribed = [...subscriptions.getSessionSubscriptions(session)];
			coordinator.onLastSubscriber(URI.parse(session));
			coordinator.onFirstSubscriber(URI.parse(session));
			coordinator.onLastSubscriber(URI.parse(session));

			assert.deepStrictEqual({
				subscribed,
				released: [...subscriptions.getSessionSubscriptions(session)],
				branch: changesets.branchRefreshes,
				session: changesets.sessionRefreshes,
			}, {
				subscribed: [session],
				released: [],
				branch: isolation === 'worktree' ? [buildBranchChangesetOwner(session), buildBranchChangesetOwner(session)] : [],
				session: isolation === 'worktree' ? [] : [session, session],
			});
		});
	}

	test('worktree summary interest refreshes distinct peer branch scopes without exposing peer subscriptions', () => {
		const { coordinator, stateManager, changesets, subscriptions } = createEnvironment();
		const session = AgentSession.uri('mock', 'worktree-summary-scopes').toString();
		const peer = buildChatUri(session, 'peer');
		createSession(stateManager, session, 'file:///repoA');
		stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
		stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, buildDefaultChatUri(session)), { workingDirectories: ['file:///repoB'] });
		stateManager.setChangesets(peer, [{
			label: 'Branch Changes',
			changeKind: 'branch',
			uriTemplate: buildDefaultBranchChangesetUri(session, ['file:///repoB']),
		}]);

		coordinator.onFirstSubscriber(URI.parse(session));

		assert.deepStrictEqual({
			branch: changesets.branchRefreshes,
			sessionSubscriptions: [...subscriptions.getSessionSubscriptions(session)],
			peerSubscriptions: [...subscriptions.getSessionSubscriptions(peer)],
		}, {
			branch: [
				buildBranchChangesetOwner(session, ['file:///repoA']),
				buildBranchChangesetOwner(session, ['file:///repoB']),
			],
			sessionSubscriptions: [session],
			peerSubscriptions: [],
		});
	});

	for (const previousIsolation of [undefined, 'folder', 'worktree']) {
		for (const isolation of ['folder', 'worktree']) {
			test(`restoring ${isolation} isolation from ${previousIsolation ?? 'unresolved'} refreshes only a changed summary source`, () => {
				const { coordinator, stateManager, changesets, subscriptions } = createEnvironment();
				const session = AgentSession.uri('mock', 'restored-isolation').toString();
				createSession(stateManager, session);
				if (previousIsolation) {
					stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: previousIsolation } });
				}
				coordinator.onFirstSubscriber(URI.parse(session));
				changesets.clearRefreshes();

				const previous = stateManager.getSessionState(session)?.config;
				stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: isolation } });
				coordinator.onSessionConfigRestored(session, previous);
				const current = stateManager.getSessionState(session)?.config;
				stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: isolation } });
				coordinator.onSessionConfigRestored(session, current);

				assert.deepStrictEqual({
					subscriptions: [...subscriptions.getSessionSubscriptions(session)],
					branch: changesets.branchRefreshes,
					session: changesets.sessionRefreshes,
				}, {
					subscriptions: [session],
					branch: isolation === 'worktree' && previousIsolation !== 'worktree' ? [buildBranchChangesetOwner(session)] : [],
					session: isolation === 'folder' && previousIsolation === 'worktree' ? [session] : [],
				});
			});
		}
	}

	test('post-restore session subscription setup is idempotent and does not watch files', async () => {
		const { coordinator, stateManager, changesets, subscriptions, monitor, gitService } = createEnvironment();
		const session = AgentSession.uri('mock', 'concurrent-restore').toString();
		coordinator.onFirstSubscriber(URI.parse(session));
		createSession(stateManager, session, 'file:///repo');
		stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'folder' } });

		coordinator.ensureSessionSubscription(session);
		coordinator.ensureSessionSubscription(session);
		await tick();
		coordinator.onLastSubscriber(URI.parse(session));
		await tick();

		assert.deepStrictEqual({
			branch: changesets.branchRefreshes,
			session: changesets.sessionRefreshes,
			rootLookups: gitService.rootLookupCalls,
			acquisitions: monitor.acquisitions,
			disposals: monitor.disposals,
			subscriptions: [...subscriptions.getSessionSubscriptions(session)],
		}, {
			branch: [],
			session: [session],
			rootLookups: [],
			acquisitions: [],
			disposals: [],
			subscriptions: [],
		});
	});

	test('nested subagents use Session Changes regardless of ancestor isolation or missing state', () => {
		const { coordinator, stateManager, changesets } = createEnvironment();
		const root = AgentSession.uri('mock', 'root-isolation').toString();
		const child = buildSubagentSessionUri(root, 'child');
		const grandchild = buildSubagentSessionUri(child, 'grandchild');
		createSession(stateManager, root);
		createSession(stateManager, grandchild);
		stateManager.setSessionConfig(root, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'folder' } });
		coordinator.onFirstSubscriber(URI.parse(grandchild));
		coordinator.onLastSubscriber(URI.parse(grandchild));

		createSession(stateManager, child);
		stateManager.setSessionConfig(child, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
		coordinator.onFirstSubscriber(URI.parse(grandchild));
		coordinator.onLastSubscriber(URI.parse(grandchild));
		stateManager.setSessionConfig(grandchild, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'folder' } });
		coordinator.onFirstSubscriber(URI.parse(grandchild));

		assert.deepStrictEqual({ branch: changesets.branchRefreshes, session: changesets.sessionRefreshes }, {
			branch: [],
			session: [grandchild, grandchild, grandchild],
		});
	});

	for (const [isolation, implicitFirst] of [['folder', true], ['folder', false], ['worktree', true], ['worktree', false]] as const) {
		test(`${isolation} implicit and explicit summary subscriptions survive ${implicitFirst ? 'implicit' : 'explicit'} removal`, () => {
			const { coordinator, stateManager, subscriptions } = createEnvironment();
			const session = AgentSession.uri('mock', 'shared-interest').toString();
			const changeset = isolation === 'worktree' ? buildDefaultBranchChangesetUri(session) : buildSessionChangesetUri(session);
			createSession(stateManager, session);
			stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: isolation } });
			coordinator.onFirstSubscriber(URI.parse(session));
			coordinator.onFirstSubscriber(URI.parse(changeset));

			coordinator.onLastSubscriber(URI.parse(implicitFirst ? session : changeset));
			const changesetOwner = parseChangesetUri(changeset)?.ownerUri ?? session;
			const remaining = [
				...subscriptions.getSessionSubscriptions(session),
				...(changesetOwner === session ? [] : subscriptions.getSessionSubscriptions(changesetOwner)),
			];
			coordinator.onLastSubscriber(URI.parse(implicitFirst ? changeset : session));

			const released = [
				...subscriptions.getSessionSubscriptions(session),
				...(changesetOwner === session ? [] : subscriptions.getSessionSubscriptions(changesetOwner)),
			];
			assert.deepStrictEqual({ remaining, released }, {
				remaining: [implicitFirst ? changeset : session],
				released: [],
			});
		});
	}

	test('isolation changes recompute only the session summary without introducing subagent inheritance', () => {
		const { coordinator, stateManager, changesets } = createEnvironment();
		const session = AgentSession.uri('mock', 'parent-summary').toString();
		const child = buildSubagentSessionUri(session, 'tool-1');
		const grandchild = buildSubagentSessionUri(child, 'tool-2');
		const overridden = buildSubagentSessionUri(session, 'overridden');
		const overriddenChild = buildSubagentSessionUri(overridden, 'tool-3');
		createSession(stateManager, session);
		createSession(stateManager, child);
		createSession(stateManager, grandchild);
		createSession(stateManager, overridden);
		createSession(stateManager, overriddenChild);
		stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
		stateManager.setSessionConfig(overridden, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
		coordinator.onFirstSubscriber(URI.parse(session));
		coordinator.onFirstSubscriber(URI.parse(child));
		coordinator.onFirstSubscriber(URI.parse(grandchild));
		coordinator.onFirstSubscriber(URI.parse(overriddenChild));
		changesets.clearRefreshes();

		stateManager.dispatchServerAction(session, { type: ActionType.SessionConfigChanged, config: { [SessionConfigKey.Isolation]: 'folder' } });
		stateManager.dispatchServerAction(session, { type: ActionType.SessionConfigChanged, config: { [SessionConfigKey.Isolation]: 'worktree' } });

		assert.deepStrictEqual({ branch: changesets.branchRefreshes, session: changesets.sessionRefreshes }, {
			branch: [buildBranchChangesetOwner(session)],
			session: [session],
		});
	});

	for (const isolation of ['folder', 'worktree']) {
		for (const restored of [false, true]) {
			for (const hasGitState of [false, true]) {
				test(`switching from ${isolation} refreshes both operation lists (restored: ${restored}, git: ${hasGitState})`, async () => {
					const { coordinator, stateManager, operationService } = createEnvironment();
					const session = AgentSession.uri('mock', 'summary-operations').toString();
					const branch = buildDefaultBranchChangesetUri(session);
					const sessionChanges = buildSessionChangesetUri(session);
					const oldChangeset = isolation === 'worktree' ? branch : sessionChanges;
					const newChangeset = isolation === 'worktree' ? sessionChanges : branch;
					createSession(stateManager, session);
					stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: isolation } });
					stateManager.setSessionMeta(session, withSessionGitState(undefined, { branchName: 'feature' }));
					stateManager.registerChangeset(branch);
					stateManager.registerChangeset(sessionChanges);
					const operationId = 'test.isolationOperation';
					let invocations = 0;
					disposables.add(operationService.registerContribution({
						registerHandlers: registry => registry.registerChangesetOperationHandler(operationId, {
							invoke: async () => { invocations++; return {}; },
						}),
						getOperations: context => {
							const kind = stateManager.getSessionState(session)?.config?.values[SessionConfigKey.Isolation] === 'worktree'
								? ChangesetKind.Branch : ChangesetKind.Session;
							return context.changesetKind === kind
								? [{ id: operationId, label: 'Test', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }]
								: undefined;
						},
						dispose: () => { },
					}));
					operationService.updateOperations(session, branch);
					operationService.updateOperations(session, sessionChanges);
					coordinator.onFirstSubscriber(URI.parse(session));
					const previouslyAdvertised = stateManager.getChangesetState(oldChangeset)?.operations?.map(operation => operation.id);

					if (!hasGitState) {
						stateManager.setSessionMeta(session, {});
					}
					const config = { [SessionConfigKey.Isolation]: isolation === 'worktree' ? 'folder' : 'worktree' };
					if (restored) {
						const previous = stateManager.getSessionState(session)?.config;
						stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: config });
						coordinator.onSessionConfigRestored(session, previous);
					} else {
						stateManager.dispatchServerAction(session, { type: ActionType.SessionConfigChanged, config });
					}

					await assert.rejects(operationService.invokeChangesetOperation({ channel: oldChangeset, operationId }), /Unknown operation/);
					if (hasGitState) {
						await operationService.invokeChangesetOperation({ channel: newChangeset, operationId });
					} else {
						await assert.rejects(operationService.invokeChangesetOperation({ channel: newChangeset, operationId }), /Unknown operation/);
					}
					assert.deepStrictEqual({
						previouslyAdvertised,
						oldOperations: stateManager.getChangesetState(oldChangeset)?.operations,
						newOperations: stateManager.getChangesetState(newChangeset)?.operations?.map(operation => operation.id),
						invocations,
					}, {
						previouslyAdvertised: [operationId],
						oldOperations: [],
						newOperations: hasGitState ? [operationId] : [],
						invocations: hasGitState ? 1 : 0,
					});
				});
			}
		}
	}

	test('refreshes changeset operations when a session gains or loses a working directory', () => {
		const session = AgentSession.uri('mock', 'session-wd').toString();
		const peer = buildChatUri(session, 'peer');
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repoA');
		environment.stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, buildDefaultChatUri(session)));
		const baseline = environment.updateOperationsCalls.length;
		const summaryBaseline = environment.changesets.chatSummaryRefreshes.length;

		// Editor Window adds a second root -> multi-root: operations must refresh.
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///repoB' });
		assert.deepStrictEqual({
			operationRefreshes: environment.updateOperationsCalls.slice(baseline),
			chatSummaryRefreshes: environment.changesets.chatSummaryRefreshes.slice(summaryBaseline),
		}, {
			// Each chat is requested by its working-directory change and again by its announced Git refresh; both run as one update.
			operationRefreshes: [session, buildDefaultChatUri(session), buildDefaultChatUri(session), peer, peer],
			chatSummaryRefreshes: [buildDefaultChatUri(session), peer],
		});

		// A no-op working-directory action (same root) must not refresh again.
		const afterAdd = environment.updateOperationsCalls.length;
		const summariesAfterAdd = environment.changesets.chatSummaryRefreshes.length;
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///repoB' });
		assert.deepStrictEqual({
			operationRefreshes: environment.updateOperationsCalls.length - afterAdd,
			chatSummaryRefreshes: environment.changesets.chatSummaryRefreshes.length - summariesAfterAdd,
		}, {
			operationRefreshes: 0,
			chatSummaryRefreshes: 0,
		});

		// Removing the second root -> back to single-root: operations refresh again (restore).
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectoryRemoved, directory: 'file:///repoB' });
		assert.deepStrictEqual({
			operationRefreshes: environment.updateOperationsCalls.slice(afterAdd),
			chatSummaryRefreshes: environment.changesets.chatSummaryRefreshes.slice(summariesAfterAdd),
		}, {
			// Each chat is requested by its working-directory change and again by its announced Git refresh; both run as one update.
			operationRefreshes: [session, buildDefaultChatUri(session), buildDefaultChatUri(session), peer, peer],
			chatSummaryRefreshes: [buildDefaultChatUri(session), peer],
		});
	});

	test('a session working-directory change refreshes Git state of inheriting chats but not of subagents', () => {
		const session = AgentSession.uri('mock', 'subagent-git').toString();
		const defaultChat = buildDefaultChatUri(session);
		const subagent = buildChatUri(session, 'subagent');
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repoA');
		environment.stateManager.addChat(session, subagent, defaultChat, { origin: { kind: ChatOriginKind.Tool, chat: defaultChat, toolCallId: 'tool' } });
		const gitBaseline = environment.gitStateService.refreshed.length;
		const summaryBaseline = environment.changesets.chatSummaryRefreshes.length;

		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///repoB' });

		assert.deepStrictEqual({
			gitRefreshes: environment.gitStateService.refreshed.slice(gitBaseline).filter(key => key !== session),
			chatSummaryRefreshes: [...environment.changesets.chatSummaryRefreshes.slice(summaryBaseline)].sort(),
		}, {
			gitRefreshes: [defaultChat],
			// A subagent's changes still follow the folders it works in.
			chatSummaryRefreshes: [defaultChat, subagent].sort(),
		});
	});

	test('refreshes chat-owned changesets and Git state when a chat changes working directories', () => {
		const session = AgentSession.uri('mock', 'chat-wd').toString();
		const chat = buildChatUri(session, 'peer');
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///session');
		environment.stateManager.addChat(session, chat, creationTimeChatStorageResource(session, chat, buildDefaultChatUri(session)), { workingDirectories: ['file:///chat-a'] });
		const operationBaseline = environment.updateOperationsCalls.length;
		const gitBaseline = environment.gitStateService.refreshed.length;
		const summaryBaseline = environment.changesets.chatSummaryRefreshes.length;

		environment.stateManager.dispatchServerAction(chat, { type: ActionType.ChatWorkingDirectorySet, directory: 'file:///chat-b' });

		assert.deepStrictEqual({
			operationRefreshes: environment.updateOperationsCalls.slice(operationBaseline),
			gitRefreshes: environment.gitStateService.refreshed.slice(gitBaseline),
			chatSummaryRefreshes: environment.changesets.chatSummaryRefreshes.slice(summaryBaseline),
		}, {
			operationRefreshes: [chat, chat],
			gitRefreshes: [chat],
			chatSummaryRefreshes: [chat],
		});
	});

	test('set_workspace does not publish unchanged operations in a large multi-chat session', async () => {
		const session = AgentSession.uri('mock', 'large-set-workspace').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repoA');
		const seeded = await seedLargeMultiChatChangesets(environment.stateManager, environment.subscriptions, session);
		seedLargeSessionGitState(environment.gitStateService, session, seeded.chats);
		disposables.add(registerLargeSessionOperations(environment.operationService));
		const defaultChat = buildDefaultChatUri(session);
		const operationChanges: string[] = [];
		disposables.add(environment.stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.ChangesetOperationsChanged) {
				operationChanges.push(envelope.channel);
			}
		}));

		environment.stateManager.dispatchServerAction(session, {
			type: ActionType.SessionWorkingDirectoryReplaced,
			directory: 'file:///repoA',
			replacement: 'file:///repoB',
		});
		environment.stateManager.dispatchServerAction(defaultChat, { type: ActionType.ChatWorkingDirectoryRemoved, directory: 'file:///repoA' });
		environment.stateManager.dispatchServerAction(defaultChat, { type: ActionType.ChatWorkingDirectorySet, directory: 'file:///repoB' });
		await tick();

		assert.deepStrictEqual({
			watchedChats: seeded.chats.length,
			subscriptions: seeded.sessionChangesets.length + [...seeded.chatChangesets.values()].reduce((total, changesets) => total + changesets.length, 0),
			operationChanges,
		}, {
			watchedChats: 32,
			subscriptions: 804,
			operationChanges: [],
		});
	});

	test('refreshes session-dependent operations for an explicitly scoped chat after set_workspace', async () => {
		const session = AgentSession.uri('mock', 'explicit-chat-session-operation').toString();
		const chat = buildChatUri(session, 'peer');
		const changeset = buildTurnChangesetUri(chat, 'turn-1');
		const operationId = 'test.sessionWorkingDirectoryOperation';
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repoA');
		environment.stateManager.addChat(session, chat, creationTimeChatStorageResource(session, chat, buildDefaultChatUri(session)), { workingDirectories: ['file:///repoA'] });
		environment.stateManager.setSessionMeta(session, withSessionGitState(undefined, { branchName: 'feature' }));
		environment.gitStateService.setGitState(chat, { branchName: 'feature' });
		await tick();
		environment.stateManager.registerChangeset(changeset);
		environment.subscriptions.addSubscription(chat, changeset);
		disposables.add(environment.operationService.registerContribution({
			registerHandlers: () => Disposable.None,
			getOperations: () => environment.stateManager.getSessionState(session)?.workingDirectories?.[0] === 'file:///repoA'
				? [{ id: operationId, label: 'Test', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }]
				: undefined,
			dispose: () => { },
		}));
		environment.operationService.updateOperations(chat, changeset, { branchName: 'feature' });

		environment.stateManager.dispatchServerAction(session, {
			type: ActionType.SessionWorkingDirectoryReplaced,
			directory: 'file:///repoA',
			replacement: 'file:///repoB',
		});
		await tick();

		assert.deepStrictEqual(environment.stateManager.getChangesetState(changeset)?.operations, []);
	});

	test('create_session relationship=currentSession does not publish unchanged operations for existing scoped chats', async () => {
		const session = AgentSession.uri('mock', 'large-create-session').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repoA');
		const seeded = await seedLargeMultiChatChangesets(environment.stateManager, environment.subscriptions, session);
		seedLargeSessionGitState(environment.gitStateService, session, seeded.chats);
		disposables.add(registerLargeSessionOperations(environment.operationService));
		const operationChanges: string[] = [];
		disposables.add(environment.stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.ChangesetOperationsChanged) {
				operationChanges.push(envelope.channel);
			}
		}));

		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///repoB' });
		environment.stateManager.addChat(session, buildChatUri(session, 'new-peer'), creationTimeChatStorageResource(session, buildChatUri(session, 'new-peer'), buildDefaultChatUri(session)), { workingDirectories: ['file:///repoB'] });
		await tick();

		assert.deepStrictEqual({
			watchedChats: seeded.chats.length,
			subscriptions: seeded.sessionChangesets.length + [...seeded.chatChangesets.values()].reduce((total, changesets) => total + changesets.length, 0),
			operationChanges,
		}, {
			watchedChats: 32,
			subscriptions: 804,
			operationChanges: [],
		});
	});

	test('refreshes the session and chat catalogues when the session becomes ready', () => {
		const { coordinator, stateManager, changesets } = createEnvironment();
		const session = AgentSession.uri('mock', 'ready-catalog').toString();
		const defaultChat = buildDefaultChatUri(session);
		createSession(stateManager, session, 'file:///repo');
		const baseline = changesets.catalogRefreshes.length;

		coordinator.onSessionReady(session);

		assert.deepStrictEqual(changesets.catalogRefreshes.slice(baseline), [session, defaultChat]);
	});

	test('refreshes the changeset catalogue when Agent Merge enablement changes', () => {
		const { stateManager, changesets } = createEnvironment();
		const session = AgentSession.uri('mock', 'agent-merge-catalog').toString();
		const defaultChat = buildDefaultChatUri(session);
		createSession(stateManager, session, 'file:///repo');
		stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: {} });

		stateManager.dispatchServerAction(session, {
			type: ActionType.SessionConfigChanged,
			config: { mode: 'interactive' },
		});
		stateManager.dispatchServerAction(session, {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.AgentMerge]: { enabled: true } },
		});
		stateManager.dispatchServerAction(session, {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.AgentMerge]: { enabled: false } },
		});

		assert.deepStrictEqual(changesets.catalogRefreshes, [session, defaultChat, session, defaultChat]);
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
			[parentSession, buildDefaultChatUri(parentSession), buildDefaultChatUri(parentSession), subagentSession].sort(),
			'a parent root change refreshes every parent operation owner and its inheriting subagent, the default chat again for its Git refresh',
		);
	});

	test('shares root watchers across sessions and fans out root changes to static refreshes', async () => {
		const firstSession = AgentSession.uri('mock', 'session-1').toString();
		const secondSession = AgentSession.uri('mock', 'session-2').toString();
		const root = URI.file('/repo');
		const environment = createEnvironment(root);
		createSession(environment.stateManager, firstSession, 'file:///repo/worktree-a');
		createSession(environment.stateManager, secondSession, 'file:///repo/worktree-b');

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(firstSession)));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
		await environment.gitService.waitForRootLookups(2);
		await tick();
		environment.changesets.clearRefreshes();
		environment.gitStateService.clearRefreshes();

		environment.monitor.fire(root);
		await tick();

		assert.deepStrictEqual({
			acquisitions: environment.monitor.acquisitions,
			branchRefreshes: environment.changesets.branchRefreshes,
			sessionRefreshes: environment.changesets.sessionRefreshes,
			uncommittedRefreshes: environment.changesets.uncommittedRefreshes,
			gitStateRefreshes: environment.gitStateService.refreshed,
		}, {
			acquisitions: ['file:///repo'],
			branchRefreshes: [],
			sessionRefreshes: [],
			uncommittedRefreshes: [firstSession, secondSession],
			gitStateRefreshes: [firstSession, secondSession],
		});
	});

	test('releases a root watcher after the last interested session unsubscribes', async () => {
		const firstSession = AgentSession.uri('mock', 'session-1').toString();
		const secondSession = AgentSession.uri('mock', 'session-2').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, firstSession, 'file:///repo/worktree-a');
		createSession(environment.stateManager, secondSession, 'file:///repo/worktree-b');

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(firstSession)));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
		await environment.gitService.waitForRootLookups(2);
		await tick();

		environment.coordinator.onLastSubscriber(URI.parse(buildUncommittedChangesetUri(firstSession)));
		assert.deepStrictEqual(environment.monitor.disposals, []);
		environment.coordinator.onLastSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
		assert.deepStrictEqual(environment.monitor.disposals, ['file:///repo']);
	});

	test('catches up Git state missed while no client observed the uncommitted changeset', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const root = URI.file('/repo');
		const environment = createEnvironment(root);
		createSession(environment.stateManager, session, 'file:///repo/worktree');
		const changeset = URI.parse(buildUncommittedChangesetUri(session));

		environment.coordinator.onFirstSubscriber(changeset);
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onLastSubscriber(changeset);
		environment.gitStateService.clearRefreshes();

		// E.g. a `git pull` in a terminal: the root is no longer watched.
		environment.monitor.fire(root);
		environment.coordinator.onFirstSubscriber(changeset);
		await environment.monitor.waitForAcquisitions(2);
		await tick();

		assert.deepStrictEqual({ disposals: environment.monitor.disposals, gitStateRefreshes: environment.gitStateService.refreshed }, {
			disposals: ['file:///repo'],
			gitStateRefreshes: [session],
		});
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

	test('forwards session changeset refresh and recomputes current subscriptions on materialization', async () => {
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
			sessionRefreshes: [session, session],
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

	test('subscription registry reports every membership change without duplicate notifications', () => {
		const subscriptions = disposables.add(new AgentHostChangesetSubscriptionService());
		const session = AgentSession.uri('mock', 'membership').toString();
		const first = buildSessionChangesetUri(session);
		const second = buildUncommittedChangesetUri(session);
		const observed: string[][] = [];
		disposables.add(subscriptions.onDidChangeSessionSubscriptions(owner => { observed.push([...subscriptions.getSessionSubscriptions(owner)]); }));

		subscriptions.addSubscription(session, first);
		subscriptions.addSubscription(session, first);
		subscriptions.addSubscription(session, second);
		subscriptions.removeSubscription(session, second);
		subscriptions.removeSubscription(session, second);
		subscriptions.clearSessionSubscriptions(session);

		assert.deepStrictEqual(observed, [[first], [first, second], [first], []]);
	});

	test('subscribes chat-owned Session Changes and refreshes them without watching files', async () => {
		const session = AgentSession.uri('mock', 'chat-session-changes').toString();
		const chat = buildChatUri(session, 'peer');
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repo/worktree');
		environment.stateManager.addChat(session, chat, creationTimeChatStorageResource(session, chat, buildDefaultChatUri(session)));
		const changeset = buildSessionChangesetUri(chat);

		environment.coordinator.onFirstSubscriber(URI.parse(changeset));
		await tick();

		assert.deepStrictEqual({
			subscriptions: [...environment.subscriptions.getSessionSubscriptions(chat)],
			sessionRefreshes: environment.changesets.sessionRefreshes,
			rootLookups: environment.gitService.rootLookupCalls,
		}, {
			subscriptions: [changeset],
			sessionRefreshes: [chat],
			rootLookups: [],
		});
	});

	test('subscribes session-owned Session Changes and refreshes them without watching files', async () => {
		const session = AgentSession.uri('mock', 'session-owned-session-changes').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repo/worktree');
		environment.stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'folder' } });
		const changeset = buildSessionChangesetUri(session);

		environment.coordinator.onFirstSubscriber(URI.parse(changeset));
		await tick();

		assert.deepStrictEqual({
			subscriptions: [...environment.subscriptions.getSessionSubscriptions(session)],
			sessionRefreshes: environment.changesets.sessionRefreshes,
			rootLookups: environment.gitService.rootLookupCalls,
			acquisitions: environment.monitor.acquisitions,
		}, {
			subscriptions: [changeset],
			sessionRefreshes: [session],
			rootLookups: [],
			acquisitions: [],
		});
	});

	test('subscribes, registers, and refreshes the session Working Set without watching files, and drops it on the last unsubscribe', async () => {
		const session = AgentSession.uri('mock', 'session-working-set').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repo/worktree');
		const changeset = buildWorkingSetChangesetUri(session);

		const handled = await environment.coordinator.tryHandleSubscribe(URI.parse(changeset), async () => session);
		environment.coordinator.onFirstSubscriber(URI.parse(changeset));
		await tick();
		const subscribed = {
			handled,
			registered: environment.stateManager.getChangesetState(changeset)?.status,
			subscriptions: [...environment.subscriptions.getSessionSubscriptions(session)],
			workingSetRefreshes: [...environment.changesets.workingSetRefreshes],
			rootLookups: environment.gitService.rootLookupCalls,
			acquisitions: environment.monitor.acquisitions,
		};
		environment.coordinator.onLastSubscriber(URI.parse(changeset));

		assert.deepStrictEqual({ subscribed, afterUnsubscribe: [...environment.subscriptions.getSessionSubscriptions(session)] }, {
			subscribed: {
				handled: true,
				registered: ChangesetStatus.Computing,
				subscriptions: [changeset],
				workingSetRefreshes: [session],
				rootLookups: [],
				acquisitions: [],
			},
			afterUnsubscribe: [],
		});
	});

	test('does not attach root state when watcher acquisition fails', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repo/worktree');

		environment.monitor.failAcquire = true;
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.gitService.waitForRootLookups(1);
		await tick();
		environment.changesets.clearRefreshes();
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(1);
		const operationBaseline = environment.updateOperationsCalls.length;
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

		assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, refreshes: environment.changesets.uncommittedRefreshes, operationRefreshes: environment.updateOperationsCalls.slice(operationBaseline) }, {
			acquisitions: ['file:///repo', 'file:///repo'],
			disposals: ['file:///repo'],
			refreshes: [session],
			operationRefreshes: [session, session, session],
		});
	});

	test('active session sharing a root suspends watcher for other subscribed sessions', async () => {
		const firstSession = AgentSession.uri('mock', 'session-1').toString();
		const secondSession = AgentSession.uri('mock', 'session-2').toString();
		const root = URI.file('/repo');
		const environment = createEnvironment(root);
		createSession(environment.stateManager, firstSession, 'file:///repo/worktree-a');
		createSession(environment.stateManager, secondSession, 'file:///repo/worktree-b');

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(firstSession)));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
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
		await tick();
		environment.monitor.fire(root);
		await tick();

		assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, uncommittedRefreshes: environment.changesets.uncommittedRefreshes }, {
			acquisitions: ['file:///repo', 'file:///repo'],
			disposals: ['file:///repo'],
			// The idle session catches up once the root is watched again, then follows the next root change.
			uncommittedRefreshes: [firstSession, firstSession, secondSession],
		});
	});

	for (const ending of ['completes', 'is disposed'] as const) {
		test(`catches up an idle session sharing a root once another session's turn ${ending}`, async () => {
			const idleSession = AgentSession.uri('mock', 'session-1').toString();
			const activeSession = AgentSession.uri('mock', 'session-2').toString();
			const root = URI.file('/repo');
			const environment = createEnvironment(root);
			createSession(environment.stateManager, idleSession, 'file:///repo/worktree-a');
			createSession(environment.stateManager, activeSession, 'file:///repo/worktree-b');

			environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(idleSession)));
			await environment.monitor.waitForAcquisitions(1);
			environment.coordinator.onSessionTurnActiveChanged(activeSession, true);
			await environment.gitService.waitForRootLookups(2);
			await tick();
			environment.gitStateService.clearRefreshes();

			// E.g. a `git pull` in a terminal while the shared root is suspended.
			environment.monitor.fire(root);
			if (ending === 'is disposed') {
				// Deleting a session disposes it before its turn's end is reported.
				environment.coordinator.onSessionDisposed(activeSession);
			}
			environment.coordinator.onSessionTurnActiveChanged(activeSession, false);
			await tick();

			assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, gitStateRefreshes: environment.gitStateService.refreshed }, {
				acquisitions: ['file:///repo', 'file:///repo'],
				gitStateRefreshes: [idleSession],
			});
		});

		test(`catches up an idle session only once across shared roots when another session's turn ${ending}`, async () => {
			const idleSession = AgentSession.uri('mock', 'session-1').toString();
			const activeSession = AgentSession.uri('mock', 'session-2').toString();
			const primaryRoot = URI.file('/projects/repoA');
			const secondaryRoot = URI.file('/projects/repoB');
			const environment = createEnvironment(undefined, createRoutingGitService(new Map([
				[primaryRoot.toString(), primaryRoot],
				[secondaryRoot.toString(), secondaryRoot],
			])));
			for (const session of [idleSession, activeSession]) {
				createMultiRootSession(environment.stateManager, session, [primaryRoot.toString(), secondaryRoot.toString()]);
			}

			environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(idleSession)));
			await environment.monitor.waitForAcquisitions(2);
			environment.coordinator.onSessionTurnActiveChanged(activeSession, true);
			await environment.monitor.waitForDisposals(2);
			await tick();
			environment.gitStateService.clearRefreshes();
			environment.changesets.clearRefreshes();

			if (ending === 'is disposed') {
				environment.coordinator.onSessionDisposed(activeSession);
			}
			environment.coordinator.onSessionTurnActiveChanged(activeSession, false);
			await environment.monitor.waitForAcquisitions(4);
			await tick();

			assert.deepStrictEqual({
				acquisitions: environment.monitor.acquisitions,
				refreshedWith: environment.gitStateService.refreshedWith,
				uncommittedRefreshes: environment.changesets.uncommittedRefreshes,
			}, {
				acquisitions: [primaryRoot.toString(), secondaryRoot.toString(), primaryRoot.toString(), secondaryRoot.toString()],
				refreshedWith: [{ sessionKey: idleSession, workingDirectory: primaryRoot.toString() }],
				uncommittedRefreshes: [idleSession],
			});
		});
	}

	test('catches up a shared root only after its last active turn ends', async () => {
		const idleSession = AgentSession.uri('mock', 'session-1').toString();
		const firstActiveSession = AgentSession.uri('mock', 'session-2').toString();
		const secondActiveSession = AgentSession.uri('mock', 'session-3').toString();
		const environment = createEnvironment();
		for (const session of [idleSession, firstActiveSession, secondActiveSession]) {
			createSession(environment.stateManager, session, 'file:///repo/worktree');
		}

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(idleSession)));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onSessionTurnActiveChanged(firstActiveSession, true);
		environment.coordinator.onSessionTurnActiveChanged(secondActiveSession, true);
		await environment.gitService.waitForRootLookups(5);
		await tick();
		environment.gitStateService.clearRefreshes();

		environment.coordinator.onSessionTurnActiveChanged(firstActiveSession, false);
		await tick();
		const whileActive = {
			acquisitions: [...environment.monitor.acquisitions],
			refreshed: [...environment.gitStateService.refreshed],
		};
		environment.coordinator.onSessionTurnActiveChanged(secondActiveSession, false);
		await environment.monitor.waitForAcquisitions(2);
		await tick();

		assert.deepStrictEqual({
			whileActive,
			acquisitions: environment.monitor.acquisitions,
			refreshed: environment.gitStateService.refreshed,
		}, {
			whileActive: { acquisitions: ['file:///repo'], refreshed: [] },
			acquisitions: ['file:///repo', 'file:///repo'],
			refreshed: [idleSession],
		});
	});

	test('active subagent maps to parent root and suspends watcher until subagent completes', async () => {
		const parentSession = AgentSession.uri('mock', 'session-1').toString();
		const subagentSession = buildSubagentSessionUri(parentSession, 'tool-1');
		const root = URI.file('/repo');
		const environment = createEnvironment(root);
		createSession(environment.stateManager, parentSession, 'file:///repo/worktree');
		createSession(environment.stateManager, subagentSession, undefined);

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(parentSession)));
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
			// The parent catches up on the subagent's turn, then follows the next root change.
			refreshes: [parentSession, parentSession],
		});
	});

	test('turn ending after unsubscribe or dispose does not reattach watcher', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///repo/worktree');

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(1);
		environment.coordinator.onSessionTurnActiveChanged(session, true);
		await environment.gitService.waitForRootLookups(2);
		await tick();
		environment.coordinator.onLastSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(2);

		assert.deepStrictEqual([...environment.monitor.acquisitions].sort(), [rootA.toString(), rootB.toString()].sort());
	});

	test('a secondary-root external edit refreshes subscribed changesets using the primary working directory', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const primaryRoot = URI.file('/projects/repoA');
		const secondaryRoot = URI.file('/projects/repoB');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[primaryRoot.toString(), primaryRoot],
			[secondaryRoot.toString(), secondaryRoot],
		])));
		createMultiRootSession(environment.stateManager, session, [primaryRoot.toString(), secondaryRoot.toString()]);

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(2);
		environment.changesets.clearRefreshes();
		environment.gitStateService.clearRefreshes();

		// Git state refreshes use the primary root even when the secondary root changed.
		environment.monitor.fire(secondaryRoot);
		await tick();

		assert.deepStrictEqual({
			refreshedWith: environment.gitStateService.refreshedWith,
			branchRefreshes: environment.changesets.branchRefreshes,
			uncommittedRefreshes: environment.changesets.uncommittedRefreshes,
		}, {
			refreshedWith: [{ sessionKey: session, workingDirectory: primaryRoot.toString() }],
			branchRefreshes: [],
			uncommittedRefreshes: [session],
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(2);
		environment.coordinator.onLastSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(1);
		environment.changesets.clearRefreshes();
		environment.gitStateService.clearRefreshes();
		environment.monitor.fire(secondaryRoot);
		await tick();

		assert.deepStrictEqual({
			acquisitions: environment.monitor.acquisitions,
			refreshedWith: environment.gitStateService.refreshedWith,
			uncommittedRefreshes: environment.changesets.uncommittedRefreshes,
		}, {
			acquisitions: [secondaryRoot.toString()],
			refreshedWith: [{ sessionKey: session, workingDirectory: nonGitPrimary }],
			uncommittedRefreshes: [session],
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(2);
		environment.coordinator.onSessionTurnActiveChanged(session, true);
		await environment.gitService.waitForRootLookups(3);
		await tick();
		environment.changesets.clearRefreshes();
		environment.gitStateService.clearRefreshes();

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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(sessionA)));
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(sessionB)));
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
		environment.coordinator.onFirstSubscriber(URI.parse(buildDefaultBranchChangesetUri(session, ['file:///repo/worktree'])));
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

	test('removing a chat clears its pending work and stale folder summary watch', async () => {
		const session = AgentSession.uri('mock', 'session-1').toString();
		const peer = buildChatUri(session, 'peer');
		const defaultRoot = URI.file('/projects/default');
		const peerRoot = URI.file('/projects/peer');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[defaultRoot.toString(), defaultRoot],
			[peerRoot.toString(), peerRoot],
		])));
		createSession(environment.stateManager, session, defaultRoot.toString());
		environment.stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, buildDefaultChatUri(session)), { workingDirectories: [peerRoot.toString()] });
		environment.stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(2);

		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionChatRemoved, chat: peer });
		await environment.monitor.waitForDisposals(1);

		assert.deepStrictEqual({
			removedOwners: environment.changesets.removedOwners,
			disposals: environment.monitor.disposals,
		}, {
			removedOwners: [
				peer,
				buildBranchChangesetOwner(session, [peerRoot.toString()]),
			],
			disposals: [peerRoot.toString()],
		});
	});

	test('removing a chat keeps a branch summary shared with another chat', async () => {
		const session = AgentSession.uri('mock', 'shared-chat-summary').toString();
		const peer = buildChatUri(session, 'peer');
		const root = URI.file('/projects/shared');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([[root.toString(), root]])));
		createSession(environment.stateManager, session, root.toString());
		environment.stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, buildDefaultChatUri(session)), { workingDirectories: [root.toString()] });
		environment.stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(1);

		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionChatRemoved, chat: peer });
		await tick();

		assert.deepStrictEqual({
			removedOwners: environment.changesets.removedOwners,
			disposals: environment.monitor.disposals,
		}, {
			removedOwners: [peer],
			disposals: [],
		});
	});

	test('the branch summary refreshes only the folders of chats in use, not those of archived chats or their subagents', () => {
		const session = AgentSession.uri('mock', 'summary-in-use').toString();
		const defaultChat = buildDefaultChatUri(session);
		const visible = buildChatUri(session, 'visible');
		const archived = buildChatUri(session, 'archived');
		const subagent = buildChatUri(session, 'subagent');
		const environment = createEnvironment();
		createSession(environment.stateManager, session, 'file:///default');
		const storage = creationTimeChatStorageResource(session, visible, defaultChat);
		environment.stateManager.addChat(session, visible, storage, { workingDirectories: ['file:///visible'] });
		environment.stateManager.addChat(session, archived, storage, { workingDirectories: ['file:///archived'] });
		environment.stateManager.addChat(session, subagent, storage, { origin: { kind: ChatOriginKind.Tool, chat: archived, toolCallId: 'tool' }, workingDirectories: ['file:///deleted-worktree'] });
		environment.stateManager.dispatchServerAction(archived, { type: ActionType.ChatIsArchivedChanged, isArchived: true });
		environment.stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });

		environment.coordinator.onFirstSubscriber(URI.parse(session));

		assert.deepStrictEqual([...new Set(environment.changesets.branchRefreshes)].sort(), [
			buildBranchChangesetOwner(session, ['file:///default']),
			buildBranchChangesetOwner(session, ['file:///visible']),
		].sort());
	});

	for (const sideChat of [false, true]) {
		test(`archiving a ${sideChat ? 'side' : 'peer'} chat releases its branch summary and unarchiving it subscribes again`, async () => {
			const session = AgentSession.uri('mock', 'summary-archive-toggle').toString();
			const defaultChat = buildDefaultChatUri(session);
			const peer = buildChatUri(session, 'peer');
			const defaultRoot = URI.file('/projects/default');
			const peerRoot = URI.file('/projects/peer');
			const environment = createEnvironment(undefined, createRoutingGitService(new Map([
				[defaultRoot.toString(), defaultRoot],
				[peerRoot.toString(), peerRoot],
			])));
			createSession(environment.stateManager, session, defaultRoot.toString());
			environment.stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, defaultChat), {
				workingDirectories: [peerRoot.toString()],
				origin: sideChat ? { kind: ChatOriginKind.SideChat, chat: defaultChat, turnId: 'turn' } : undefined,
			});
			environment.stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
			environment.coordinator.onFirstSubscriber(URI.parse(session));
			await environment.monitor.waitForAcquisitions(2);
			const peerOwner = buildBranchChangesetOwner(session, [peerRoot.toString()]);

			environment.stateManager.dispatchServerAction(peer, { type: ActionType.ChatIsArchivedChanged, isArchived: true });
			await environment.monitor.waitForDisposals(1);
			const archived = { removedOwners: [...environment.changesets.removedOwners], disposals: [...environment.monitor.disposals] };
			environment.changesets.clearRefreshes();
			environment.stateManager.dispatchServerAction(peer, { type: ActionType.ChatIsArchivedChanged, isArchived: false });
			await environment.monitor.waitForAcquisitions(3);

			assert.deepStrictEqual({
				archived,
				restoredRefreshes: [...new Set(environment.changesets.branchRefreshes)],
				acquisitions: environment.monitor.acquisitions.filter(root => root === peerRoot.toString()),
			}, {
				archived: { removedOwners: [peerOwner], disposals: [peerRoot.toString()] },
				// Only the chat that came back is refreshed; the default chat's folder is as it was.
				restoredRefreshes: [peerOwner],
				acquisitions: [peerRoot.toString(), peerRoot.toString()],
			});
		});
	}

	test('detaching an archived summary-only side chat folder does not recreate its branch watcher', async () => {
		const session = AgentSession.uri('mock', 'summary-only-archive').toString();
		const defaultChat = buildDefaultChatUri(session);
		const side = buildChatUri(session, 'side');
		const defaultRoot = URI.file('/projects/default');
		const sideRoot = URI.file('/projects/side');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([
			[defaultRoot.toString(), defaultRoot],
			[sideRoot.toString(), sideRoot],
		])));
		createSession(environment.stateManager, session, defaultRoot.toString());
		environment.stateManager.dispatchServerAction(defaultChat, { type: ActionType.ChatWorkingDirectorySet, directory: defaultRoot.toString() });
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: sideRoot.toString() });
		environment.stateManager.registerRestoredChatSummary(session, side, {
			storageResource: creationTimeChatStorageResource(session, side, defaultChat),
			workingDirectories: [sideRoot.toString()],
			origin: { kind: ChatOriginKind.SideChat, chat: defaultChat, turnId: 'turn' },
		});
		environment.stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await environment.monitor.waitForAcquisitions(2);
		const sideOwner = buildBranchChangesetOwner(session, [sideRoot.toString()]);

		environment.stateManager.dispatchServerAction(side, { type: ActionType.ChatIsArchivedChanged, isArchived: true });
		await environment.monitor.waitForDisposals(1);
		environment.changesets.clearRefreshes();
		environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectoryRemoved, directory: sideRoot.toString() });
		await tick();
		const afterDetach = {
			refreshed: [...new Set(environment.changesets.branchRefreshes)],
			acquisitions: [...environment.monitor.acquisitions],
			disposals: [...environment.monitor.disposals],
			sideHydrated: environment.stateManager.getChatState(side) !== undefined,
		};
		environment.stateManager.dispatchServerAction(side, { type: ActionType.ChatIsArchivedChanged, isArchived: false });
		await environment.monitor.waitForAcquisitions(3);

		assert.deepStrictEqual({ afterDetach, removedOwners: environment.changesets.removedOwners }, {
			afterDetach: {
				refreshed: [buildBranchChangesetOwner(session, [defaultRoot.toString()])],
				acquisitions: [defaultRoot.toString(), sideRoot.toString()],
				disposals: [sideRoot.toString()],
				sideHydrated: false,
			},
			removedOwners: [sideOwner],
		});
	});

	test('moving a chat to another session keeps its own changesets', async () => {
		const session = AgentSession.uri('mock', 'move-source').toString();
		const target = AgentSession.uri('mock', 'move-target').toString();
		const peer = buildChatUri(session, 'peer');
		const root = URI.file('/projects/shared');
		const environment = createEnvironment(undefined, createRoutingGitService(new Map([[root.toString(), root]])));
		createSession(environment.stateManager, session, root.toString());
		createSession(environment.stateManager, target, root.toString());
		environment.stateManager.addChat(session, peer, creationTimeChatStorageResource(session, peer, buildDefaultChatUri(session)), { workingDirectories: [root.toString()] });
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await tick();

		environment.stateManager.transferChats(session, target, [peer], undefined);
		await tick();

		assert.deepStrictEqual({ removedOwners: environment.changesets.removedOwners, disposals: environment.monitor.disposals }, { removedOwners: [], disposals: [] });
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
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

	test('suspends a shared secondary root while another session can edit it during a turn', async () => {
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(sessionA)));
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(sessionB)));
		await environment.monitor.waitForAcquisitions(3);
		environment.coordinator.onSessionTurnActiveChanged(sessionA, true);
		await environment.gitService.waitForRootLookups(5);
		await tick();
		environment.changesets.clearRefreshes();

		// A can edit its secondary root during the turn, so the shared watcher remains suspended.
		environment.monitor.fire(sharedRoot);
		await tick();

		assert.deepStrictEqual(environment.changesets.recomputed, []);
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
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(2);
		await tick();

		// The failure clears; a re-attach must retry repoB (not short-circuit on
		// a cached signature) so an edit there then refreshes the subscribed changesets.
		environment.monitor.failAcquireFor.delete(rootB.toString());
		environment.coordinator.onSessionMaterialized(session);
		await environment.monitor.waitForAcquisitions(3);
		environment.changesets.clearRefreshes();
		environment.monitor.fire(rootB);
		await tick();

		assert.deepStrictEqual({
			acquisitions: [...environment.monitor.acquisitions].sort(),
			uncommittedRefreshes: environment.changesets.uncommittedRefreshes,
		}, {
			acquisitions: [rootA.toString(), rootB.toString(), rootB.toString()].sort(),
			uncommittedRefreshes: [session],
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(1);

		// Adding a second root mid-session must start watching it (no lifecycle
		// event required) so external edits there refresh the subscribed changesets.
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(subagentSession)));
		await environment.monitor.waitForAcquisitions(2);
		environment.changesets.clearRefreshes();
		environment.gitStateService.clearRefreshes();

		// An external edit in the parent's SECONDARY repo refreshes the subagent,
		// sourcing git state from the parent's PRIMARY working directory.
		environment.monitor.fire(secondaryRoot);
		await tick();

		assert.deepStrictEqual({
			acquisitions: [...environment.monitor.acquisitions].sort(),
			refreshedWith: environment.gitStateService.refreshedWith,
			uncommittedRefreshes: environment.changesets.uncommittedRefreshes,
		}, {
			acquisitions: [primaryRoot.toString(), secondaryRoot.toString()].sort(),
			refreshedWith: [{ sessionKey: subagentSession, workingDirectory: primaryRoot.toString() }],
			uncommittedRefreshes: [subagentSession],
		});
	});

	/**
	 * A session like one of a heavy user: one default chat and 15 chats in their own worktrees, plus 24 archived chats
	 * whose worktrees are gone, with the branch summary observed.
	 */
	function createManyWorktreeSession(environment: ReturnType<typeof createEnvironment>, session: string): { readonly active: readonly string[]; readonly archived: readonly string[]; readonly owners: readonly string[] } {
		const defaultChat = buildDefaultChatUri(session);
		createSession(environment.stateManager, session, 'file:///wt-0');
		environment.stateManager.dispatchServerAction(defaultChat, { type: ActionType.ChatWorkingDirectorySet, directory: 'file:///wt-0' });
		const active = [defaultChat];
		const owners = [buildBranchChangesetOwner(session, ['file:///wt-0'])];
		for (let i = 1; i < 16; i++) {
			const chat = buildChatUri(session, `active-${i}`);
			environment.stateManager.addChat(session, chat, creationTimeChatStorageResource(session, chat, defaultChat), { workingDirectories: [`file:///wt-${i}`] });
			active.push(chat);
			owners.push(buildBranchChangesetOwner(session, [`file:///wt-${i}`]));
		}
		const archived: string[] = [];
		for (let i = 0; i < 24; i++) {
			const chat = buildChatUri(session, `archived-${i}`);
			environment.stateManager.addChat(session, chat, creationTimeChatStorageResource(session, chat, defaultChat), { workingDirectories: [`file:///removed-${i}`] });
			environment.stateManager.dispatchServerAction(chat, { type: ActionType.ChatIsArchivedChanged, isArchived: true });
			archived.push(chat);
		}
		environment.stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
		return { active, archived, owners };
	}

	test('a Git refresh of one chat recomputes only the Branch changes of its own folder', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'many-worktrees').toString();
		const { active, owners } = createManyWorktreeSession(environment, session);
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		const subscribed = [...environment.changesets.branchRefreshes].sort();
		environment.changesets.clearRefreshes();

		for (const chat of active) {
			await environment.gitStateService.refreshSessionGitState(chat);
		}

		assert.deepStrictEqual({
			// Every summary folder is computed once when the summary is first observed.
			subscribed,
			// One refresh per chat recomputes one folder, not the session's 16.
			refreshes: [...environment.changesets.branchRefreshes].sort(),
			recomputed: environment.changesets.recomputed,
			sessionRefreshes: environment.changesets.sessionRefreshes,
		}, {
			subscribed: [...owners].sort(),
			refreshes: [...owners].sort(),
			recomputed: [],
			sessionRefreshes: [],
		});
	});

	test('a Git refresh of a side chat working in the folder of its parent chat refreshes that folder', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'side-chat-refresh').toString();
		const defaultChat = buildDefaultChatUri(session);
		const side = buildChatUri(session, 'side');
		createSession(environment.stateManager, session, 'file:///shared');
		environment.stateManager.dispatchServerAction(defaultChat, { type: ActionType.ChatWorkingDirectorySet, directory: 'file:///shared' });
		environment.stateManager.addChat(session, side, creationTimeChatStorageResource(session, side, defaultChat), {
			origin: { kind: ChatOriginKind.SideChat, chat: defaultChat, turnId: 'turn' },
		});
		environment.stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		environment.changesets.clearRefreshes();

		await environment.gitStateService.refreshSessionGitState(side);

		assert.deepStrictEqual(environment.changesets.branchRefreshes, [buildBranchChangesetOwner(session, ['file:///shared'])]);
	});

	test('a Git refresh of the session recomputes only the folder of the session', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'many-worktrees-session').toString();
		const { owners } = createManyWorktreeSession(environment, session);
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		environment.changesets.clearRefreshes();

		await environment.gitStateService.refreshSessionGitState(session);

		assert.deepStrictEqual(environment.changesets.branchRefreshes, [owners[0]]);
	});

	test('making the chats of a session available one by one does not refresh the branch summary again for each', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'available-one-by-one').toString();
		const { active, archived, owners } = createManyWorktreeSession(environment, session);
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		environment.changesets.clearRefreshes();
		environment.gitStateService.clearRefreshes();

		for (const chat of [...active, ...archived]) {
			environment.coordinator.onChatAvailable(chat);
		}
		await tick();

		assert.deepStrictEqual({
			// Each folder is refreshed by the first Git refresh of its chat, and by nothing else.
			branchRefreshes: [...environment.changesets.branchRefreshes].sort(),
			// Archived chats are left alone, and unarchiving one refreshes its Git state.
			gitStateRefreshes: environment.gitStateService.refreshed.filter(chat => archived.includes(chat)),
		}, {
			branchRefreshes: [...owners].sort(),
			gitStateRefreshes: [],
		});
	});

	test('unarchiving a chat refreshes its Git state', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'unarchive-refresh').toString();
		const { archived } = createManyWorktreeSession(environment, session);
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		environment.gitStateService.clearRefreshes();

		environment.stateManager.dispatchServerAction(archived[0], { type: ActionType.ChatIsArchivedChanged, isArchived: false });

		assert.deepStrictEqual(environment.gitStateService.refreshed, [archived[0]]);
	});

	test('archiving a chat that works in its own folder re-aggregates the branch summary without recomputing the folders left', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'archive-aggregates').toString();
		const { active } = createManyWorktreeSession(environment, session);
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		environment.changesets.clearRefreshes();

		environment.stateManager.dispatchServerAction(active[1], { type: ActionType.ChatIsArchivedChanged, isArchived: true });

		assert.deepStrictEqual({
			summaryRefreshes: environment.changesets.summaryRefreshes,
			branchRefreshes: environment.changesets.branchRefreshes,
		}, {
			summaryRefreshes: [session],
			branchRefreshes: [],
		});
	});

	test('a chat sharing the folder of an archived chat has its Branch changes refreshed by a Git refresh of the archived chat', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'shared-folder-archived').toString();
		const defaultChat = buildDefaultChatUri(session);
		const archived = buildChatUri(session, 'archived');
		const sibling = buildChatUri(session, 'sibling');
		createSession(environment.stateManager, session, 'file:///wt-0');
		environment.stateManager.dispatchServerAction(defaultChat, { type: ActionType.ChatWorkingDirectorySet, directory: 'file:///wt-0' });
		environment.stateManager.addChat(session, archived, creationTimeChatStorageResource(session, archived, defaultChat), { workingDirectories: ['file:///shared'] });
		environment.stateManager.addChat(session, sibling, creationTimeChatStorageResource(session, sibling, defaultChat), { workingDirectories: ['file:///shared'] });
		environment.stateManager.dispatchServerAction(archived, { type: ActionType.ChatIsArchivedChanged, isArchived: true });
		environment.stateManager.setSessionConfig(session, { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } });
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		environment.changesets.clearRefreshes();

		await environment.gitStateService.refreshSessionGitState(archived);

		assert.deepStrictEqual(environment.changesets.branchRefreshes, [buildBranchChangesetOwner(session, ['file:///shared'])]);
	});

	test('an announced Git refresh updates the operations of its key independently of the diffs it recomputes', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'refresh-operations').toString();
		const { active } = createManyWorktreeSession(environment, session);
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		await tick();
		environment.updateOperationsCalls.length = 0;

		await environment.gitStateService.refreshSessionGitState(active[2]);

		assert.deepStrictEqual(environment.updateOperationsCalls, [active[2]]);
	});

	test('the branch summary of a source that is unchanged is not refreshed by reconciling it again', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'reconcile-unchanged').toString();
		createManyWorktreeSession(environment, session);
		environment.coordinator.onFirstSubscriber(URI.parse(session));
		environment.changesets.clearRefreshes();

		const archivedChat = buildChatUri(session, 'archived-0');
		environment.stateManager.dispatchServerAction(archivedChat, { type: ActionType.ChatIsArchivedChanged, isArchived: true });
		environment.coordinator.ensureSessionSubscription(session);

		assert.deepStrictEqual(environment.changesets.branchRefreshes, []);
	});

	test('the repository watch ignores installed dependencies but not Git metadata', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'watch-excludes').toString();
		createSession(environment.stateManager, session, 'file:///repo');

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(1);

		const excludes = environment.monitor.acquireOptions[0]?.excludes ?? [];
		assert.deepStrictEqual({
			ignored: ['**/node_modules/**'].filter(pattern => excludes.includes(pattern)),
			watchesHead: !excludes.includes('**/.git/**') && !excludes.includes('**/.git/HEAD'),
		}, {
			ignored: ['**/node_modules/**'],
			watchesHead: true,
		});
	});

	test('changes under a watched root that Git ignores refresh nothing, while any other change does', async () => {
		const root = URI.file('/repo');
		const gitService = createGitService(root);
		let checked: readonly string[] = [];
		const ignoredPrefix = '/repo/out/';
		gitService.hasUnignoredPaths = async (_directory, resources) => {
			checked = resources.map(resource => resource.path);
			return resources.some(resource => !resource.path.startsWith(ignoredPrefix));
		};
		const environment = createEnvironment(root, gitService);
		const session = AgentSession.uri('mock', 'watch-ignored').toString();
		createSession(environment.stateManager, session, 'file:///repo');
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(1);
		environment.gitStateService.clearRefreshes();

		environment.monitor.fire(root, [URI.file('/repo/out/a.js'), URI.file('/repo/out/b.js')]);
		await tick();
		const afterIgnored = environment.gitStateService.refreshed.length;
		environment.monitor.fire(root, [URI.file('/repo/out/a.js'), URI.file('/repo/src/a.ts')]);
		await tick();
		const afterMixed = environment.gitStateService.refreshed.length;
		// Too many changes to list, or none that can be told apart.
		environment.monitor.fire(root, undefined);
		await tick();

		assert.deepStrictEqual({ afterIgnored, afterMixed, afterUnknown: environment.gitStateService.refreshed.length, checked }, {
			afterIgnored: 0,
			afterMixed: 1,
			afterUnknown: 2,
			checked: ['/repo/out/a.js', '/repo/src/a.ts'],
		});
	});

	test('a change observed by the file monitor forces the announcement of its Git state refresh', async () => {
		const environment = createEnvironment();
		const session = AgentSession.uri('mock', 'watch-forces').toString();
		createSession(environment.stateManager, session, 'file:///repo');
		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
		await environment.monitor.waitForAcquisitions(1);
		environment.gitStateService.clearRefreshes();

		environment.monitor.fire(URI.file('/repo'));
		await tick();

		assert.deepStrictEqual(environment.gitStateService.forcedRefreshes, [session]);
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

		environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(subagentSession)));
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

	private readonly _states = new Map<string, ISessionGitState>();
	private readonly _onDidRefreshSessionGitState = this._register(new Emitter<string>());
	readonly onDidRefreshSessionGitState = this._onDidRefreshSessionGitState.event;
	private readonly _onDidChangeSessionGitHubState = this._register(new Emitter<string>());
	readonly onDidChangeSessionGitHubState = this._onDidChangeSessionGitHubState.event;

	readonly refreshed: string[] = [];
	readonly forcedRefreshes: string[] = [];
	readonly refreshedWith: Array<{ readonly sessionKey: string; readonly workingDirectory: string | undefined }> = [];

	getSessionGitState(sessionKey: string): ISessionGitState | undefined {
		return this._states.get(sessionKey);
	}

	setGitState(sessionKey: string, gitState: ISessionGitState): void {
		this._states.set(sessionKey, gitState);
	}

	async refreshSessionGitState(sessionKey: string, workingDirectory?: URI, _source?: unknown, options?: IRefreshSessionGitStateOptions): Promise<void> {
		// Mirror the production service: record the refresh (and the working
		// directory it was asked to refresh from) and notify listeners so the
		// coordinator recomputes the subscribed changesets.
		this.refreshed.push(sessionKey);
		if (options?.force) {
			this.forcedRefreshes.push(sessionKey);
		}
		this.refreshedWith.push({ sessionKey, workingDirectory: workingDirectory?.toString() });
		this._onDidRefreshSessionGitState.fire(sessionKey);
	}
	getMaterializedWorktreeMeta(_sessionKey: string, _branchName: string): undefined { return undefined; }
	async setFolderGitState(): Promise<void> { }
	async resolveSessionBaseBranchName(): Promise<string | undefined> { return undefined; }
	async setSessionGitHubState(_sessionKey: string, _state: ISessionGitHubState): Promise<void> { }
	async recordSessionMerge(_sessionKey: string, _commit?: string): Promise<void> { }
	async attachSessionGitHubPullRequest(_sessionKey: string): Promise<void> { }

	clearRefreshes(): void {
		this.refreshed.length = 0;
		this.forcedRefreshes.length = 0;
		this.refreshedWith.length = 0;
	}

	fireGitHubStateChanged(sessionKey: string): void {
		this._onDidChangeSessionGitHubState.fire(sessionKey);
	}
}

class TestFileMonitorService extends Disposable implements IAgentHostFileMonitorService {
	declare readonly _serviceBrand: undefined;

	readonly acquisitions: string[] = [];
	readonly acquireOptions: (IAgentHostFileMonitorOptions | undefined)[] = [];
	readonly disposals: string[] = [];
	failAcquire = false;
	readonly failAcquireFor = new Set<string>();
	private readonly _callbacks = new Map<string, Set<AgentHostFileMonitorCallback>>();
	private readonly _acquisitionWaiters: Array<{ count: number; deferred: DeferredPromise<void> }> = [];
	private readonly _disposalWaiters: Array<{ count: number; deferred: DeferredPromise<void> }> = [];

	acquire(folder: URI, callback: AgentHostFileMonitorCallback, options?: IAgentHostFileMonitorOptions): IDisposable | undefined {
		const root = folder.toString();
		this.acquisitions.push(root);
		this.acquireOptions.push(options);
		if (this.failAcquire || this.failAcquireFor.has(root)) {
			this._releaseAcquisitionWaiters();
			return undefined;
		}
		let callbacks = this._callbacks.get(root);
		if (!callbacks) {
			callbacks = new Set<AgentHostFileMonitorCallback>();
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

	fire(root: URI, changedResources?: readonly URI[]): void {
		for (const callback of this._callbacks.get(root.toString()) ?? []) {
			callback(changedResources);
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
	readonly catalogRefreshes: string[] = [];
	readonly uncommittedRefreshes: string[] = [];
	readonly turnRefreshes: string[] = [];
	readonly sessionRefreshes: string[] = [];
	readonly workingSetRefreshes: string[] = [];
	readonly chatSummaryRefreshes: string[] = [];
	readonly workingDirectoryAvailable: string[] = [];
	readonly recomputed: string[] = [];
	readonly removedOwners: string[] = [];
	readonly summaryRefreshes: string[] = [];

	constructor(
		private readonly _subscriptions: IAgentHostChangesetSubscriptionService,
		private readonly _stateManager: AgentHostStateManager,
	) { }

	registerStaticChangesets(_session: string): void { }
	restoreStaticChangeset(_session: string, _kind: StaticChangesetKind, _diffs: readonly ISessionFileDiff[]): void { }
	persistChangesSummary(_sessionUri: string, _summary: ChangesSummary): void { }
	isStaticChangesetComputeActive(_changesetUri: string): boolean { return false; }
	refreshChangesetCatalog(session: string): void {
		this.catalogRefreshes.push(session);
	}
	refreshBranchChangeset(session: string): void {
		this.branchRefreshes.push(session);
	}
	refreshSessionChangeset(session: string, strategy?: ChangesetDiffStrategy): void {
		assert.strictEqual(strategy ?? 'fileEditTracker', 'fileEditTracker');
		this.sessionRefreshes.push(session);
	}
	refreshWorkingSetChangeset(owner: string): void {
		this.workingSetRefreshes.push(owner);
	}
	onWorkingDirectoryAvailable(session: string): void {
		this.workingDirectoryAvailable.push(session);
	}
	recomputeSubscribedChangesets(session: string): void {
		this.recomputed.push(session);
		const workingDirectories = getEffectiveWorkingDirectories(this._stateManager, buildDefaultChatUri(session)) ?? [];
		const branchUri = buildBranchChangesetUri(buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId(workingDirectories)));
		for (const changeset of resolveChangesetSubscriptions(session, this._subscriptions.getSessionSubscriptions(session), this._stateManager.getSessionState(session)?.config?.values, branchUri)) {
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
			}
		}
	}
	async computeUncommittedChangeset(session: string): Promise<string> {
		if (this._subscriptions.getSessionSubscriptions(session).has(URI.parse(buildUncommittedChangesetUri(session)).toString())) {
			this.uncommittedRefreshes.push(session);
		}
		return `${session}/changeset/uncommitted`;
	}
	async computeTurnChangeset(session: string, turnId: string, strategy?: ChangesetDiffStrategy): Promise<string> {
		assert.strictEqual(strategy, 'fileEditTracker');
		const resource = buildTurnChangesetUri(session, turnId);
		this.turnRefreshes.push(resource);
		return resource;
	}
	async computeCompareTurnsChangeset(session: string, originalTurnId: string, modifiedTurnId: string): Promise<string> { return `${session}/changeset/compare/${originalTurnId}/${modifiedTurnId}`; }
	onToolCallEditsApplied(_session: string, _turnId: string): void { }
	onTurnComplete(_session: string, _turnId: string | undefined): void { }
	onSessionTruncated(_session: string): void { }
	openTrackedTurnDatabase(): undefined { return undefined; }
	openTrackedSessionDatabases() { return { sources: [], otherChatDatabases: [], workingDirectories: undefined, folderScope: undefined, dispose: () => { } }; }
	onFileEditsDiscarded(): void { }
	onFileEditsAccepted(): void { }
	ensureChatChangesSummary(_chat: string): void { }
	refreshChatChangesSummary(chat: string): void {
		this.chatSummaryRefreshes.push(chat);
	}
	onChangesetOwnerRemoved(owner: string): void {
		this.removedOwners.push(owner);
	}
	refreshBranchSummary(session: string): void {
		this.summaryRefreshes.push(session);
	}

	clearRefreshes(): void {
		this.branchRefreshes.length = 0;
		this.uncommittedRefreshes.length = 0;
		this.turnRefreshes.length = 0;
		this.sessionRefreshes.length = 0;
		this.workingSetRefreshes.length = 0;
		this.chatSummaryRefreshes.length = 0;
		this.recomputed.length = 0;
		this.summaryRefreshes.length = 0;
	}

	getListMetadataKeys(_sessionStr: string): Record<string, true> | undefined { return undefined; }
	computeListEntryChanges(_sessionUri: string, _metadata: Record<string, string | undefined>): ChangesSummary | undefined { return undefined; }
}

function tick(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}
