/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_HOST_MERGE_CHANGESET_OPERATION_ID, type IChangesetOperationContribution, type IChangesetOperationContext, type IChangesetOperationHandler, type IChangesetOperationRegistry } from '../../common/agentHostChangesetOperationService.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { buildBranchChangesetUri, buildCompareTurnsChangesetUri, buildFolderChangesetOwnerUri, buildSessionChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { PREPARE_PULL_REQUEST_OPERATION_ID } from '../../common/meta/agentPullRequestOperationMeta.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../../common/state/protocol/channels-changeset/commands.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { JsonRpcErrorCodes } from '../../common/state/sessionProtocol.js';
import { ChangesetOperationScope, ChangesetOperationStatus, ISessionGitHubState, ISessionGitState, MessageKind, SessionStatus, buildChatUri, buildDefaultChatUri, type ChangesetOperation, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentHostChangesetOperationService } from '../../node/agentHostChangesetOperationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChangesetSubscriptionService } from '../../node/agentHostChangesetSubscriptionService.js';
import { URI } from '../../../../base/common/uri.js';

const testOperationId = 'test-operation';

class TestHandler implements IChangesetOperationHandler {
	calls = 0;
	private _resolve: ((value: InvokeChangesetOperationResult) => void) | undefined;
	private _reject: ((reason?: unknown) => void) | undefined;
	readonly pending = new Promise<InvokeChangesetOperationResult>((resolve, reject) => {
		this._resolve = resolve;
		this._reject = reject;
	});

	invoke(_params: InvokeChangesetOperationParams, _token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		this.calls++;
		return this.pending;
	}

	complete(result: InvokeChangesetOperationResult): void {
		this._resolve?.(result);
	}

	fail(error: unknown): void {
		this._reject?.(error);
	}
}

class TestContribution implements IChangesetOperationContribution {
	constructor(private readonly handler: IChangesetOperationHandler) { }

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		const store = new DisposableStore();
		store.add(registry.registerChangesetOperationHandler(testOperationId, this.handler));
		return store;
	}

	getOperations(_context: IChangesetOperationContext): readonly ChangesetOperation[] | undefined {
		return undefined;
	}

	dispose(): void { }
}

class FailingRegistrationContribution implements IChangesetOperationContribution {
	disposed = false;

	constructor(private readonly handler: IChangesetOperationHandler) { }

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		registry.registerChangesetOperationHandler(testOperationId, this.handler);
		throw new Error('Registration failed');
	}

	getOperations(): undefined {
		return undefined;
	}

	dispose(): void {
		this.disposed = true;
	}
}

class TestGitStateService implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;

	readonly onDidRefreshSessionGitState = Event.None;
	readonly onDidChangeSessionGitHubState = Event.None;
	readonly refreshes: string[] = [];

	constructor(private readonly _states = new Map<string, ISessionGitState>()) { }

	getSessionGitState(sessionKey: string): ISessionGitState | undefined {
		return this._states.get(sessionKey);
	}

	async refreshSessionGitState(sessionKey: string, _workingDirectory?: URI): Promise<void> {
		this.refreshes.push(sessionKey);
	}
	getMaterializedWorktreeMeta(_sessionKey: string, _branchName: string): undefined { return undefined; }
	async resolveSessionBaseBranchName(): Promise<string | undefined> { return undefined; }

	async getSessionGitHubState(_sessionKey: string): Promise<ISessionGitHubState | undefined> {
		return undefined;
	}

	async setSessionGitHubState(_sessionKey: string, _state: ISessionGitHubState): Promise<void> { }

	async recordSessionMerge(_sessionKey: string, _commit?: string): Promise<void> { }

	async attachSessionGitHubPullRequest(_sessionKey: string): Promise<void> { }
}

/**
 * Minimal typed {@link IAgentConfigurationService} whose only meaningful
 * behavior is returning a fixed effective working-directory set, so tests can
 * drive the multi-folder gate in {@link AgentHostChangesetOperationService}.
 */
class TestConfigurationService implements IAgentConfigurationService {
	declare readonly _serviceBrand: undefined;

	readonly onDidRootConfigChange = Event.None;
	readonly onDidSessionConfigChange = Event.None;
	readonly onDidChangeWorkingDirectoryPending = Event.None;

