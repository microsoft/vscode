/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { SandboxHelperChannelName, type ISandboxPermissionRequest, type ISandboxRuntimeConfig } from '../../../../../platform/sandbox/common/sandboxHelperIpc.js';
import { ITerminalSandboxNetworkSettings } from './terminalSandbox.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TerminalChatAgentToolsSettingId } from './terminalChatAgentToolsConfiguration.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { ITrustedDomainService } from '../../../url/common/trustedDomainService.js';
import { localize } from '../../../../../nls.js';

type ISandboxHelperChannel = {
	readonly onDidRequestSandboxPermission: Event<ISandboxPermissionRequest>;
	resetSandbox(): Promise<void>;
	resolveSandboxPermissionRequest(requestId: string, allowed: boolean): Promise<void>;
	wrapWithSandbox(runtimeConfig: ISandboxRuntimeConfig, command: string): Promise<string>;
};

export const ITerminalSandboxService = createDecorator<ITerminalSandboxService>('terminalSandboxService');

export interface ITerminalSandboxService {
	readonly _serviceBrand: undefined;
	isEnabled(): Promise<boolean>;
	promptToAllowWritePath(path: string): Promise<boolean>;
	wrapWithSandbox(runtimeConfig: ISandboxRuntimeConfig, command: string): Promise<string>;
	wrapCommand(command: string): Promise<string>;
	getSandboxConfigPath(forceRefresh?: boolean): Promise<string | undefined>;
	getTempDir(): URI | undefined;
	setNeedsForceUpdateConfigFile(): void;
	resetSandbox(): Promise<void>;
}

type ITerminalSandboxFilesystemSettings = {
	denyRead?: string[];
	allowWrite?: string[];
	denyWrite?: string[];
};

