/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription, SessionActionStateRebasedError } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
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

const COPILOT_CLI_PROVIDER = 'copilotcli';

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

export class AgentHostSessionWorkingDirectorySynchronizer extends Disposable implements IAgentHostSessionWorkingDirectorySynchronizer {
	declare readonly _serviceBrand: undefined;

	private readonly _registrations = new Map<string, IAgentHostWorkingDirectoryRegistration>();
	private readonly _sequencer = new SequencerByKey<string>();

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			for (const registration of this._registrations.values()) {
				void this.reconcile(registration.session, CancellationToken.None).catch(error => {
					this._logService.warn('[AgentHostWorkingDirectories] Failed to reconcile workspace folder change', error);
				});
			}
		}));
	}

	register(registration: IAgentHostWorkingDirectoryRegistration): IDisposable {
		if (this._environmentService.isSessionsWindow) {
			return Disposable.None;
		}
		const key = registration.session.toString();
		this._registrations.set(key, registration);
		return toDisposable(() => {
			if (this._registrations.get(key) === registration) {
				this._registrations.delete(key);
			}
		});
	}

	reconcile(session: URI, token: CancellationToken): Promise<void> {
		return this._sequencer.queue(session.toString(), () => this._reconcile(session, token));
	}

	private async _reconcile(session: URI, token: CancellationToken): Promise<void> {
		while (true) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const registration = this._registrations.get(session.toString());
			const state = registration?.subscription.verifiedValue;
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

			await this._ensureTrusted(additions);
			try {
				for (const directory of additions) {
					await registration.connection.dispatchSessionWorkingDirectoryAction(session.toString(), {
						type: ActionType.SessionWorkingDirectorySet,
						directory: directory.toString(),
					}, token);
				}
				for (const directory of removals) {
					await registration.connection.dispatchSessionWorkingDirectoryAction(session.toString(), {
						type: ActionType.SessionWorkingDirectoryRemoved,
						directory: directory.toString(),
					}, token);
				}
			} catch (error) {
				if (error instanceof SessionActionStateRebasedError) {
					continue;
				}
				throw error;
			}
		}
	}

	private _isEligible(registration: IAgentHostWorkingDirectoryRegistration, state: SessionState): boolean {
		if (state.lifecycle !== SessionLifecycle.Ready
			|| registration.provider === COPILOT_CLI_PROVIDER
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

	private async _ensureTrusted(additions: readonly URI[]): Promise<void> {
		for (const directory of additions) {
			const { trusted } = await this._workspaceTrustManagementService.getUriTrustInfo(directory);
			if (!trusted) {
				throw new Error(localize('agentHostWorkingDirectories.untrusted', "The workspace folder '{0}' is not trusted.", directory.path));
			}
		}
	}
}

registerSingleton(IAgentHostSessionWorkingDirectorySynchronizer, AgentHostSessionWorkingDirectorySynchronizer, InstantiationType.Delayed);
