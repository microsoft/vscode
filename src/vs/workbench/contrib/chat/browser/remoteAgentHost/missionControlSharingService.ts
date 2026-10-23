/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Throttler } from '../../../../../base/common/async.js';
import { equals } from '../../../../../base/common/arrays.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { AgentHostDefaultCloneDirectorySettingId, AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, IMissionControlSharingService, isGitHubEnvironmentBackend, MissionControlUseLocalCredentialsSettingId } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IPathService } from '../../../../../platform/path/common/pathService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { AuthenticationSessionAccount, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

const sharingStorageKey = 'agentHost.missionControl.sharing';
const gitDefaultCloneDirectorySetting = 'git.defaultCloneDirectory';
const environmentNameStorageKey = 'agentHost.missionControl.environmentName';
const missionControlIgnoreRemoteControlPolicy = 'chat.agentHost.experimentalMissionControl.ignoreRemoteControlPolicy';
const missionControlDisableRepositoryMetadata = 'chat.agentHost.experimentalMissionControl.disableRepositoryMetadata';

export class MissionControlSharingService extends Disposable implements IMissionControlSharingService {
	declare readonly _serviceBrand: undefined;
	readonly state = observableValue<'disabled' | 'connecting' | 'enabled'>(this, 'disabled');
	readonly environmentName = observableValue<string | undefined>(this, undefined);
	private _enabled = false;
	private _configured = false;
	private _generation = 0;
	private _accountId: string | undefined;
	private _defaultAccount: IDefaultAccount | null | undefined;
	private _accountSessionIds = new Set<string>();
	private _projectFolders: readonly URI[] | undefined;
	protected get isWindowsPlatform(): boolean { return isWindows; }
	private readonly _updates = this._register(new Throttler());
	private readonly _update = this._register(new RunOnceScheduler(() => {
		void this._updates.queue(() => this._configure()).catch(error => {
			this._logService.error('Mission Control configuration failed', error);
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
		@IPathService private readonly _pathService: IPathService,
		@IFileService private readonly _fileService: IFileService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
	) {
		super();
		this.environmentName.set(this._storage.get(environmentNameStorageKey, StorageScope.APPLICATION), undefined);
		if (!this._agentHost.configureMissionControl) {
			return;
		}
		this._enabled = this._usesMissionControl() && this._storage.getBoolean(sharingStorageKey, StorageScope.APPLICATION, false);
		this._register(this._configuration.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentHostRemoteConnectionsSettingId)) {
				void this.setEnabled(false).catch(error => this._reportWithdrawalError(error));
			} else if (e.affectsConfiguration(missionControlIgnoreRemoteControlPolicy) || e.affectsConfiguration(MissionControlUseLocalCredentialsSettingId)) {
				void this._withdraw().catch(error => this._reportWithdrawalError(error));
				this._update.schedule();
			} else if (e.affectsConfiguration(AgentHostDefaultCloneDirectorySettingId) || e.affectsConfiguration(gitDefaultCloneDirectorySetting) || e.affectsConfiguration(missionControlDisableRepositoryMetadata)) {
				this._generation++;
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
		this._register(this._storage.onDidChangeValue(StorageScope.APPLICATION, environmentNameStorageKey, this._store)(e => {
			if (e.external) {
				const name = this._storage.get(environmentNameStorageKey, StorageScope.APPLICATION);
				if (name !== this.environmentName.get()) {
					this.environmentName.set(name, undefined);
					void this._applyEnvironmentName().catch(error => this._logService.error('Failed to update GitHub environment name', error));
				}
			}
		}));
		this._register(this._workspace.onDidChangeWorkspaceFolders(() => {
			this._generation++;
			this._update.schedule();
		}));
		this._register(this._defaultAccountService.onDidChangeDefaultAccount(account => {
			if (!this._enabled || this._defaultAccount === undefined) {
				return;
			}
			if (account?.authenticationProvider.id !== this._defaultAccount?.authenticationProvider.id
				|| account?.accountName !== this._defaultAccount?.accountName) {
				void this.setEnabled(false).catch(error => this._reportWithdrawalError(error));
			} else if (account?.sessionId !== this._defaultAccount?.sessionId) {
				this._defaultAccount = account;
				this._generation++;
				this._update.schedule();
			}
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

	setProjectFolders(folders: readonly URI[]): void {
		const localFolders = [...new ResourceSet(folders.filter(folder => folder.scheme === Schemas.file), folder => extUriBiasedIgnorePathCase.getComparisonKey(folder))];
		if (this._projectFolders && equals(this._projectFolders, localFolders, (a, b) => extUriBiasedIgnorePathCase.isEqual(a, b))) {
			return;
		}
		this._projectFolders = localFolders;
		this._generation++;
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

	async setEnvironmentName(name: string): Promise<void> {
		name = name.trim();
		if (!name || /[\r\n\x00-\x1f\x7f]/.test(name)) {
			throw new Error(localize('missionControlSharing.invalidName', "Enter an environment name without control characters."));
		}
		if (!this._agentHost.configureMissionControl || this._entitlement.sentiment.hidden) {
			throw new Error(localize('missionControlSharing.unavailable', "GitHub environment sharing is unavailable."));
		}
		if (name === this.environmentName.get()) {
			return;
		}
		this.environmentName.set(name, undefined);
		this._storage.store(environmentNameStorageKey, name, StorageScope.APPLICATION, StorageTarget.MACHINE);
		await this._applyEnvironmentName();
	}

	private async _applyEnvironmentName(): Promise<void> {
		this._generation++;
		this._update.cancel();
		await this._withdraw();
		if (this._enabled) {
			this.state.set('connecting', undefined);
			await this._updates.queue(() => this._configure());
		}
	}

	private _usesMissionControl(): boolean {
		return isGitHubEnvironmentBackend(this._configuration.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
	}

	private _reportWithdrawalError(error: Error): void {
		this._logService.error('Mission Control withdrawal failed', error);
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

	private async _getFileSystemRoots(): Promise<URI[]> {
		if (!this.isWindowsPlatform) {
			return [URI.file('/')];
		}
		const drives = Array.from({ length: 26 }, (_, index) => URI.from({ scheme: Schemas.file, path: `/${String.fromCharCode(65 + index)}:/` }));
		const roots = await Promise.all(drives.map(async drive => {
			try {
				if (!(await this._fileService.stat(drive)).isDirectory) {
					return undefined;
				}
				const canonical = await this._fileService.realpath(drive);
				if (canonical?.fsPath.replace(/\\/g, '/').startsWith('//')) {
					this._logService.info('[Mission Control] Excluding a network-backed drive from local filesystem sharing', drive.toString());
					return undefined;
				}
				return drive;
			} catch (error) {
				if (!(error instanceof Error) || toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
					throw error;
				}
				return undefined;
			}
		}));
		return roots.filter(root => root !== undefined);
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
			const providerId = this._product.defaultChatAgent?.provider?.default?.id ?? 'github';
			const scopes = this._getScopes();
			const defaultAccount = await this._defaultAccountService.getDefaultAccount();
			if (generation !== this._generation || this._store.isDisposed) {
				return;
			}
			this._defaultAccount = defaultAccount;
			let account: AuthenticationSessionAccount | undefined;
			if (defaultAccount) {
				if (defaultAccount.authenticationProvider.id !== providerId) {
					throw new Error(localize('missionControlSharing.githubAccountRequired', "GitHub environment sharing requires a GitHub.com Copilot account."));
				}
				const allSessions = await this._authentication.getSessions(providerId, undefined, undefined, true);
				account = allSessions.find(session => session.id === defaultAccount.sessionId)?.account;
				if (!account) {
					throw new Error(localize('missionControlSharing.accountUnavailable', "The selected Copilot account is unavailable. Sign in to GitHub again to enable environment sharing."));
				}
			}
			const sessionOptions = account ? { account } : undefined;
			let sessions = await this._authentication.getSessions(providerId, [...scopes], sessionOptions, true);
			if (account) {
				const accountId = account.id;
				sessions = sessions.filter(session => session.account.id === accountId);
			}
			if (!sessions.length && interactive && generation === this._generation && !this._store.isDisposed) {
				const session = await this._authentication.createSession(providerId, [...scopes], sessionOptions).catch(error => {
					if (error === 'Cancelled' || (error instanceof Error && error.message === 'Cancelled')) {
						throw new CancellationError();
					}
					throw error;
				});
				if (account && session.account.id !== account.id) {
					throw new Error(localize('missionControlSharing.accountMismatch', "Sign in with the selected Copilot account to enable GitHub environment sharing."));
				}
				sessions = [session];
			}
			if (generation !== this._generation || this._store.isDisposed) {
				return;
			}
			if (new Set(sessions.map(session => session.account.id)).size !== 1) {
				throw new Error(localize('missionControlSharing.accountRequired', "Select a GitHub account for Copilot and sign in with the required permissions to enable environment sharing."));
			}
			const home = this._pathService.userHome({ preferLocal: true });
			const fileSystemRoots = await this._getFileSystemRoots();
			const folders = this._projectFolders ?? this._workspace.getWorkspace().folders.map(folder => folder.uri);
			const projects = (await Promise.all(folders.filter(folder => folder.scheme === Schemas.file).map(async folder => {
				try {
					if ((await this._fileService.stat(folder)).isDirectory) {
						return folder.fsPath;
					}
					this._logService.warn('[Mission Control] Ignoring a recent project path that is not a directory', folder.toString());
				} catch (error) {
					const result = error instanceof Error ? toFileOperationResult(error) : undefined;
					if (result !== FileOperationResult.FILE_NOT_FOUND && result !== FileOperationResult.FILE_NOT_DIRECTORY) {
						throw error;
					}
					this._logService.warn('[Mission Control] Ignoring a missing or invalid recent project directory', folder.toString());
				}
				return undefined;
			}))).filter(project => project !== undefined);
			if (generation !== this._generation || this._store.isDisposed) {
				return;
			}
			this._agentHost.startAgentHost();
			if (generation !== this._generation) {
				return;
			}
			this._accountId = sessions[0].account.id;
			this._accountSessionIds = new Set(sessions.map(session => session.id));
			const localCredentialSetting = this._configuration.inspect<boolean>(MissionControlUseLocalCredentialsSettingId);
			const useLocalCredentials = (localCredentialSetting.userLocalValue ?? localCredentialSetting.applicationValue) === true;
			if (useLocalCredentials) {
				this._logService.warn('[Mission Control] Local credential delegation enabled: same-owner remote clients will run Copilot work with the desktop credential and its permissions');
			}
			const remoteControlPolicySetting = this._configuration.inspect<boolean>(missionControlIgnoreRemoteControlPolicy);
			const ignoreRemoteControlPolicy = (remoteControlPolicySetting.userLocalValue ?? remoteControlPolicySetting.applicationValue) === true;
			if (ignoreRemoteControlPolicy) {
				this._logService.warn('[Mission Control] Device remote-control policy override enabled: registration will omit enterprise remote-control restrictions');
			}
			let cloneRoot: string | undefined;
			for (const settingId of [AgentHostDefaultCloneDirectorySettingId, gitDefaultCloneDirectorySetting]) {
				const setting = this._configuration.inspect<string | null>(settingId);
				const value = setting.userLocalValue !== undefined ? setting.userLocalValue : setting.applicationValue;
				if (value) {
					cloneRoot = value;
					break;
				}
			}
			const repositoryMetadataSetting = this._configuration.inspect<boolean>(missionControlDisableRepositoryMetadata);
			const disableRepositoryMetadata = (repositoryMetadataSetting.userLocalValue ?? repositoryMetadataSetting.applicationValue) === true;
			await this._agentHost.configureMissionControl?.({
				baseUrl: 'https://api.github.com',
				accountId: sessions[0].account.id,
				credential: sessions[0].accessToken,
				roots: [...new Set([...fileSystemRoots.map(root => root.fsPath), home.fsPath, ...projects])],
				projects,
				defaultDirectory: home.fsPath,
				...(cloneRoot ? { cloneRoot } : {}),
				live: true,
				...(this.environmentName.get() ? { name: this.environmentName.get() } : {}),
				...(useLocalCredentials ? { useLocalCredentials: true } : {}),
				...(ignoreRemoteControlPolicy ? { ignoreRemoteControlPolicy: true } : {}),
				...(disableRepositoryMetadata ? { disableRepositoryMetadata: true } : {}),
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
