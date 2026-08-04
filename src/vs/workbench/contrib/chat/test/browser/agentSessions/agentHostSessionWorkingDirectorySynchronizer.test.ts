/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription, SessionActionStateRebasedError } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionEnvelope, ActionType, SessionWorkingDirectoryAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildDefaultChatUri, createDefaultChatSummary, createSessionState, RootState, SessionLifecycle, SessionState, SessionStatus, withSessionMultiRootMetadata } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { AgentHostSessionWorkingDirectorySynchronizer } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectorySynchronizer.js';

class MutableSessionSubscription implements IAgentSubscription<SessionState> {
	readonly onDidChange = Event.None;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;

	constructor(private _state: SessionState) { }

	get value(): SessionState { return this._state; }
	get verifiedValue(): SessionState { return this._state; }
	set state(value: SessionState) { this._state = value; }
}

class TestConnection extends mock<IAgentConnection>() {
	readonly dispatched: SessionWorkingDirectoryAction[] = [];
	rebaseFirstAction = false;
	private _serverSeq = 0;

	override readonly rootState: IAgentSubscription<RootState>;

	constructor(private readonly subscription: MutableSessionSubscription, provider = 'claude') {
		super();
		this.rootState = {
			value: {
				agents: [{
					provider,
					displayName: provider,
					description: '',
					models: [],
					capabilities: { multipleWorkingDirectories: { immutablePrimary: true } },
				}],
			} as unknown as RootState,
			verifiedValue: undefined,
			onDidChange: Event.None,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	}

	override async dispatchSessionWorkingDirectoryAction(session: string, action: SessionWorkingDirectoryAction): Promise<ActionEnvelope> {
		this.dispatched.push(action);
		const state = this.subscription.verifiedValue;
		const workingDirectories = state.workingDirectories ?? [];
		this.subscription.state = {
			...state,
			workingDirectories: action.type === ActionType.SessionWorkingDirectorySet
				? [...workingDirectories, action.directory]
				: workingDirectories.filter(directory => directory !== action.directory),
		};
		if (this.rebaseFirstAction) {
			this.rebaseFirstAction = false;
			throw new SessionActionStateRebasedError(session);
		}
		return { channel: session, action, serverSeq: ++this._serverSeq, origin: { clientId: 'test', clientSeq: this._serverSeq } };
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

	function createSynchronizer(trusted = true) {
		const folders = [retained, added];
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace(): IWorkspace {
				return {
					id: 'workspace',
					configuration: workspaceFile,
					folders: folders.map((uri, index) => ({ uri, index, name: uri.path, toResource: path => URI.joinPath(uri, path) } as IWorkspaceFolder)),
				};
			}
		};
		const trustService = new class extends mock<IWorkspaceTrustManagementService>() {
			override async getUriTrustInfo(uri: URI) { return { uri, trusted }; }
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

	function createSubscription(): MutableSessionSubscription {
		const summary = {
			resource: session.toString(),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			workingDirectories: [primary.toString(), retained.toString(), stale.toString()],
			_meta: withSessionMultiRootMetadata(undefined, { workspaceFile: workspaceFile.toString(), name: 'Demo' }),
		};
		const defaultChat = buildDefaultChatUri(session.toString());
		const state: SessionState = {
			...createSessionState(summary),
			lifecycle: SessionLifecycle.Ready,
			chats: [createDefaultChatSummary(summary, defaultChat)],
			defaultChat,
		};
		return new MutableSessionSubscription(state);
	}

	test('applies the secondary-root diff and recomputes after a reconnect rebase', async () => {
		const synchronizer = createSynchronizer();
		const subscription = createSubscription();
		const connection = new TestConnection(subscription);
		connection.rebaseFirstAction = true;
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		await synchronizer.reconcile(session, CancellationToken.None);

		assert.deepStrictEqual({
			actions: connection.dispatched,
			confirmed: subscription.verifiedValue.workingDirectories,
		}, {
			actions: [
				{ type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
				{ type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
			],
			confirmed: [primary.toString(), retained.toString(), added.toString()],
		});
	});

	test('rejects an untrusted added root before dispatch', async () => {
		const synchronizer = createSynchronizer(false);
		const subscription = createSubscription();
		const connection = new TestConnection(subscription);
		disposables.add(synchronizer.register({ session, provider: 'claude', connection, subscription }));

		await assert.rejects(synchronizer.reconcile(session, CancellationToken.None), /is not trusted/);
		assert.deepStrictEqual(connection.dispatched, []);
	});

	test('does not reconcile Copilot sessions until the SDK can apply root changes', async () => {
		const synchronizer = createSynchronizer();
		const subscription = createSubscription();
		const connection = new TestConnection(subscription, 'copilotcli');
		disposables.add(synchronizer.register({ session, provider: 'copilotcli', connection, subscription }));

		await synchronizer.reconcile(session, CancellationToken.None);

		assert.deepStrictEqual(connection.dispatched, []);
	});
});
