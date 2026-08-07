/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationHandler, IChangesetOperationRegistry } from '../../common/agentHostChangesetOperationService.js';
import { buildCompareTurnsChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../../common/state/protocol/channels-changeset/commands.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ChangesetOperationScope, ChangesetOperationStatus, ISessionGitHubState, MessageKind, SessionStatus, buildDefaultChatUri, type ChangesetOperation, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentHostChangesetOperationService } from '../../node/agentHostChangesetOperationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
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

/** Contribution that advertises one changeset-scoped operation for every changeset. */
class AlwaysOpContribution implements IChangesetOperationContribution {
	registerHandlers(): IDisposable { return { dispose() { } }; }
	getOperations(_context: IChangesetOperationContext): readonly ChangesetOperation[] {
		return [{ id: 'op', label: 'Op', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }];
	}
	dispose(): void { }
}

class TestGitStateService implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;

	readonly onDidRefreshSessionGitState = Event.None;

	async refreshSessionGitState(_sessionKey: string, _workingDirectory?: URI): Promise<void> { }

	async getSessionGitHubState(_sessionKey: string): Promise<ISessionGitHubState | undefined> {
		return undefined;
	}

	async setSessionGitHubState(_sessionKey: string, _state: ISessionGitHubState): Promise<void> { }

	async attachSessionGitHubPullRequest(_sessionKey: string): Promise<void> { }
	async attachSessionGitHubIssues(_sessionKey: string, _text: string): Promise<void> { }
}

suite('AgentHostChangesetOperationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(stateManager: AgentHostStateManager): AgentHostChangesetOperationService {
		return disposables.add(new AgentHostChangesetOperationService(
			stateManager,
			new TestGitStateService(),
			new AgentHostChangesetSubscriptionService(),
		));
	}

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

	test('suppresses operations for turn and compare-turns changesets in multi-root Copilot sessions', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'copilotcli:/multi';
		stateManager.createSession({
			resource: sessionKey, provider: 'copilotcli', title: 'Test', status: SessionStatus.Idle,
			createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
			workingDirectories: ['file:///repoA', 'file:///repoB'],
		});
		const service = createService(stateManager);
		disposables.add(service.registerContribution(new AlwaysOpContribution()));

		const gitState = { branchName: 'feature', baseBranchName: 'main', uncommittedChanges: 1 };
		const ids = (changeset: string) => service.getOperations(sessionKey, changeset, gitState).map(o => o.id);

		assert.deepStrictEqual({
			turn: ids(buildTurnChangesetUri(sessionKey, 'turn-1')),
			compare: ids(buildCompareTurnsChangesetUri(sessionKey, 'turn-1', 'turn-2')),
			uncommitted: ids(buildUncommittedChangesetUri(sessionKey)),
		}, {
			turn: [],        // multi-root aggregate → no operations
			compare: [],     // multi-root aggregate → no operations
			uncommitted: ['op'], // static changeset unaffected
		});
	});

	test('keeps turn-changeset operations for single-folder Copilot sessions and non-Copilot sessions', () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const gitState = { branchName: 'feature', baseBranchName: 'main', uncommittedChanges: 1 };

		const singleKey = 'copilotcli:/single';
		stateManager.createSession({
			resource: singleKey, provider: 'copilotcli', title: 'Test', status: SessionStatus.Idle,
			createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
			workingDirectories: ['file:///repoA'],
		});
		// Non-Copilot session with multiple folders must NOT be treated as multi-root here.
		const otherKey = 'claude:/multi';
		stateManager.createSession({
			resource: otherKey, provider: 'claude', title: 'Test', status: SessionStatus.Idle,
			createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
			workingDirectories: ['file:///repoA', 'file:///repoB'],
		});
		const service = createService(stateManager);
		disposables.add(service.registerContribution(new AlwaysOpContribution()));

		assert.deepStrictEqual({
			singleFolderCopilot: service.getOperations(singleKey, buildTurnChangesetUri(singleKey, 'turn-1'), gitState).map(o => o.id),
			multiFolderNonCopilot: service.getOperations(otherKey, buildTurnChangesetUri(otherKey, 'turn-1'), gitState).map(o => o.id),
		}, {
			singleFolderCopilot: ['op'],
			multiFolderNonCopilot: ['op'],
		});
	});
});
