/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ActionEnvelope, ActionType, SessionWorkingDirectoryAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildDefaultChatUri, createDefaultChatSummary, createSessionState, RootState, SessionLifecycle, SessionState, SessionStatus, withSessionMultiRootMetadata } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { AgentHostSessionWorkingDirectorySynchronizer } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectorySynchronizer.js';

class MutableSessionSubscription extends Disposable implements IAgentSubscription<SessionState> {
	private readonly _onDidChange = this._register(new Emitter<SessionState>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _onWillApplyAction = this._register(new Emitter<ActionEnvelope>());
	readonly onWillApplyAction = this._onWillApplyAction.event;
	private readonly _onDidApplyAction = this._register(new Emitter<ActionEnvelope>());
	readonly onDidApplyAction = this._onDidApplyAction.event;

	private _state: SessionState | undefined;

	constructor(private _verifiedState: SessionState | undefined) {
		super();
		this._state = _verifiedState;
	}

	get value(): SessionState | undefined { return this._state; }
	get verifiedValue(): SessionState | undefined { return this._verifiedState; }

	refresh(value: SessionState): void {
		this._verifiedState = value;
		this._state = value;
		this._onDidChange.fire(value);
	}

	applyOptimistic(action: SessionWorkingDirectoryAction): void {
		const state = this._state;
		if (!state) {
			return;
		}
		const workingDirectories = state.workingDirectories ?? [];
		this._state = {
			...state,
			workingDirectories: action.type === ActionType.SessionWorkingDirectorySet
				? [...workingDirectories, action.directory]
				: workingDirectories.filter(directory => directory !== action.directory),
		};
		this._onDidChange.fire(this._state);
	}

	reject(action: SessionWorkingDirectoryAction): void {
		const envelope: ActionEnvelope = {
			channel: 'copilot:/session',
			action,
			serverSeq: 1,
			origin: { clientId: 'test', clientSeq: 1 },
			rejectionReason: 'rejected',
		};
		this._onWillApplyAction.fire(envelope);
		this._state = this._verifiedState;
		if (this._state) {
			this._onDidChange.fire(this._state);
		}
		this._onDidApplyAction.fire(envelope);
	}
}

class TestConnection extends mock<IAgentConnection>() {
	readonly dispatched: SessionWorkingDirectoryAction[] = [];

	override readonly rootState: IAgentSubscription<RootState>;
	override readonly initializeResult;