	constructor(private _workingDirectories: string[] | undefined) { }

	setWorkingDirectories(workingDirectories: string[] | undefined): void {
		this._workingDirectories = workingDirectories;
	}

	getEffectiveWorkingDirectories(_session: string): string[] | undefined {
		return this._workingDirectories;
	}

	getEffectiveWorkingDirectory(_session: string): string | undefined {
		return this._workingDirectories?.[0];
	}

	getEffectiveValue(): undefined {
		return undefined;
	}

	isWorkingDirectoryPending(): boolean {
		return false;
	}

	async resolveWorkingDirectoryForResume(_session: string, workingDirectory: URI): Promise<URI> {
		return workingDirectory;
	}

	updateSessionConfig(): void { }
	getSessionSandboxPolicy(): undefined { return undefined; }
	setSessionSandboxPolicy(): void { }

	getSessionConfigValues(): Record<string, unknown> | undefined {
		return undefined;
	}

	getRootValue(): undefined {
		return undefined;
	}

	updateRootConfig(): void { }

	persistRootConfig(): void { }

	async whenIdle(): Promise<void> { }
}

/** Contribution that advertises a fixed set of operations for every changeset. */
class OperationsContribution implements IChangesetOperationContribution {
	constructor(private readonly operations: readonly ChangesetOperation[]) { }

	registerHandlers(_registry: IChangesetOperationRegistry): IDisposable {
		return Disposable.None;
	}

	getOperations(_context: IChangesetOperationContext): readonly ChangesetOperation[] | undefined {
		return this.operations;
	}

	dispose(): void { }
}

class RecordingOperationsContribution extends OperationsContribution {
	readonly contexts: IChangesetOperationContext[] = [];

	override getOperations(context: IChangesetOperationContext): readonly ChangesetOperation[] | undefined {
		this.contexts.push(context);
		return super.getOperations(context);
	}
}

class RegistryCaptureContribution implements IChangesetOperationContribution {
	registry: IChangesetOperationRegistry | undefined;

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		this.registry = registry;
		return Disposable.None;
	}

	getOperations(): undefined {
		return undefined;
	}

	dispose(): void { }
}

