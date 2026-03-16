/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { dirname, posix, win32 } from '../../../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { SandboxHelperChannelName, type ISandboxPermissionRequest, type ISandboxRuntimeConfig } from '../../../../../platform/sandbox/common/sandboxHelperIpc.js';
import { ISandboxHelperService } from '../../../../../platform/sandbox/common/sandboxHelperService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ITerminalSandboxNetworkSettings } from './terminalSandbox.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TerminalChatAgentToolsSettingId } from './terminalChatAgentToolsConfiguration.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { ITrustedDomainService } from '../../../url/common/trustedDomainService.js';
import { localize } from '../../../../../nls.js';

export const ITerminalSandboxService = createDecorator<ITerminalSandboxService>('terminalSandboxService');

export interface ITerminalSandboxService {
	readonly _serviceBrand: undefined;
	isEnabled(): Promise<boolean>;
	promptToAllowWritePath(path: string): Promise<boolean>;
	wrapWithSandbox(runtimeConfig: ISandboxRuntimeConfig, command: string): Promise<string>;
	wrapCommand(command: string): Promise<string>;
	getTempDir(): URI | undefined;
}

export class TerminalSandboxService extends Disposable implements ITerminalSandboxService {
	readonly _serviceBrand: undefined;
	private _rgPath: string | undefined;
	private _runtimePathsResolved = false;
	private _tempDir: URI | undefined;
	private _remoteEnvDetailsPromise: Promise<IRemoteAgentEnvironment | null>;
	private _remoteEnvDetails: IRemoteAgentEnvironment | null = null;
	private _appRoot: string;
	private _os: OperatingSystem = OS;
	private _defaultWritePaths: string[] = ['~/.npm'];
	private readonly _sandboxPermissionRequestListener = this._register(new MutableDisposable());
	private _sandboxHelperSource: string | undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ISandboxHelperService private readonly _localSandboxHelperService: ISandboxHelperService,
		@ITrustedDomainService private readonly _trustedDomainService: ITrustedDomainService,
	) {
		super();
		this._appRoot = dirname(FileAccess.asFileUri('').path);
		this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();

		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e: IConfigurationChangeEvent | undefined) => {
			if (e && this._affectsSandboxConfiguration(e)) {
				this._handleSandboxConfigurationChange();
			}
		}));

		this._register(this._trustedDomainService.onDidChangeTrustedDomains(() => {
			this._handleSandboxConfigurationChange();
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
		const inspectedValue = this._configurationService.inspect<{ denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }>(settingsKey);
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

	public async wrapWithSandbox(runtimeConfig: ISandboxRuntimeConfig, command: string): Promise<string> {
		try {
			const service = this._getSandboxHelperService();
			return await service.wrapWithSandbox(runtimeConfig, command);
		} catch (error) {
			this._logService.error('TerminalSandboxService: Failed to wrap command with sandbox', error);
			return command;
		}
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
		await this._resolveRuntimePaths();
		const sandboxSettings = await this._getSandboxSettings();
		if (!sandboxSettings) {
			throw new Error('Sandbox settings not initialized');
		}

		if (!this._tempDir) {
			await this._initTempDir();
		}
		if (!this._tempDir) {
			throw new Error('Sandbox temp dir not initialized');
		}
		if (!this._rgPath) {
			throw new Error('Ripgrep path not resolved');
		}
		const sandboxRuntimeConfig: ISandboxRuntimeConfig = {
			...sandboxSettings,
			ripgrep: {
				command: this._rgPath,
				args: undefined,
			}
		};
		// Quote shell arguments so the wrapped command cannot break out of the outer shell.
		let envDetails = `TMPDIR="${this._tempDir.path}"`;
		if (!this._remoteEnvDetails) {
			envDetails = `ELECTRON_RUN_AS_NODE=1 ${envDetails}`;
		}

		// Use ELECTRON_RUN_AS_NODE=1 to make Electron executable behave as Node.js
		// TMPDIR must be set as environment variable before the command
		// Initialize the sandbox manager before returning the wrapped command so permission prompts are wired up.
		try {
			return await this._getSandboxHelperService().wrapWithSandbox(sandboxRuntimeConfig, command, envDetails);
		} catch (error) {
			this._logService.error('TerminalSandboxService: Failed to initialize sandbox', error);
			return command;
		}
	}

	public getTempDir(): URI | undefined {
		return this._tempDir;
	}

	private async _resolveRuntimePaths(): Promise<void> {
		if (this._runtimePathsResolved) {
			return;
		}
		this._runtimePathsResolved = true;
		const remoteEnv = this._remoteEnvDetails || await this._remoteEnvDetailsPromise;
		if (remoteEnv) {

			this._appRoot = remoteEnv.appRoot.path;
		}
		this._rgPath = this._pathJoin(this._appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg');
	}

	private async _resetSandbox(): Promise<void> {
		const service = this._getSandboxHelperService();
		await service.resetSandbox();
	}

	private _handleSandboxConfigurationChange(): void {
		this._resetSandbox().catch(error => {
			this._logService.error('TerminalSandboxService: Failed to reset sandbox after configuration change', error);
		});
	}

	private async _getSandboxSettings(): Promise<ISandboxRuntimeConfig | undefined> {
		const networkSetting = this._configurationService.getValue<ITerminalSandboxNetworkSettings>(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork) ?? {};
		const linuxFileSystemSetting = this._os === OperatingSystem.Linux
			? this._configurationService.getValue<{ denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }>(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem) ?? {}
			: {};
		const macFileSystemSetting = this._os === OperatingSystem.Macintosh
			? this._configurationService.getValue<{ denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }>(TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem) ?? {}
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
				denyRead: this._os === OperatingSystem.Macintosh ? (macFileSystemSetting.denyRead ?? []) : (linuxFileSystemSetting.denyRead ?? []),
				allowWrite: this._os === OperatingSystem.Macintosh ? macAllowWrite : linuxAllowWrite,
				denyWrite: this._os === OperatingSystem.Macintosh ? (macFileSystemSetting.denyWrite ?? []) : (linuxFileSystemSetting.denyWrite ?? []),
			}
		};
	}

	// Joins path segments according to the current OS.
	private _pathJoin = (...segments: string[]) => {
		const path = this._os === OperatingSystem.Windows ? win32 : posix;
		return path.join(...segments);
	};

	private _resolveAllowWritePaths(configuredAllowWrite: string[] | undefined): string[] {
		const workspaceFolderPaths = this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri.path);
		return [...new Set([...workspaceFolderPaths, ...this._defaultWritePaths, ...(configuredAllowWrite ?? [])])];
	}

	private async _initTempDir(): Promise<void> {
		if (await this.isEnabled()) {
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

	private _affectsSandboxConfiguration(e: IConfigurationChangeEvent): boolean {
		return e.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled)
			|| e.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork)
			|| e.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem)
			|| e.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem);
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

	private _getSandboxHelperService(): ISandboxHelperService {
		const connection = this._remoteAgentService.getConnection();
		const service = connection
			? ProxyChannel.toService<ISandboxHelperService>(connection.getChannel(SandboxHelperChannelName))
			: this._localSandboxHelperService;
		const source = connection ? `remote:${connection.remoteAuthority}` : 'local';

		if (this._sandboxHelperSource !== source) {
			this._sandboxHelperSource = source;
			this._sandboxPermissionRequestListener.value = service.onDidRequestSandboxPermission(request => {
				void this._handleSandboxPermissionRequest(service, request);
			});
		}

		return service;
	}

	private async _handleSandboxPermissionRequest(service: ISandboxHelperService, request: ISandboxPermissionRequest): Promise<void> {
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