	constructor(private readonly subscription: MutableSessionSubscription, provider = 'claude', protocolVersion: string | null = '0.7.0', immutablePrimary = true) {
		super();
		this.initializeResult = observableValue(this, protocolVersion ? { protocolVersion } as InitializeResult : undefined);
		this.rootState = {
			value: {
				agents: [{
					provider,
					displayName: provider,
					description: '',
					models: [],
					capabilities: immutablePrimary ? { multipleWorkingDirectories: { immutablePrimary: true } } : {},
				}],
			} as unknown as RootState,
			verifiedValue: undefined,
			onDidChange: Event.None,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	}

	setProtocolVersion(protocolVersion: string): void {
		this.initializeResult.set({ protocolVersion } as InitializeResult, undefined);
	}

	override dispatch(_channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
		if (action.type === ActionType.SessionWorkingDirectorySet || action.type === ActionType.SessionWorkingDirectoryRemoved) {
			this.dispatched.push(action);
			this.subscription.applyOptimistic(action);
		}
	}
}

suite('AgentHostSessionWorkingDirectorySynchronizer', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const session = URI.parse('copilot:/session');
	const primary = URI.file('/workspace/primary');
	const retained = URI.file('/workspace/retained');
	const stale = URI.file('/workspace/stale');
	const added = URI.file('/workspace/added');
	const workspaceFile = URI.file('/workspace/demo.code-workspace');

	function createSynchronizer(
		trusted: boolean | (() => boolean | Promise<boolean>) = true,
		folders = [retained, added],
		onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent> = Event.None,
		onDidChangeTrustedFolders: Event<void> = Event.None,
	) {
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = onDidChangeWorkspaceFolders;
			override getWorkspace(): IWorkspace {
				return {
					id: 'workspace',
					configuration: workspaceFile,
					folders: folders.map((uri, index) => ({ uri, index, name: uri.path, toResource: path => URI.joinPath(uri, path) } as IWorkspaceFolder)),
				};
			}
		};
		const trustService = new class extends mock<IWorkspaceTrustManagementService>() {
			override readonly onDidChangeTrust = Event.None;
			override readonly onDidChangeTrustedFolders = onDidChangeTrustedFolders;
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: await (typeof trusted === 'function' ? trusted() : trusted) }; }
		};
		const environmentService = { isSessionsWindow: false, remoteAuthority: undefined } as Partial<IWorkbenchEnvironmentService> as IWorkbenchEnvironmentService;
		const uriIdentityService = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		};
		return disposables.add(new AgentHostSessionWorkingDirectorySynchronizer(
			workspaceContextService,
			trustService,
			environmentService,
			uriIdentityService,
			new NullLogService(),
		));
	}

	function createSubscription(hydrated = true): MutableSessionSubscription {
		const summary = {
			resource: session.toString(),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			workingDirectories: [primary.toString(), retained.toString(), stale.toString()],
			_meta: withSessionMultiRootMetadata(undefined, { workspaceFile: workspaceFile.toString() }),
		};
		const defaultChat = buildDefaultChatUri(session.toString());
		const state: SessionState = {
			...createSessionState(summary),
			lifecycle: SessionLifecycle.Ready,
			chats: [createDefaultChatSummary(summary, defaultChat)],
			defaultChat,
		};
		return disposables.add(new MutableSessionSubscription(hydrated ? state : undefined));
	}

	test('uses ordinary optimistic dispatch and pending state suppresses duplicate deltas', async () => {
		const synchronizer = createSynchronizer();
		const subscription = createSubscription();
		const connection = new TestConnection(subscription);
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		await synchronizer.reconcile(session, CancellationToken.None);
		await synchronizer.reconcile(session, CancellationToken.None);

		assert.deepStrictEqual({
			actions: connection.dispatched,
			effective: subscription.value?.workingDirectories,
			confirmed: subscription.verifiedValue?.workingDirectories,
		}, {
			actions: [
				{ type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
				{ type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
			],
			effective: [primary.toString(), retained.toString(), added.toString()],
			confirmed: [primary.toString(), retained.toString(), stale.toString()],
		});
	});

	test('does not remove the immutable primary when it leaves the workspace', async () => {
		const synchronizer = createSynchronizer(true, [retained]);
		const subscription = createSubscription();
		const connection = new TestConnection(subscription);
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		await synchronizer.reconcile(session, CancellationToken.None);

		assert.deepStrictEqual(connection.dispatched, [
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
		]);
	});

	test('does not reconcile without the immutable-primary capability', async () => {
		const synchronizer = createSynchronizer();
		const subscription = createSubscription();
		const connection = new TestConnection(subscription, 'claude', '0.7.0', false);
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		await synchronizer.reconcile(session, CancellationToken.None);

		assert.deepStrictEqual(connection.dispatched, []);
	});

	test('subscription refresh converges without another workspace event or user send', async () => {
		const synchronizer = createSynchronizer();
		const subscription = createSubscription(false);
		const state = createSubscription().verifiedValue!;
		const connection = new TestConnection(subscription);
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		subscription.refresh(state);
		await timeout(0);

		assert.deepStrictEqual(connection.dispatched, [
			{ type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
		]);
	});

	test('registration and workspace changes schedule reconciliation', async () => {
		const folders = [retained];
		const onDidChangeWorkspaceFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const synchronizer = createSynchronizer(true, folders, onDidChangeWorkspaceFolders.event);
		const subscription = createSubscription();
		const connection = new TestConnection(subscription);
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		await timeout(0);
		assert.deepStrictEqual(connection.dispatched, [
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
		]);

		folders.push(added);
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
		await timeout(0);
		assert.deepStrictEqual(connection.dispatched, [
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
			{ type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
		]);
	});

	test('does not dispatch working-directory actions to a pre-0.7 host', async () => {
		const synchronizer = createSynchronizer();
		const subscription = createSubscription();
		const connection = new TestConnection(subscription, 'claude', '0.5.2');
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		await synchronizer.reconcile(session, CancellationToken.None);

		assert.deepStrictEqual(connection.dispatched, []);
	});

	test('reconciles when a compatible protocol version finishes initializing', async () => {
		const synchronizer = createSynchronizer();
		const subscription = createSubscription();
		const connection = new TestConnection(subscription, 'claude', null);
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		await timeout(0);
		assert.deepStrictEqual(connection.dispatched, []);

		connection.setProtocolVersion('0.7.0');
		await timeout(0);

		assert.deepStrictEqual(connection.dispatched, [
			{ type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
		]);
	});

	test('rejects untrusted additions but still dispatches safe removals', async () => {
		let trusted = false;
		const onDidChangeTrustedFolders = disposables.add(new Emitter<void>());
		const synchronizer = createSynchronizer(() => trusted, undefined, undefined, onDidChangeTrustedFolders.event);
		const subscription = createSubscription();
		const connection = new TestConnection(subscription);
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		await assert.rejects(synchronizer.reconcile(session, CancellationToken.None), /is not trusted/);
		assert.deepStrictEqual(connection.dispatched, [
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
		]);

		trusted = true;
		onDidChangeTrustedFolders.fire();
		await timeout(0);
		assert.deepStrictEqual(connection.dispatched, [
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
			{ type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
		]);
	});

	test('does not dispatch through a registration disposed while folder trust is pending', async () => {
		let releaseTrust!: () => void;
		const trustPending = new Promise<void>(resolve => releaseTrust = resolve);
		let reportTrustStarted!: () => void;
		const trustStarted = new Promise<void>(resolve => reportTrustStarted = resolve);
		const synchronizer = createSynchronizer(async () => {
			reportTrustStarted();
			await trustPending;
			return true;
		});
		const subscription = createSubscription();
		const connection = new TestConnection(subscription);
		const registration = synchronizer.register({ session, provider: 'claude', connection, subscription });

		await trustStarted;
		registration.dispose();
		const queuedReconcile = synchronizer.reconcile(session, CancellationToken.None);
		releaseTrust();
		await queuedReconcile;

		assert.deepStrictEqual(connection.dispatched, []);
	});

	test('does not immediately redispatch an action rejected by the host', async () => {
		const synchronizer = createSynchronizer();
		const subscription = createSubscription();
		const connection = new TestConnection(subscription);
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		await synchronizer.reconcile(session, CancellationToken.None);
		subscription.reject(connection.dispatched[0]);
		await timeout(0);

		assert.strictEqual(connection.dispatched.length, 2);
	});

	test('reconciles Copilot sessions through the provider-neutral capability', async () => {
		const synchronizer = createSynchronizer();
		const subscription = createSubscription();
		const connection = new TestConnection(subscription, 'copilotcli');
		disposables.add(synchronizer.register({ session, provider: 'copilotcli', connection, subscription }));

		await synchronizer.reconcile(session, CancellationToken.None);

		assert.deepStrictEqual(connection.dispatched, [
			{ type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
			{ type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
		]);
	});
});