const sampleGitState: ISessionGitState = { branchName: 'feature' };
const sampleOperations: readonly ChangesetOperation[] = [
	{ id: testOperationId, label: 'Commit', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
];

suite('AgentHostChangesetOperationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(stateManager: AgentHostStateManager, configurationService: IAgentConfigurationService = new TestConfigurationService(undefined), gitStateService: IAgentHostGitStateService = new TestGitStateService()): AgentHostChangesetOperationService {
		return disposables.add(new AgentHostChangesetOperationService(
			stateManager,
			gitStateService,
			disposables.add(new AgentHostChangesetSubscriptionService()),
			configurationService,
		));
	}

	test('disposes partial handler registrations when contribution registration fails', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const service = createService(stateManager);
		const handler = new TestHandler();
		const failingContribution = new FailingRegistrationContribution(handler);

		assert.throws(() => service.registerContribution(failingContribution), /Registration failed/);
		assert.strictEqual(failingContribution.disposed, true);

		disposables.add(service.registerContribution(new TestContribution(handler)));
	});

	test('refreshes chat-owned and aggregate Git state concurrently after a chat operation', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const blockers = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		const gitStateService = new class extends TestGitStateService {
			override async refreshSessionGitState(sessionKey: string): Promise<void> {
				const index = this.refreshes.length;
				this.refreshes.push(sessionKey);
				await blockers[index].p;
			}
		}();
		const service = createService(stateManager, undefined, gitStateService);
		const contribution = new RegistryCaptureContribution();
		disposables.add(service.registerContribution(contribution));
		const sessionKey = 'agent:/session';
		const chatKey = buildChatUri(sessionKey, 'peer');

		const refresh = contribution.registry?.refreshSessionGitState(chatKey);
		await Promise.resolve();
		const refreshesBeforeRelease = [...gitStateService.refreshes];
		blockers.forEach(blocker => blocker.complete());
		await refresh;

		assert.deepStrictEqual({
			refreshesBeforeRelease,
			refreshes: gitStateService.refreshes,
		}, {
			refreshesBeforeRelease: [chatKey, sessionKey],
			refreshes: [chatKey, sessionKey],
		});
	});

	test('multi-folder session advertises no operations for a turn changeset', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const service = createService(stateManager, new TestConfigurationService(['file:///a', 'file:///b']));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const operations = service.getOperations(sessionKey, buildTurnChangesetUri(sessionKey, 'turn-1'), sampleGitState);

		assert.deepStrictEqual(operations, []);
	});

	test('preserves contribution order when pull-request and merge operations coexist', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const service = createService(stateManager);
		disposables.add(service.registerContribution(new OperationsContribution([
			{ id: 'create-pr', label: 'Create PR', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
			{ id: 'create-draft-pr', label: 'Create Draft PR', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
		])));
		disposables.add(service.registerContribution(new OperationsContribution([
			{ id: 'merge', label: 'Merge Changes', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
		])));

		const operations = service.getOperations(sessionKey, buildBranchChangesetUri(sessionKey), sampleGitState);

		assert.deepStrictEqual(operations.map(operation => operation.id), ['create-pr', 'create-draft-pr', 'merge']);
	});

	test('multi-folder session advertises no operations for a compare-turns changeset', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const service = createService(stateManager, new TestConfigurationService(['file:///a', 'file:///b']));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const operations = service.getOperations(sessionKey, buildCompareTurnsChangesetUri(sessionKey, 'turn-1', 'turn-2'), sampleGitState);

		assert.deepStrictEqual(operations, []);
	});

	test('multi-folder session dispatches empty operations for a turn changeset via updateOperations', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildTurnChangesetUri(sessionKey, 'turn-1');
		stateManager.registerChangeset(changesetUri);
		const service = createService(stateManager, new TestConfigurationService(['file:///a', 'file:///b']));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const dispatched: (readonly ChangesetOperation[] | undefined)[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
				dispatched.push(envelope.action.operations);
			}
		}));

		service.updateOperations(sessionKey, changesetUri, sampleGitState);

		assert.deepStrictEqual(dispatched, [[]]);
	});

	test('multi-folder session dispatches empty operations for a compare-turns changeset via updateOperations', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildCompareTurnsChangesetUri(sessionKey, 'turn-1', 'turn-2');
		stateManager.registerChangeset(changesetUri);
		const service = createService(stateManager, new TestConfigurationService(['file:///a', 'file:///b']));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const dispatched: (readonly ChangesetOperation[] | undefined)[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
				dispatched.push(envelope.action.operations);
			}
		}));

		service.updateOperations(sessionKey, changesetUri, sampleGitState);

		assert.deepStrictEqual(dispatched, [[]]);
	});

	test('single-folder session advertises turn operations via updateOperations', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildTurnChangesetUri(sessionKey, 'turn-1');
		stateManager.registerChangeset(changesetUri);
		const service = createService(stateManager, new TestConfigurationService(['file:///a']));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const dispatched: (readonly ChangesetOperation[] | undefined)[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
				dispatched.push(envelope.action.operations);
			}
		}));

		service.updateOperations(sessionKey, changesetUri, sampleGitState);

		// Single-root advertises the contributed operations; combined with the
		// multi-folder-empties tests above, this covers the enter/leave transition.
		assert.deepStrictEqual(dispatched, [sampleOperations]);
	});

	test('chat-owned changesets use chat Git state and exclude session-owned operations', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const chatKey = buildChatUri(sessionKey, 'peer');
		stateManager.createSession({
			resource: sessionKey, provider: 'agent', title: 'Test', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
		});
		stateManager.addChat(sessionKey, chatKey);
		const changesetUri = buildUncommittedChangesetUri(chatKey);
		stateManager.registerChangeset(changesetUri);
		const chatGitState: ISessionGitState = { branchName: 'chat-feature' };
		const gitStates = new Map<string, ISessionGitState>([
			[sessionKey, { branchName: 'session-feature' }],
		]);
		const service = createService(
			stateManager,
			new TestConfigurationService(['file:///chat']),
			new TestGitStateService(gitStates),
		);
		const contribution = new RecordingOperationsContribution([
			...sampleOperations,
			{ id: PREPARE_PULL_REQUEST_OPERATION_ID, label: 'Create Pull Request', group: 'pull-request', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
			{ id: AGENT_HOST_MERGE_CHANGESET_OPERATION_ID, label: 'Merge', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
		]);
		disposables.add(service.registerContribution(contribution));

		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [...sampleOperations],
		});
		const operationsWithoutChatGit = service.getOperations(chatKey, changesetUri);
		service.updateOperations(chatKey, changesetUri);
		const publishedWithoutChatGit = stateManager.getChangesetState(changesetUri)?.operations;

		gitStates.set(chatKey, chatGitState);
		service.updateOperations(chatKey, changesetUri);

		assert.deepStrictEqual({
			operationsWithoutChatGit,
			publishedWithoutChatGit,
			gitState: contribution.contexts[0]?.gitState,
			operationIds: stateManager.getChangesetState(changesetUri)?.operations?.map(operation => operation.id),
		}, {
			operationsWithoutChatGit: [],
			publishedWithoutChatGit: [],
			gitState: chatGitState,
			operationIds: [testOperationId],
		});
	});

	for (const isolation of ['folder', 'worktree', undefined] as const) {
		test(`implicit ${isolation ?? 'unresolved'} summary interest refreshes selected changeset operations once`, () => {
			const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const sessionKey = 'agent:/session';
			stateManager.createSession({
				resource: sessionKey, provider: 'agent', title: 'Test', status: SessionStatus.Idle,
				createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
			});
			stateManager.setSessionConfig(sessionKey, {
				schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: isolation },
			});
			const changesetUri = isolation === 'worktree' ? buildBranchChangesetUri(sessionKey) : buildSessionChangesetUri(sessionKey);
			stateManager.registerChangeset(changesetUri);
			const subscriptions = disposables.add(new AgentHostChangesetSubscriptionService());
			subscriptions.addSubscription(sessionKey, sessionKey);
			subscriptions.addSubscription(sessionKey, changesetUri);
			const service = disposables.add(new AgentHostChangesetOperationService(stateManager, new TestGitStateService(), subscriptions, new TestConfigurationService(['file:///a'])));
			disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
			const channels: string[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(envelope => {
				if (envelope.action.type === ActionType.ChangesetOperationsChanged) {
					channels.push(envelope.channel);
				}
			}));

			service.updateOperations(sessionKey, undefined, sampleGitState);

			assert.deepStrictEqual({ channels, operations: stateManager.getChangesetState(changesetUri)?.operations }, {
				channels: [changesetUri], operations: sampleOperations,
			});
		});
	}

	test('a session refresh updates operations for a subscribed folder owner', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const defaultChat = buildDefaultChatUri(sessionKey);
		const workingDirectories = ['file:///workspace'];
		stateManager.createSession({
			resource: sessionKey, provider: 'agent', title: 'Test', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
			workingDirectories,
		});
		stateManager.addChat(sessionKey, defaultChat);
		const folderOwner = buildFolderChangesetOwnerUri(sessionKey, getWorkingDirectoryScopeId(workingDirectories));
		const changesetUri = buildBranchChangesetUri(folderOwner);
		stateManager.registerChangeset(changesetUri);
		const subscriptions = disposables.add(new AgentHostChangesetSubscriptionService());
		subscriptions.addSubscription(folderOwner, changesetUri);
		const service = disposables.add(new AgentHostChangesetOperationService(stateManager, new TestGitStateService(), subscriptions, new TestConfigurationService(workingDirectories)));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		service.updateOperations(sessionKey, undefined, sampleGitState);

		assert.deepStrictEqual(stateManager.getChangesetState(changesetUri)?.operations, sampleOperations);
	});

	test('a contribution refresh for a session updates subscribed folder-owner operations', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const defaultChat = buildDefaultChatUri(sessionKey);
		const workingDirectories = ['file:///workspace'];
		stateManager.createSession({
			resource: sessionKey, provider: 'agent', title: 'Test', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
			workingDirectories,
		});
		stateManager.addChat(sessionKey, defaultChat);
		const folderOwner = buildFolderChangesetOwnerUri(sessionKey, getWorkingDirectoryScopeId(workingDirectories));
		const changesetUri = buildBranchChangesetUri(folderOwner);
		stateManager.registerChangeset(changesetUri);
		const subscriptions = disposables.add(new AgentHostChangesetSubscriptionService());
		subscriptions.addSubscription(folderOwner, changesetUri);
		const gitStateService = new TestGitStateService(new Map([[defaultChat, sampleGitState]]));
		const service = disposables.add(new AgentHostChangesetOperationService(stateManager, gitStateService, subscriptions, new TestConfigurationService(workingDirectories)));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
		const registryCapture = new RegistryCaptureContribution();
		disposables.add(service.registerContribution(registryCapture));

		registryCapture.registry!.onDidChangeOperations(sessionKey);

		assert.deepStrictEqual(stateManager.getChangesetState(changesetUri)?.operations, sampleOperations);
	});

	test('a contribution refresh republishes Session Changes workflow operations', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		stateManager.createSession({
			resource: sessionKey, provider: 'agent', title: 'Test', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
			workingDirectories: ['file:///workspace'],
		});
		const changesetUri = buildSessionChangesetUri(sessionKey);
		stateManager.registerChangeset(changesetUri);
		const subscriptions = disposables.add(new AgentHostChangesetSubscriptionService());
		subscriptions.addSubscription(sessionKey, changesetUri);
		const gitStateService = new TestGitStateService(new Map([[sessionKey, sampleGitState]]));
		const service = disposables.add(new AgentHostChangesetOperationService(stateManager, gitStateService, subscriptions, new TestConfigurationService(['file:///workspace'])));
		const operations: readonly ChangesetOperation[] = [
			{ id: PREPARE_PULL_REQUEST_OPERATION_ID, label: 'Create Pull Request', group: 'pull-request', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
			{ id: AGENT_HOST_MERGE_CHANGESET_OPERATION_ID, label: 'Merge Changes', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
		];
		disposables.add(service.registerContribution(new OperationsContribution(operations)));
		const registryCapture = new RegistryCaptureContribution();
		disposables.add(service.registerContribution(registryCapture));

		registryCapture.registry!.onDidChangeOperations(sessionKey);

		assert.deepStrictEqual(stateManager.getChangesetState(changesetUri)?.operations, operations);
	});

	test('multi-folder session clears turn operations even when git state is absent', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildTurnChangesetUri(sessionKey, 'turn-1');
		stateManager.registerChangeset(changesetUri);
		const service = createService(stateManager, new TestConfigurationService(['file:///a', 'file:///b']));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const dispatched: (readonly ChangesetOperation[] | undefined)[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
				dispatched.push(envelope.action.operations);
			}
		}));

		// No gitState argument and no git meta on the session — the root-transition
		// recompute path. Before Issue 16 the absent-git-state early return skipped
		// the suppressed turn changeset, leaving its stale operations advertised.
		service.updateOperations(sessionKey, changesetUri);

		assert.deepStrictEqual(dispatched, [[]]);
	});

	test('single-folder session with absent git state does not dispatch (no premature clear)', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildTurnChangesetUri(sessionKey, 'turn-1');
		stateManager.registerChangeset(changesetUri);
		const service = createService(stateManager, new TestConfigurationService(['file:///a']));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const dispatched: (readonly ChangesetOperation[] | undefined)[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
				dispatched.push(envelope.action.operations);
			}
		}));

		// No cached operations need clearing while initial Git state is unresolved.
		service.updateOperations(sessionKey, changesetUri);

		assert.deepStrictEqual(dispatched, []);
	});

	test('multi-folder session with absent git state defers a non-suppressed changeset (no over-clear)', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildUncommittedChangesetUri(sessionKey);
		stateManager.registerChangeset(changesetUri);
		const service = createService(stateManager, new TestConfigurationService(['file:///a', 'file:///b']));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const dispatched: (readonly ChangesetOperation[] | undefined)[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
				dispatched.push(envelope.action.operations);
			}
		}));

		// Uncommitted changes are not suppressed and have no cached operations to clear.
		service.updateOperations(sessionKey, changesetUri);

		assert.deepStrictEqual(dispatched, []);
	});

	test('turn changeset re-dispatches empty on entering multi-root and restores on returning to single-root', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildTurnChangesetUri(sessionKey, 'turn-1');
		stateManager.registerChangeset(changesetUri);
		const configurationService = new TestConfigurationService(['file:///a']);
		const service = createService(stateManager, configurationService);
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const dispatched: (readonly ChangesetOperation[] | undefined)[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
				dispatched.push(envelope.action.operations);
			}
		}));

		// Single-root: advertises the contributed operations.
		service.updateOperations(sessionKey, changesetUri, sampleGitState);
		// A root is added at runtime -> multi-root: re-dispatches an empty list.
		configurationService.setWorkingDirectories(['file:///a', 'file:///b']);
		service.updateOperations(sessionKey, changesetUri, sampleGitState);
		// The extra root is removed -> single-root again: restores the operations.
		configurationService.setWorkingDirectories(['file:///a']);
		service.updateOperations(sessionKey, changesetUri, sampleGitState);

		assert.deepStrictEqual(dispatched, [sampleOperations, [], sampleOperations]);
	});

	test('single-folder session keeps operations for turn and compare-turns changesets', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const service = createService(stateManager, new TestConfigurationService(['file:///a']));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const turnOperations = service.getOperations(sessionKey, buildTurnChangesetUri(sessionKey, 'turn-1'), sampleGitState);
		const compareOperations = service.getOperations(sessionKey, buildCompareTurnsChangesetUri(sessionKey, 'turn-1', 'turn-2'), sampleGitState);

		assert.deepStrictEqual(turnOperations, sampleOperations);
		assert.deepStrictEqual(compareOperations, sampleOperations);
	});

	test('multi-folder session keeps operations for branch and uncommitted changesets', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const service = createService(stateManager, new TestConfigurationService(['file:///a', 'file:///b']));
		disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));

		const branchOperations = service.getOperations(sessionKey, buildBranchChangesetUri(sessionKey), sampleGitState);
		const uncommittedOperations = service.getOperations(sessionKey, buildUncommittedChangesetUri(sessionKey), sampleGitState);

		assert.deepStrictEqual(branchOperations, sampleOperations);
		assert.deepStrictEqual(uncommittedOperations, sampleOperations);
	});

	test('offers pull request workflows on every folder scope Branch and keeps merge with the default chat', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const defaultFolder = 'file:///default';
		const peerFolder = 'file:///peer';
		stateManager.createSession({
			resource: sessionKey,
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [defaultFolder],
		});
		const sameScopePeer = buildChatUri(sessionKey, 'same-scope-peer');
		const otherScopePeer = buildChatUri(sessionKey, 'other-scope-peer');
		stateManager.addChat(sessionKey, sameScopePeer, { workingDirectories: [defaultFolder] });
		stateManager.addChat(sessionKey, otherScopePeer, { workingDirectories: [peerFolder] });
		const operations: readonly ChangesetOperation[] = [
			{ id: testOperationId, label: 'Commit', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
			{ id: PREPARE_PULL_REQUEST_OPERATION_ID, label: 'Create Pull Request', group: 'pull-request', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
			{ id: AGENT_HOST_MERGE_CHANGESET_OPERATION_ID, label: 'Merge Changes', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
		];
		const service = createService(stateManager);
		disposables.add(service.registerContribution(new OperationsContribution(operations)));
		const defaultBranch = buildBranchChangesetUri(buildFolderChangesetOwnerUri(sessionKey, getWorkingDirectoryScopeId([defaultFolder])));
		const defaultUncommitted = buildUncommittedChangesetUri(buildFolderChangesetOwnerUri(sessionKey, getWorkingDirectoryScopeId([defaultFolder])));
		const sessionChanges = buildSessionChangesetUri(sessionKey);
		const defaultTurn = buildTurnChangesetUri(buildDefaultChatUri(sessionKey), 'turn-1');
		const defaultCompare = buildCompareTurnsChangesetUri(buildDefaultChatUri(sessionKey), 'turn-1', 'turn-2');
		const otherScopeBranch = buildBranchChangesetUri(buildFolderChangesetOwnerUri(sessionKey, getWorkingDirectoryScopeId([peerFolder])));

		assert.deepStrictEqual({
			defaultBranch: service.getOperations(sessionKey, defaultBranch, sampleGitState).map(operation => operation.id),
			defaultUncommitted: service.getOperations(sessionKey, defaultUncommitted, sampleGitState).map(operation => operation.id),
			sessionChanges: service.getOperations(sessionKey, sessionChanges, sampleGitState).map(operation => operation.id),
			defaultTurn: service.getOperations(sessionKey, defaultTurn, sampleGitState).map(operation => operation.id),
			defaultCompare: service.getOperations(sessionKey, defaultCompare, sampleGitState).map(operation => operation.id),
			otherScopeBranch: service.getOperations(sessionKey, otherScopeBranch, sampleGitState).map(operation => operation.id),
		}, {
			defaultBranch: [testOperationId, PREPARE_PULL_REQUEST_OPERATION_ID, AGENT_HOST_MERGE_CHANGESET_OPERATION_ID],
			defaultUncommitted: [testOperationId],
			sessionChanges: [testOperationId, PREPARE_PULL_REQUEST_OPERATION_ID, AGENT_HOST_MERGE_CHANGESET_OPERATION_ID],
			defaultTurn: [testOperationId],
			defaultCompare: [testOperationId],
			otherScopeBranch: [testOperationId, PREPARE_PULL_REQUEST_OPERATION_ID],
		});
	});

	test('joins duplicate in-flight invocations for the same changeset operation', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildUncommittedChangesetUri(sessionKey);
		stateManager.registerChangeset(changesetUri);
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [{ id: testOperationId, label: 'Commit', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }],
		});

		const service = createService(stateManager);
		const handler = new TestHandler();
		disposables.add(service.registerContribution(new TestContribution(handler)));

		const params = { channel: changesetUri, operationId: testOperationId };
		const first = service.invokeChangesetOperation(params);
		assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Running);
		const second = service.invokeChangesetOperation(params);
		handler.complete({ message: { markdown: 'Committed' } });

		const [firstResult, secondResult] = await Promise.all([first, second]);

		assert.deepStrictEqual({ calls: handler.calls, firstResult, secondResult }, {
			calls: 1,
			firstResult: { message: { markdown: 'Committed' } },
			secondResult: { message: { markdown: 'Committed' } },
		});
	});

	test('serializes in-flight invocations with different metadata', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildUncommittedChangesetUri(sessionKey);
		stateManager.registerChangeset(changesetUri);
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [{ id: testOperationId, label: 'Checkout', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }],
		});

		const pending: DeferredPromise<InvokeChangesetOperationResult>[] = [];
		const metadata: (Record<string, unknown> | undefined)[] = [];
		const handler: IChangesetOperationHandler = {
			invoke: params => {
				metadata.push(params._meta);
				const result = new DeferredPromise<InvokeChangesetOperationResult>();
				pending.push(result);
				return result.p;
			},
		};
		const service = createService(stateManager);
		disposables.add(service.registerContribution(new TestContribution(handler)));

		const first = service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId, _meta: { treeish: 'main' } });
		const second = service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId, _meta: { treeish: 'featureA' } });
		const metadataWhileFirstRunning = [...metadata];
		pending[0].complete({});
		await first;
		const metadataAfterFirstCompleted = [...metadata];
		pending[1].complete({});
		await second;

		assert.deepStrictEqual({
			metadataWhileFirstRunning,
			metadataAfterFirstCompleted,
			metadata,
		}, {
			metadataWhileFirstRunning: [{ treeish: 'main' }],
			metadataAfterFirstCompleted: [{ treeish: 'main' }, { treeish: 'featureA' }],
			metadata: [{ treeish: 'main' }, { treeish: 'featureA' }],
		});
	});

	test('publishes running and idle state around a successful changeset operation', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildUncommittedChangesetUri(sessionKey);
		stateManager.registerChangeset(changesetUri);
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [{ id: testOperationId, label: 'Commit', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }],
		});

		const service = createService(stateManager);
		const handler = new TestHandler();
		disposables.add(service.registerContribution(new TestContribution(handler)));

		const invocation = service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId });
		assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Running);
		handler.complete({ message: { markdown: 'Committed' } });
		await invocation;
		assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Idle);
	});

	test('rejects invocation of a disabled changeset operation without calling the handler', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildUncommittedChangesetUri(sessionKey);
		stateManager.registerChangeset(changesetUri);
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [{ id: testOperationId, label: 'Commit', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Disabled }],
		});

		const service = createService(stateManager);
		const handler = new TestHandler();
		disposables.add(service.registerContribution(new TestContribution(handler)));

		const error = await service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId }).then(undefined, error => error);

		assert.match(error.message, /is disabled/);
		assert.strictEqual(handler.calls, 0);
		assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Disabled);
	});

	test('rejects invocation while a turn is active even if the advertised status is idle', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildUncommittedChangesetUri(sessionKey);
		const summary: SessionSummary = {
			resource: sessionKey,
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		};
		stateManager.createSession(summary);
		stateManager.registerChangeset(changesetUri);
		// Advertise the operation as Idle (e.g. a previous operation finished and
		// a ChangesetOperationStatusChanged reset the status) ...
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [{ id: testOperationId, label: 'Commit', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }],
		});
		// ... while a chat turn is still streaming on the session.
		stateManager.dispatchServerAction(buildDefaultChatUri(sessionKey), {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hi', origin: { kind: MessageKind.User } },
		});

		const service = createService(stateManager);
		const handler = new TestHandler();
		disposables.add(service.registerContribution(new TestContribution(handler)));

		const error = await service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId }).then(undefined, error => error);

		assert.match(error.message, /disabled while a turn is active/);
		assert.strictEqual(handler.calls, 0);
		assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Idle);
	});

	test('rejects invocation of a stale turn operation once the session is multi-root', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildTurnChangesetUri(sessionKey, 'turn-1');
		stateManager.registerChangeset(changesetUri);
		// A stale operation advertised while the session was single-root.
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [{ id: testOperationId, label: 'Sync', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }],
		});

		// The session is now multi-root, so the invocation must be re-suppressed
		// regardless of the stale advertised operation.
		const service = createService(stateManager, new TestConfigurationService(['file:///a', 'file:///b']));
		const handler = new TestHandler();
		disposables.add(service.registerContribution(new TestContribution(handler)));

		const error = await service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId }).then(undefined, error => error);

		assert.match(error.message, /multi-root session/);
		assert.strictEqual(error.code, JsonRpcErrorCodes.InvalidParams);
		assert.strictEqual(handler.calls, 0);
	});

	test('allows invocation of a turn operation in a single-root session', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildTurnChangesetUri(sessionKey, 'turn-1');
		stateManager.registerChangeset(changesetUri);
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [{ id: testOperationId, label: 'Sync', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }],
		});

		const service = createService(stateManager, new TestConfigurationService(['file:///a']));
		const handler = new TestHandler();
		disposables.add(service.registerContribution(new TestContribution(handler)));

		const invocation = service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId });
		handler.complete({ message: { markdown: 'Synced' } });
		const result = await invocation;

		assert.deepStrictEqual({ calls: handler.calls, result }, { calls: 1, result: { message: { markdown: 'Synced' } } });
	});

	test('allows invocation of an uncommitted operation while multi-root (only turn/compare are suppressed)', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildUncommittedChangesetUri(sessionKey);
		stateManager.registerChangeset(changesetUri);
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [{ id: testOperationId, label: 'Commit', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }],
		});

		// Multi-root: the invoke-time suppression targets only turn/compare, so an
		// uncommitted (or branch/session) operation must still be invocable.
		const service = createService(stateManager, new TestConfigurationService(['file:///a', 'file:///b']));
		const handler = new TestHandler();
		disposables.add(service.registerContribution(new TestContribution(handler)));

		const invocation = service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId });
		handler.complete({ message: { markdown: 'Committed' } });
		const result = await invocation;

		assert.deepStrictEqual({ calls: handler.calls, result }, { calls: 1, result: { message: { markdown: 'Committed' } } });
	});

	test('publishes running and error state when a changeset operation fails', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildUncommittedChangesetUri(sessionKey);
		stateManager.registerChangeset(changesetUri);
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [{ id: testOperationId, label: 'Commit', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }],
		});

		const service = createService(stateManager);
		const handler = new TestHandler();
		disposables.add(service.registerContribution(new TestContribution(handler)));

		const invocation = service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId });
		assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Running);
		const failure = invocation.then(undefined, error => error);
		handler.fail(new Error('Boom'));
		const error = await failure;
		assert.match(error.message, /Boom/);
		assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Error);
		assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].error?.message, 'Boom');
	});
});
