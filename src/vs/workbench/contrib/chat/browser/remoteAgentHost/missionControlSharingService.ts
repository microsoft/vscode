/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Throttler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, IMissionControlSharingService, isGitHubEnvironmentBackend } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

const sharingStorageKey = 'agentHost.missionControl.sharing';
const missionControlUseLocalCredentials = 'chat.agentHost.experimentalMissionControl.useLocalCredentials';
const missionControlIgnoreRemoteControlPolicy = 'chat.agentHost.experimentalMissionControl.ignoreRemoteControlPolicy';

export class MissionControlSharingService extends Disposable implements IMissionControlSharingService {
	declare readonly _serviceBrand: undefined;
	readonly state = observableValue<'disabled' | 'connecting' | 'enabled'>(this, 'disabled');
	private _enabled = false;
	private _configured = false;
	private _generation = 0;
	private _accountId: string | undefined;
	private _accountSessionIds = new Set<string>();
	private readonly _updates = this._register(new Throttler());
	private readonly _update = this._register(new RunOnceScheduler(() => {
		void this._updates.queue(() => this._configure()).catch(error => {
			this._logService.error('Mission Control configuration failed', error);
			this._notificationService.error(error);
		});
	}, 0));

	constructor(
		@IAgentHostService private readonly _agentHost: IAgentHostService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@IAuthenticationService private readonly _authentication: IAuthenticationService,
		@IChatEntitlementService private readonly _entitlement: IChatEntitlementService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IProductService private readonly _product: IProductService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storage: IStorageService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		if (!this._agentHost.configureMissionControl) {
			return;
		}
		this._enabled = this._usesMissionControl() && this._storage.getBoolean(sharingStorageKey, StorageScope.APPLICATION, false);
		this._register(this._configuration.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentHostRemoteConnectionsSettingId)) {
				void this.setEnabled(false).catch(error => this._reportWithdrawalError(error));
			} else if (e.affectsConfiguration(missionControlUseLocalCredentials) || e.affectsConfiguration(missionControlIgnoreRemoteControlPolicy)) {
				void this._withdraw().catch(error => this._reportWithdrawalError(error));
				this._update.schedule();
			}
		}));
		this._register(this._storage.onDidChangeValue(StorageScope.APPLICATION, sharingStorageKey, this._store)(e => {
			if (e.external) {
				const enabled = this._storage.getBoolean(sharingStorageKey, StorageScope.APPLICATION, false);
				if (enabled === this._enabled) {
					return;
				}
				this._enabled = enabled;
				if (!enabled) {
					void this._withdraw().catch(error => this._reportWithdrawalError(error));
				}
				this._update.schedule();
			}
		}));
		this._register(this._workspace.onDidChangeWorkspaceFolders(() => {
			this._generation++;
			this._update.schedule();
		}));
		this._register(this._authentication.onDidChangeSessions(e => {
			const providerId = this._product.defaultChatAgent?.provider?.default?.id ?? 'github';
			if (e.providerId !== providerId) {
				return;
			}
			const removed = e.event.removed?.filter(session => session.account.id === this._accountId) ?? [];
			for (const session of removed) {
				this._accountSessionIds.delete(session.id);
			}
			for (const session of e.event.added ?? []) {
				if (session.account.id === this._accountId && this._getScopes().every(scope => session.scopes.includes(scope))) {
					this._accountSessionIds.add(session.id);
				}
			}
			if (removed.length && !this._accountSessionIds.size) {
				void this._withdraw().catch(error => this._reportWithdrawalError(error));
			} else {
				this._generation++;
			}
			this._update.schedule();
		}));
		this._register(this._entitlement.onDidChangeSentiment(() => {
			if (this._entitlement.sentiment.hidden) {
				void this.setEnabled(false).catch(error => this._reportWithdrawalError(error));
			}
			this._update.schedule();
		}));
		this._register(this._agentHost.onAgentHostStart(() => {
			if (this._configured) {
				this._generation++;
				this._configured = false;
				this.state.set('connecting', undefined);
				this._update.schedule();
			}
		}));
		this._update.schedule();
	}

	async setEnabled(enabled: boolean): Promise<void> {
		if (enabled && (!this._agentHost.configureMissionControl || !this._usesMissionControl() || this._entitlement.sentiment.hidden)) {
			throw new Error(localize('missionControlSharing.unavailable', "GitHub environment sharing is unavailable."));
		}
		this._enabled = enabled;
		this._generation++;
		this._update.cancel();
		if (!enabled) {
			this._storage.store(sharingStorageKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
			await this._withdraw();
			return;
		}
		this.state.set('connecting', undefined);
		await this._updates.queue(() => this._configure(true));
	}

	private _usesMissionControl(): boolean {
		return isGitHubEnvironmentBackend(this._configuration.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
	}

	private _reportWithdrawalError(error: Error): void {
		this._logService.error('Mission Control withdrawal failed', error);
		this._notificationService.error(error);
	}

	private async _withdraw(): Promise<void> {
		this._generation++;
		this._configured = false;
		this._accountSessionIds.clear();
		this.state.set('disabled', undefined);
		if (this._accountId !== undefined) {
			await this._agentHost.configureMissionControl?.(undefined, this._accountId);
		}
	}

	private _getScopes(): readonly string[] {
		return this._product.defaultChatAgent?.providerScopes?.[0] ?? ['read:user', 'user:email', 'repo', 'workflow'];
	}

	private async _configure(interactive = false): Promise<void> {
		const generation = this._generation;
		if (!this._enabled || !this._usesMissionControl() || this._entitlement.sentiment.hidden) {
			return;
		}
		if (!this._configured) {
			this.state.set('connecting', undefined);
		}
		try {
			const roots = this._workspace.getWorkspace().folders.filter(folder => folder.uri.scheme === Schemas.file).map(folder => folder.uri.fsPath);
			const providerId = this._product.defaultChatAgent?.provider?.default?.id ?? 'github';
			const scopes = this._getScopes();
			let sessions = await this._authentication.getSessions(providerId, [...scopes], undefined, true);
			if (!sessions.length && interactive && generation === this._generation && !this._store.isDisposed) {
				sessions = [await this._authentication.createSession(providerId, [...scopes])];
			}
			if (generation !== this._generation || this._store.isDisposed) {
				return;
			}
			if (new Set(sessions.map(session => session.account.id)).size !== 1) {
				throw new Error(localize('missionControlSharing.accountRequired', "Mission Control requires exactly one local GitHub account with Copilot scopes."));
			}
			this._agentHost.startAgentHost();
			if (generation !== this._generation) {
				return;
			}
			this._accountId = sessions[0].account.id;
			this._accountSessionIds = new Set(sessions.map(session => session.id));
			const localCredentialSetting = this._configuration.inspect<boolean>(missionControlUseLocalCredentials);
			const useLocalCredentials = (localCredentialSetting.userLocalValue ?? localCredentialSetting.applicationValue) === true;
			if (useLocalCredentials) {
				this._logService.warn('[Mission Control] Local credential delegation enabled: same-owner remote clients will run Copilot work with the desktop credential and its permissions');
			}
			const remoteControlPolicySetting = this._configuration.inspect<boolean>(missionControlIgnoreRemoteControlPolicy);
			const ignoreRemoteControlPolicy = (remoteControlPolicySetting.userLocalValue ?? remoteControlPolicySetting.applicationValue) === true;
			if (ignoreRemoteControlPolicy) {
				this._logService.warn('[Mission Control] Device remote-control policy override enabled: registration will omit enterprise remote-control restrictions');
			}
			await this._agentHost.configureMissionControl?.({
				baseUrl: 'https://api.github.com',
				accountId: sessions[0].account.id,
				credential: sessions[0].accessToken,
				roots,
				live: true,
				...(useLocalCredentials ? { useLocalCredentials: true } : {}),
				...(ignoreRemoteControlPolicy ? { ignoreRemoteControlPolicy: true } : {}),
			});
			if (generation === this._generation && !this._store.isDisposed) {
				this._configured = true;
				this._storage.store(sharingStorageKey, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				this.state.set('enabled', undefined);
			}
		} catch (error) {
			if (generation === this._generation && !this._store.isDisposed) {
				if (interactive) {
					this._enabled = false;
					this._storage.store(sharingStorageKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
				}
				await this._withdraw().catch(withdrawalError => this._reportWithdrawalError(withdrawalError));
			}
			throw error;
		}
	}
}