export class TerminalSandboxService extends Disposable implements ITerminalSandboxService {
	readonly _serviceBrand: undefined;
	private _sandboxConfigPath: string | undefined;
	private _needsForceUpdateConfigFile = true;
	private _tempDir: URI | undefined;
	private _sandboxSettingsId: string | undefined;
	private _remoteEnvDetailsPromise: Promise<IRemoteAgentEnvironment | null>;
	private _remoteEnvDetails: IRemoteAgentEnvironment | null = null;
	private _os: OperatingSystem = OS;
	private _defaultWritePaths: string[] = ['~/.npm'];
	private readonly _sandboxPermissionRequestListener = this._register(new MutableDisposable());
	private _sandboxHelperSource: string | undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ITrustedDomainService private readonly _trustedDomainService: ITrustedDomainService,
	) {
		super();
		this._sandboxSettingsId = generateUuid();
		this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();

		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e: IConfigurationChangeEvent | undefined) => {
			// If terminal sandbox settings changed, update sandbox config.
			if (
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem)
			) {
				this.setNeedsForceUpdateConfigFile();
			}
		}));

		this._register(this._trustedDomainService.onDidChangeTrustedDomains(() => {
			this.setNeedsForceUpdateConfigFile();
		}));

		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this.setNeedsForceUpdateConfigFile();
		}));
	}

	public async isEnabled(): Promise<boolean> {
		this._remoteEnvDetails = await this._remoteEnvDetailsPromise;
		this._os = this._remoteEnvDetails ? this._remoteEnvDetails.os : OS;
		if (this._os === OperatingSystem.Windows) {
			return false;
		}
		return this._configurationService.getValue<boolean>(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled);
	}

	public async wrapWithSandbox(runtimeConfig: ISandboxRuntimeConfig, command: string): Promise<string> {
		const service = this._getSandboxHelperService();
		return service.wrapWithSandbox(runtimeConfig, command);
	}

	public async promptToAllowWritePath(path: string): Promise<boolean> {
		if (!(await this.isEnabled())) {
			return false;
		}

		const sandboxPath = path.trim();
		const settingsKey = this._getFileSystemSettingsKey();
		if (!sandboxPath || !settingsKey) {
			return false;
		}

		const target = this._getSandboxConfigurationTarget();
		const inspectedValue = this._configurationService.inspect<ITerminalSandboxFilesystemSettings>(settingsKey);
		const currentSettings = target === ConfigurationTarget.USER_REMOTE ? inspectedValue.userRemoteValue : inspectedValue.userValue;
		const allowWrite = new Set(currentSettings?.allowWrite ?? []);
		const denyWrite = currentSettings?.denyWrite ?? [];

		if (allowWrite.has(sandboxPath) && !denyWrite.includes(sandboxPath)) {
			return false;
		}

		const { confirmed } = await this._dialogService.confirm({
			type: 'warning',
			message: localize('terminalSandboxAllowWritePathMessage', "Allow Sandboxed File Write?"),
			detail: localize('terminalSandboxAllowWritePathDetail', "The sandboxed terminal command was blocked from writing to {0}. Add this path to {1}.allowWrite?", sandboxPath, settingsKey),
			primaryButton: localize('terminalSandboxAllowWritePathPrimary', "&&Allow"),
			cancelButton: localize('terminalSandboxAllowWritePathCancel', "&&Deny")
		});

		if (!confirmed) {
			return false;
		}

		allowWrite.add(sandboxPath);
		await this._configurationService.updateValue(settingsKey, {
			...currentSettings,
			allowWrite: Array.from(allowWrite),
			denyWrite: denyWrite.filter(value => value !== sandboxPath),
		}, target);
		return true;
	}

	public async promptForSandboxPermission(request: ISandboxPermissionRequest): Promise<boolean> {
		const target = request.port === undefined ? request.host : `${request.host}:${request.port}`;
		const { confirmed } = await this._dialogService.confirm({
			type: 'warning',
			message: localize('terminalSandboxPermissionRequestMessage', "Allow Sandboxed Network Access?"),
			detail: localize('terminalSandboxPermissionRequestDetail', "The sandboxed terminal command requested access to {0}.", target),
			primaryButton: localize('terminalSandboxPermissionAllow', "&&Allow"),
			cancelButton: localize('terminalSandboxPermissionDeny', "&&Deny")
		});

		return confirmed;
	}

	public async wrapCommand(command: string): Promise<string> {
		const sandboxSettings = await this._getSandboxSettings();
		if (!sandboxSettings) {
			throw new Error('Sandbox settings not initialized');
		}

		return this.wrapWithSandbox(sandboxSettings, command);
	}

	public getTempDir(): URI | undefined {
		return this._tempDir;
	}

	public setNeedsForceUpdateConfigFile(): void {
		this._needsForceUpdateConfigFile = true;
	}

	public async getSandboxConfigPath(forceRefresh: boolean = false): Promise<string | undefined> {
		if (!this._sandboxConfigPath || forceRefresh || this._needsForceUpdateConfigFile) {
			this._sandboxConfigPath = await this._createSandboxConfig();
			this._needsForceUpdateConfigFile = false;
		}
		return this._sandboxConfigPath;
	}

	public async resetSandbox(): Promise<void> {
		const service = this._getSandboxHelperService();
		await service.resetSandbox();
	}

	private async _createSandboxConfig(): Promise<string | undefined> {
		const sandboxSettings = await this._getSandboxSettings();
		if (!sandboxSettings || !this._tempDir) {
			return undefined;
		}

		const configFileUri = URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);
		this._sandboxConfigPath = configFileUri.path;
		await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, '\t')), { overwrite: true });
		return this._sandboxConfigPath;
	}

	private async _getSandboxSettings(): Promise<ISandboxRuntimeConfig | undefined> {
		if (await this.isEnabled() && !this._tempDir) {
			await this._initTempDir();
		}

		if (!this._tempDir) {
			return undefined;
		}

		const networkSetting = this._configurationService.getValue<ITerminalSandboxNetworkSettings>(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork) ?? {};
		const linuxFileSystemSetting = this._os === OperatingSystem.Linux
			? this._configurationService.getValue<ITerminalSandboxFilesystemSettings>(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem) ?? {}
			: {};
		const macFileSystemSetting = this._os === OperatingSystem.Macintosh
			? this._configurationService.getValue<ITerminalSandboxFilesystemSettings>(TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem) ?? {}
			: {};
		const linuxAllowWrite = this._resolveAllowWritePaths(linuxFileSystemSetting.allowWrite);
		const macAllowWrite = this._resolveAllowWritePaths(macFileSystemSetting.allowWrite);

		let allowedDomains = networkSetting.allowedDomains ?? [];
		if (networkSetting.allowTrustedDomains) {
			allowedDomains = this._addTrustedDomainsToAllowedDomains(allowedDomains);
		}

		return {
			network: {
				allowedDomains,
				deniedDomains: networkSetting.deniedDomains ?? []
			},
			filesystem: {
				denyRead: (this._os === OperatingSystem.Macintosh ? macFileSystemSetting.denyRead : linuxFileSystemSetting.denyRead) || [],
				allowWrite: (this._os === OperatingSystem.Macintosh ? macAllowWrite : linuxAllowWrite) || [],
				denyWrite: (this._os === OperatingSystem.Macintosh ? macFileSystemSetting.denyWrite : linuxFileSystemSetting.denyWrite) || [],
			}
		};
	}

	private _resolveAllowWritePaths(configuredAllowWrite: string[] | undefined): string[] {
		const workspaceFolderPaths = this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri.path);
		return [...new Set([...workspaceFolderPaths, ...this._defaultWritePaths, ...(configuredAllowWrite ?? [])])];
	}

	private async _initTempDir(): Promise<void> {
		if (await this.isEnabled()) {
			this._needsForceUpdateConfigFile = true;
			const remoteEnv = this._remoteEnvDetails || await this._remoteEnvDetailsPromise;
			if (remoteEnv) {
				this._tempDir = remoteEnv.tmpDir;
			} else {
				const environmentService = this._environmentService as IEnvironmentService & { tmpDir?: URI };
				this._tempDir = environmentService.tmpDir;
			}
			if (this._tempDir) {
				this._defaultWritePaths.push(this._tempDir.path);
			}
			if (!this._tempDir) {
				this._logService.warn('TerminalSandboxService: Cannot create sandbox settings file because no tmpDir is available in this environment');
			}
		}
	}

	private _addTrustedDomainsToAllowedDomains(allowedDomains: string[]): string[] {
		const allowedDomainsSet = new Set(allowedDomains);
		for (const domain of this._trustedDomainService.trustedDomains) {
			try {
				const uri = new URL(domain);
				allowedDomainsSet.add(uri.hostname);
			} catch {
				if (domain !== '*') {
					allowedDomainsSet.add(domain);
				}
			}
		}
		return Array.from(allowedDomainsSet);
	}

	private _getSandboxConfigurationTarget(): ConfigurationTarget {
		return this._remoteAgentService.getConnection() ? ConfigurationTarget.USER_REMOTE : ConfigurationTarget.USER;
	}

	private _getFileSystemSettingsKey(): string | undefined {
		if (this._os === OperatingSystem.Linux) {
			return TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem;
		}

		if (this._os === OperatingSystem.Macintosh) {
			return TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem;
		}

		return undefined;
	}

	private _getSandboxHelperService(): ISandboxHelperChannel {
		const connection = this._remoteAgentService.getConnection();
		const channel = connection
			? connection.getChannel(SandboxHelperChannelName)
			: this._instantiationService.invokeFunction(accessor => accessor.get(IMainProcessService)).getChannel(SandboxHelperChannelName);
		const service = ProxyChannel.toService<ISandboxHelperChannel>(channel);
		const source = connection ? `remote:${connection.remoteAuthority}` : 'local';

		if (this._sandboxHelperSource !== source) {
			this._sandboxHelperSource = source;
			this._sandboxPermissionRequestListener.value = service.onDidRequestSandboxPermission(request => {
				void this._handleSandboxPermissionRequest(service, request);
			});
		}

		return service;
	}

	private async _handleSandboxPermissionRequest(service: ISandboxHelperChannel, request: ISandboxPermissionRequest): Promise<void> {
		let allowed = false;

		try {
			allowed = await this.promptForSandboxPermission(request);
			if (allowed) {
				await this._persistAllowedSandboxDomain(request.host);
			}
		} catch (error) {
			this._logService.error('TerminalSandboxService: Failed to prompt for sandbox permission', error);
		}

		try {
			await service.resolveSandboxPermissionRequest(request.requestId, allowed);
		} catch (error) {
			this._logService.error('TerminalSandboxService: Failed to resolve sandbox permission request', error);
		}
	}

	private async _persistAllowedSandboxDomain(host: string): Promise<void> {
		const target = this._getSandboxConfigurationTarget();
		const inspectedValue = this._configurationService.inspect<ITerminalSandboxNetworkSettings>(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork);
		const currentSettings = target === ConfigurationTarget.USER_REMOTE ? inspectedValue.userRemoteValue : inspectedValue.userValue;
		const allowedDomains = new Set(currentSettings?.allowedDomains ?? []);
		const deniedDomains = (currentSettings?.deniedDomains ?? []).filter(domain => domain !== host);

		if (allowedDomains.has(host) && deniedDomains.length === (currentSettings?.deniedDomains ?? []).length) {
			return;
		}

		allowedDomains.add(host);

		await this._configurationService.updateValue(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			...currentSettings,
			allowedDomains: Array.from(allowedDomains),
			deniedDomains,
		}, target);
	}
}
