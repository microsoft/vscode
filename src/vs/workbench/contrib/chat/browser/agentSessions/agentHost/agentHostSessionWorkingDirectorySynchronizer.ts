/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { readSessionMultiRootMetadata, readSessionWorkspaceless, SessionLifecycle, SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { fromRemoteAgentHostWorkingDirectory } from '../../../../../services/agentHost/common/agentHostWorkingDirectoryUri.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { computeDesiredWorkingDirectories } from './agentHostNewSessionFolderService.js';

export const IAgentHostSessionWorkingDirectorySynchronizer = createDecorator<IAgentHostSessionWorkingDirectorySynchronizer>('agentHostSessionWorkingDirectorySynchronizer');

export interface IAgentHostWorkingDirectoryRegistration {
	readonly session: URI;
	readonly provider: string;
	readonly connection: IAgentConnection;
	readonly subscription: IAgentSubscription<SessionState>;
}

export interface IAgentHostSessionWorkingDirectorySynchronizer {
	readonly _serviceBrand: undefined;
	register(registration: IAgentHostWorkingDirectoryRegistration): IDisposable;
	reconcile(session: URI, token: CancellationToken): Promise<void>;
}

interface IAgentHostWorkingDirectoryRegistrationEntry extends IAgentHostWorkingDirectoryRegistration {
	readonly store: DisposableStore;
	applyingRejectedAction: boolean;
	automaticReconcileAgain: boolean;
	automaticReconcileScheduled: boolean;
	dispatching: boolean;
}

export class AgentHostSessionWorkingDirectorySynchronizer extends Disposable implements IAgentHostSessionWorkingDirectorySynchronizer {
	declare readonly _serviceBrand: undefined;

	private readonly _registrations = new Map<string, IAgentHostWorkingDirectoryRegistrationEntry>();
	private readonly _reconciler = new SequencerByKey<string>();

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._scheduleAll('workspace folder change')));
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(() => this._scheduleAll('workspace trust change')));
		this._register(this._workspaceTrustManagementService.onDidChangeTrustedFolders(() => this._scheduleAll('trusted folders change')));
	}

	register(registration: IAgentHostWorkingDirectoryRegistration): IDisposable {
		if (this._environmentService.isSessionsWindow) {
			return Disposable.None;
		}
		const key = registration.session.toString();
		this._registrations.get(key)?.store.dispose();

		const store = new DisposableStore();
		const entry: IAgentHostWorkingDirectoryRegistrationEntry = {
			...registration,
			store,
			applyingRejectedAction: false,
			automaticReconcileAgain: false,
			automaticReconcileScheduled: false,
			dispatching: false,
		};
		store.add(registration.subscription.onWillApplyAction(envelope => {
			entry.applyingRejectedAction = !!envelope.rejectionReason;
		}));
		store.add(registration.subscription.onDidApplyAction(() => {
			entry.applyingRejectedAction = false;
		}));
		store.add(registration.subscription.onDidChange(() => {
			if (!entry.applyingRejectedAction && !entry.dispatching) {
				this._scheduleReconcile(entry, 'subscription change');
			}
		}));
		store.add(toDisposable(() => {
			if (this._registrations.get(key) === entry) {
				this._registrations.delete(key);
			}
		}));
		this._registrations.set(key, entry);
		this._scheduleReconcile(entry, 'registration');
		return store;
	}

	private _scheduleAll(reason: string): void {
		for (const registration of this._registrations.values()) {
			this._scheduleReconcile(registration, reason);
		}
	}

	reconcile(session: URI, token: CancellationToken): Promise<void> {
		return this._reconciler.queue(session.toString(), () => this._reconcile(session, token));
	}

	private _scheduleReconcile(registration: IAgentHostWorkingDirectoryRegistrationEntry, reason: string): void {
		if (registration.automaticReconcileScheduled) {
			registration.automaticReconcileAgain = true;
			return;
		}
		registration.automaticReconcileScheduled = true;
		const run = () => {
			registration.automaticReconcileAgain = false;
			void this.reconcile(registration.session, CancellationToken.None).then(
				() => finish(),
				error => {
					this._logService.warn(`[AgentHostWorkingDirectories] Failed to reconcile ${reason}`, error);
					finish();
				},
			);
		};
		const finish = () => {
			if (this._registrations.get(registration.session.toString()) !== registration) {
				return;
			}
			if (registration.automaticReconcileAgain) {
				run();
			} else {
				registration.automaticReconcileScheduled = false;
			}
		};
		run();
	}

	private async _reconcile(session: URI, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const registration = this._registrations.get(session.toString());
		const value = registration?.subscription.value;
		const state = value && !(value instanceof Error) ? value : undefined;
		if (!registration || !state || !this._isEligible(registration, state)) {
			return;
		}

		const current = state.workingDirectories?.map(directory => this._toEditorWorkingDirectory(URI.parse(directory))) ?? [];
		if (current.length === 0) {
			return;
		}
		const desired = computeDesiredWorkingDirectories(
			current[0],
			current,
			this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri),
			this._uriIdentityService.extUri,
		);
		const additions = desired.slice(1).filter(directory => !current.some(existing => this._uriIdentityService.extUri.isEqual(existing, directory)));
		const removals = current.slice(1).filter(directory => !desired.some(expected => this._uriIdentityService.extUri.isEqual(expected, directory)));
		if (additions.length === 0 && removals.length === 0) {
			return;
		}

		const trustError = await this._getAdditionTrustError(additions, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this._registrations.get(session.toString()) !== registration) {
			return;
		}

		registration.dispatching = true;
		try {
			if (!trustError) {
				for (const directory of additions) {
					registration.connection.dispatch(session.toString(), {
						type: ActionType.SessionWorkingDirectorySet,
						directory: directory.toString(),
					});
				}
			}
			for (const directory of removals) {
				registration.connection.dispatch(session.toString(), {
					type: ActionType.SessionWorkingDirectoryRemoved,
					directory: directory.toString(),
				});
			}
		} finally {
			registration.dispatching = false;
		}

		if (trustError) {
			throw trustError;
		}
	}

	private _isEligible(registration: IAgentHostWorkingDirectoryRegistration, state: SessionState): boolean {
		if (state.lifecycle !== SessionLifecycle.Ready
			|| readSessionWorkspaceless(state._meta)
			|| state.config?.values[SessionConfigKey.Isolation] === 'worktree'
			|| state.chats.length !== 1
			|| state.defaultChat !== state.chats[0].resource
			|| !state.workingDirectories?.length) {
			return false;
		}
		const workspace = this._workspaceContextService.getWorkspace();
		const multiRoot = readSessionMultiRootMetadata(state._meta);
		if (!multiRoot || !URI.isUri(workspace.configuration) || !this._uriIdentityService.extUri.isEqual(URI.parse(multiRoot.workspaceFile), workspace.configuration)) {
			return false;
		}
		const rootState = registration.connection.rootState.value;
		const agent = rootState && !(rootState instanceof Error)
			? rootState.agents.find(candidate => candidate.provider === registration.provider)
			: undefined;
		return agent?.capabilities?.multipleWorkingDirectories?.immutablePrimary === true;
	}

	private _toEditorWorkingDirectory(directory: URI): URI {
		const remoteAuthority = this._environmentService.remoteAuthority;
		return remoteAuthority ? fromRemoteAgentHostWorkingDirectory(directory, remoteAuthority) : directory;
	}

	private async _getAdditionTrustError(additions: readonly URI[], token: CancellationToken): Promise<Error | undefined> {
		for (const directory of additions) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const { trusted } = await this._workspaceTrustManagementService.getUriTrustInfo(directory);
			if (!trusted) {
				return new Error(localize('agentHostWorkingDirectories.untrusted', "The workspace folder '{0}' is not trusted.", directory.path));
			}
		}
		return undefined;
	}
}

registerSingleton(IAgentHostSessionWorkingDirectorySynchronizer, AgentHostSessionWorkingDirectorySynchronizer, InstantiationType.Delayed);
