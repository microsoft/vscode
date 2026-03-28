/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { dirname, posix, win32 } from '../../../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TerminalChatAgentToolsSettingId } from './terminalChatAgentToolsConfiguration.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { ITrustedDomainService } from '../../../url/common/trustedDomainService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ILifecycleService, WillShutdownJoinerOrder } from '../../../../services/lifecycle/common/lifecycle.js';
import { ISandboxDependencyStatus, ISandboxHelperService } from '../../../../../platform/sandbox/common/sandboxHelperService.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ChatElicitationRequestPart } from '../../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatModel } from '../../../chat/common/model/chatModel.js';
import { ElicitationState, IChatService } from '../../../chat/common/chatService/chatService.js';
import { SANDBOX_HELPER_CHANNEL_NAME, SandboxHelperChannelClient } from '../../../../../platform/sandbox/common/sandboxHelperIpc.js';

export const ITerminalSandboxService = createDecorator<ITerminalSandboxService>('terminalSandboxService');

export interface ITerminalSandboxResolvedNetworkDomains {
	allowedDomains: string[];
	deniedDomains: string[];
}

export const enum TerminalSandboxPrerequisiteCheck {
	Config = 'config',
	Dependencies = 'dependencies',
}

export interface ITerminalSandboxPrerequisiteCheckResult {
	enabled: boolean;
	sandboxConfigPath: string | undefined;
	failedCheck: TerminalSandboxPrerequisiteCheck | undefined;
	missingDependencies?: string[];
}

/**
 * Abstraction over terminal operations needed by the install flow.
 * Provided by the browser-layer caller so the common-layer service
 * does not import browser types directly.
 */
export interface ISandboxDependencyInstallTerminal {
	sendText(text: string, addNewLine?: boolean): Promise<void>;
	focus(): void;
	capabilities: {
		get(id: TerminalCapability.CommandDetection): { onCommandFinished: Event<{ exitCode: number | undefined }> } | undefined;
		onDidAddCapability: Event<{ id: TerminalCapability }>;
	};
	onDidInputData: Event<string>;
	onDisposed: Event<unknown>;
}

/**
 * Context passed to the password prompt during dependency installation.
 */
interface ISandboxDependencyInstallTerminalContext {
	focusTerminal(): Promise<void>;
	onDidInputData: Event<string>;
	onDisposed: Event<unknown>;
	didSendInstallCommand(): boolean;
}

export interface ISandboxDependencyInstallOptions {
	/**
	 * Creates or obtains a terminal for running the install command.
	 */
	createTerminal(): Promise<ISandboxDependencyInstallTerminal>;
	/**
	 * Focuses the terminal for password entry.
	 */
	focusTerminal(terminal: ISandboxDependencyInstallTerminal): Promise<void>;
}

export interface ISandboxDependencyInstallResult {
	exitCode: number | undefined;
}

export interface ITerminalSandboxService {
	readonly _serviceBrand: undefined;
	isEnabled(): Promise<boolean>;
	getOS(): Promise<OperatingSystem>;
	checkForSandboxingPrereqs(forceRefresh?: boolean): Promise<ITerminalSandboxPrerequisiteCheckResult>;
	wrapCommand(command: string, requestUnsandboxedExecution?: boolean): string;
	getSandboxConfigPath(forceRefresh?: boolean): Promise<string | undefined>;
	getTempDir(): URI | undefined;
	setNeedsForceUpdateConfigFile(): void;
	getResolvedNetworkDomains(): ITerminalSandboxResolvedNetworkDomains;
	getMissingSandboxDependencies(): Promise<string[]>;
	installMissingSandboxDependencies(missingDependencies: string[], sessionResource: URI | undefined, token: CancellationToken, options: ISandboxDependencyInstallOptions): Promise<ISandboxDependencyInstallResult>;
}

export class TerminalSandboxService extends Disposable implements ITerminalSandboxService {
	readonly _serviceBrand: undefined;
	private _srtPath: string | undefined;
	private _rgPath: string | undefined;
	private _srtPathResolved = false;
	private _execPath?: string;
	private _sandboxConfigPath: string | undefined;
	private _sandboxDependencyStatus: ISandboxDependencyStatus | undefined;
	private _needsForceUpdateConfigFile = true;
	private _tempDir: URI | undefined;
	private _sandboxSettingsId: string | undefined;
	private _remoteEnvDetailsPromise: Promise<IRemoteAgentEnvironment | null>;
	private _remoteEnvDetails: IRemoteAgentEnvironment | null = null;
	private _appRoot: string;
	private _os: OperatingSystem = OS;
	private _defaultWritePaths: string[] = ['~/.npm'];
	private static readonly _sandboxTempDirName = 'tmp';

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ITrustedDomainService private readonly _trustedDomainService: ITrustedDomainService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IProductService private readonly _productService: IProductService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@ISandboxHelperService private readonly _sandboxHelperService: ISandboxHelperService,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();
		this._appRoot = dirname(FileAccess.asFileUri('').path);
		// Get the node executable path from native environment service if available (Electron's execPath with ELECTRON_RUN_AS_NODE)
		const nativeEnv = this._environmentService as IEnvironmentService & { execPath?: string };
		this._execPath = nativeEnv.execPath;
		this._sandboxSettingsId = generateUuid();
		this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();

		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e: IConfigurationChangeEvent | undefined) => {
			// If terminal sandbox settings changed, update sandbox config.
			if (
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkAllowedDomains) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkDeniedDomains) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkAllowTrustedDomains) ||
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

		this._register(this._lifecycleService.onWillShutdown(e => {
			if (!this._tempDir) {
				return;
			}
			e.join(this._cleanupSandboxTempDir(), {
				id: 'join.deleteFilesInSandboxTempDir',
				label: localize('deleteFilesInSandboxTempDir', "Delete Files in Sandbox Temp Dir"),
				order: WillShutdownJoinerOrder.Default
			});
		}));
	}

	public async isEnabled(): Promise<boolean> {
		return await this._isSandboxConfiguredEnabled();
	}

	public async getOS(): Promise<OperatingSystem> {
		this._remoteEnvDetails = await this._remoteEnvDetailsPromise;
		this._os = this._remoteEnvDetails ? this._remoteEnvDetails.os : OS;
		return this._os;
	}

	public wrapCommand(command: string, requestUnsandboxedExecution?: boolean): string {
		if (!this._sandboxConfigPath || !this._tempDir) {
			throw new Error('Sandbox config path or temp dir not initialized');
		}
		// If requestUnsandboxedExecution is true, need to ensure env variables set during sandbox still apply.
		if (requestUnsandboxedExecution) {
			return this._tempDir?.path ? `(TMPDIR="${this._tempDir.path}"; export TMPDIR; ${command})` : command;
		}

		if (!this._execPath) {
			throw new Error('Executable path not set to run sandbox commands');
		}
		if (!this._srtPath) {
			throw new Error('Sandbox runtime path not resolved');
		}
		if (!this._rgPath) {
			throw new Error('Ripgrep path not resolved');
		}
		// Use ELECTRON_RUN_AS_NODE=1 to make Electron executable behave as Node.js
		// TMPDIR must be set as environment variable before the command
		// Quote shell arguments so the wrapped command cannot break out of the outer shell.
		const wrappedCommand = `PATH="$PATH:${dirname(this._rgPath)}" TMPDIR="${this._tempDir.path}" CLAUDE_TMPDIR="${this._tempDir.path}" "${this._execPath}" "${this._srtPath}" --settings "${this._sandboxConfigPath}" -c ${this._quoteShellArgument(command)}`;
		if (this._remoteEnvDetails) {
			return `${wrappedCommand}`;
		}
		return `ELECTRON_RUN_AS_NODE=1 ${wrappedCommand}`;
	}

	public getTempDir(): URI | undefined {
		return this._tempDir;
	}

	public setNeedsForceUpdateConfigFile(): void {
		this._needsForceUpdateConfigFile = true;
	}

	public async checkForSandboxingPrereqs(forceRefresh: boolean = false): Promise<ITerminalSandboxPrerequisiteCheckResult> {
		if (!(await this._isSandboxConfiguredEnabled())) {
			return {
				enabled: false,
				sandboxConfigPath: undefined,
				failedCheck: undefined,
			};
		}

		const sandboxConfigPath = await this.getSandboxConfigPath(forceRefresh);
		if (!sandboxConfigPath) {
			return {
				enabled: true,
				sandboxConfigPath,
				failedCheck: TerminalSandboxPrerequisiteCheck.Config,
			};
		}

		if (!(await this._checkSandboxDependencies(forceRefresh))) {
			return {
				enabled: true,
				sandboxConfigPath,
				failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
				missingDependencies: await this.getMissingSandboxDependencies(),
			};
		}

		return {
			enabled: true,
			sandboxConfigPath,
			failedCheck: undefined,
		};
	}

	public async getSandboxConfigPath(forceRefresh: boolean = false): Promise<string | undefined> {
		if (!(await this._isSandboxConfiguredEnabled())) {
			return undefined;
		}
		await this._resolveSrtPath();
		if (!this._sandboxConfigPath || forceRefresh || this._needsForceUpdateConfigFile) {
			this._sandboxConfigPath = await this._createSandboxConfig();
			this._needsForceUpdateConfigFile = false;
		}
		return this._sandboxConfigPath;
	}

	private async _checkSandboxDependencies(forceRefresh = false): Promise<boolean> {
		const os = await this.getOS();
		if (os === OperatingSystem.Windows) {
			return false;
		}

		const sandboxDependencyStatus = await this._resolveSandboxDependencyStatus(forceRefresh);
		this._sandboxDependencyStatus = sandboxDependencyStatus;

		if (sandboxDependencyStatus && !sandboxDependencyStatus.bubblewrapInstalled) {
			this._logService.warn('TerminalSandboxService: bubblewrap (bwrap) is not installed');
		}
		if (sandboxDependencyStatus && !sandboxDependencyStatus.socatInstalled) {
			this._logService.warn('TerminalSandboxService: socat is not installed');
		}

		return sandboxDependencyStatus ? sandboxDependencyStatus.bubblewrapInstalled && sandboxDependencyStatus.socatInstalled : true;
	}

	public async getMissingSandboxDependencies(): Promise<string[]> {
		const os = await this.getOS();
		if (os === OperatingSystem.Windows) {
			return [];
		}

		if (!this._sandboxDependencyStatus || !this._sandboxDependencyStatus.bubblewrapInstalled || !this._sandboxDependencyStatus.socatInstalled) {
			this._sandboxDependencyStatus = await this._resolveSandboxDependencyStatus(true);
		}

		const missing: string[] = [];
		if (this._sandboxDependencyStatus && !this._sandboxDependencyStatus.bubblewrapInstalled) {
			missing.push('bubblewrap');
		}
		if (this._sandboxDependencyStatus && !this._sandboxDependencyStatus.socatInstalled) {
			missing.push('socat');
		}
		return missing;
	}

	public async installMissingSandboxDependencies(missingDependencies: string[], sessionResource: URI | undefined, token: CancellationToken, options: ISandboxDependencyInstallOptions): Promise<ISandboxDependencyInstallResult> {
		const depsList = missingDependencies.join(' ');
		const installCommand = `sudo apt install -y ${depsList}`;
		const instance = await options.createTerminal();

		// Wait for the install command to finish so the chat can proceed automatically.
		let installCommandSent = false;
		const completionPromise = new Promise<number | undefined>(resolve => {
			const store = new DisposableStore();
			let resolved = false;
			const resolveOnce = (code: number | undefined) => {
				if (resolved) {
					return;
				}
				resolved = true;
				store.dispose();
				resolve(code);
			};

			const attachListener = () => {
				const detection = instance.capabilities.get(TerminalCapability.CommandDetection);
				if (detection) {
					store.add(detection.onCommandFinished(cmd => resolveOnce(cmd.exitCode)));
				}
			};

			attachListener();
			store.add(instance.capabilities.onDidAddCapability(e => {
				if (e.id === TerminalCapability.CommandDetection) {
					attachListener();
				}
			}));

			// Handle terminal disposal
			store.add(instance.onDisposed(() => resolveOnce(undefined)));

			// Handle cancellation
			store.add(token.onCancellationRequested(() => resolveOnce(undefined)));

			// Safety timeout — 5 minutes should be more than enough for apt install
			const safetyTimeout = timeout(5 * 60 * 1000);
			store.add({ dispose: () => safetyTimeout.cancel() });
			safetyTimeout.then(() => resolveOnce(undefined));

			const passwordPrompt = this._createMissingDependencyPasswordPrompt(sessionResource, {
				focusTerminal: () => options.focusTerminal(instance),
				onDidInputData: instance.onDidInputData,
				onDisposed: instance.onDisposed,
				didSendInstallCommand: () => installCommandSent,
			}, token);
			store.add(passwordPrompt);
		});

		// Send the command after listeners are attached so we never miss the event.
		// Set installCommandSent only after sendText completes because sendText
		// fires onDidInputData internally, and the password-prompt listener would
		// dismiss the elicitation prematurely if the flag were already true.
		await instance.sendText(installCommand, true);
		installCommandSent = true;

		return { exitCode: await completionPromise };
	}

	/**
	 * Shows a chat elicitation that keeps the "Install" flow grounded in chat while
	 * the user focuses the terminal and types a sudo password.
	 */
	private _createMissingDependencyPasswordPrompt(sessionResource: URI | undefined, promptContext: ISandboxDependencyInstallTerminalContext, token: CancellationToken): DisposableStore {
		const chatModel = sessionResource && this._chatService.getSession(sessionResource);
		if (!(chatModel instanceof ChatModel)) {
			return new DisposableStore();
		}

		const request = chatModel.getRequests().at(-1);
		if (!request) {
			return new DisposableStore();
		}

		const part = new ChatElicitationRequestPart(
			localize('runInTerminal.missingDeps.passwordPromptTitle', "The terminal is awaiting input."),
			new MarkdownString(localize(
				'runInTerminal.missingDeps.passwordPromptMessage',
				"Installing missing sandbox dependencies may prompt for your sudo password. Select Focus Terminal to type it in the terminal."
			)),
			'',
			localize('runInTerminal.missingDeps.focusTerminal', 'Focus Terminal'),
			undefined,
			async () => {
				await promptContext.focusTerminal();
				return ElicitationState.Pending;
			}
		);
		chatModel.acceptResponseProgress(request, part);

		const store = new DisposableStore();
		const disposePrompt = () => store.dispose();
		store.add({ dispose: () => part.hide() });
		store.add(token.onCancellationRequested(disposePrompt));
		store.add(promptContext.onDisposed(disposePrompt));
		store.add(promptContext.onDidInputData(data => {
			if (promptContext.didSendInstallCommand() && data.length > 0) {
				disposePrompt();
			}
		}));
		return store;
	}

	private _quoteShellArgument(value: string): string {
		return `'${value.replace(/'/g, `'\\''`)}'`;
	}

	private async _isSandboxConfiguredEnabled(): Promise<boolean> {
		const os = await this.getOS();
		if (os === OperatingSystem.Windows) {
			return false;
		}
		return this._configurationService.getValue<boolean>(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled);
	}

	private async _resolveSrtPath(): Promise<void> {
		if (this._srtPathResolved) {
			return;
		}
		this._srtPathResolved = true;
		const remoteEnv = this._remoteEnvDetails || await this._remoteEnvDetailsPromise;
		if (remoteEnv) {
			this._appRoot = remoteEnv.appRoot.path;
			this._execPath = remoteEnv.execPath;
		}
		this._srtPath = this._pathJoin(this._appRoot, 'node_modules', '@anthropic-ai', 'sandbox-runtime', 'dist', 'cli.js');
		this._rgPath = this._pathJoin(this._appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg');
	}

	private async _createSandboxConfig(): Promise<string | undefined> {

		if (await this.isEnabled() && !this._tempDir) {
			await this._initTempDir();
		}
		if (this._tempDir) {
			const allowedDomainsSetting = this._configurationService.getValue<string[]>(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkAllowedDomains) ?? [];
			const deniedDomainsSetting = this._configurationService.getValue<string[]>(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkDeniedDomains) ?? [];
			const allowTrustedDomains = this._configurationService.getValue<boolean>(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkAllowTrustedDomains) ?? false;
			const linuxFileSystemSetting = this._os === OperatingSystem.Linux
				? this._configurationService.getValue<{ denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }>(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem) ?? {}
				: {};
			const macFileSystemSetting = this._os === OperatingSystem.Macintosh
				? this._configurationService.getValue<{ denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }>(TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem) ?? {}
				: {};
			const configFileUri = URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);
			const linuxAllowWrite = this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite);
			const macAllowWrite = this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite);

			let allowedDomains = allowedDomainsSetting;
			if (allowTrustedDomains) {
				allowedDomains = this._addTrustedDomainsToAllowedDomains(allowedDomains);
			}

			const sandboxSettings = {
				network: {
					allowedDomains,
					deniedDomains: deniedDomainsSetting
				},
				filesystem: {
					denyRead: this._os === OperatingSystem.Macintosh ? macFileSystemSetting.denyRead : linuxFileSystemSetting.denyRead,
					allowWrite: this._os === OperatingSystem.Macintosh ? macAllowWrite : linuxAllowWrite,
					denyWrite: this._os === OperatingSystem.Macintosh ? macFileSystemSetting.denyWrite : linuxFileSystemSetting.denyWrite,
				}
			};
			this._sandboxConfigPath = configFileUri.path;
			await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, '\t')), { overwrite: true });
			return this._sandboxConfigPath;
		}
		return undefined;
	}

	// Joins path segments according to the current OS.
	private _pathJoin = (...segments: string[]) => {
		const path = this._os === OperatingSystem.Windows ? win32 : posix;
		return path.join(...segments);
	};

	private async _initTempDir(): Promise<void> {
		if (await this.isEnabled()) {
			this._needsForceUpdateConfigFile = true;
			const remoteEnv = this._remoteEnvDetails || await this._remoteEnvDetailsPromise;
			this._tempDir = this._getSandboxTempDirPath(remoteEnv);
			if (this._tempDir) {
				await this._fileService.createFolder(this._tempDir);
				this._defaultWritePaths.push(this._tempDir.path);
			}
			if (!this._tempDir) {
				this._logService.warn('TerminalSandboxService: Cannot create sandbox settings file because no tmpDir is available in this environment');
			}
		}
	}

	private async _cleanupSandboxTempDir(): Promise<void> {
		if (!this._tempDir) {
			return;
		}
		try {
			await this._fileService.del(this._tempDir, { recursive: true, useTrash: false });
		} catch (error) {
			this._logService.warn('TerminalSandboxService: Failed to delete sandbox temp dir', error);
		}
	}

	private _getSandboxTempDirPath(remoteEnv: IRemoteAgentEnvironment | null): URI | undefined {
		const sandboxTempDirName = this._getSandboxWindowTempDirName();
		if (remoteEnv?.userHome) {
			const sandboxRoot = URI.joinPath(remoteEnv.userHome, this._productService.serverDataFolderName ?? this._productService.dataFolderName, TerminalSandboxService._sandboxTempDirName);
			return sandboxTempDirName ? URI.joinPath(sandboxRoot, sandboxTempDirName) : sandboxRoot;
		}

		const nativeEnv = this._environmentService as IEnvironmentService & { userHome?: URI };
		if (nativeEnv.userHome) {
			const sandboxRoot = URI.joinPath(nativeEnv.userHome, this._productService.dataFolderName, TerminalSandboxService._sandboxTempDirName);
			return sandboxTempDirName ? URI.joinPath(sandboxRoot, sandboxTempDirName) : sandboxRoot;
		}

		return undefined;
	}

	private _getSandboxWindowTempDirName(): string | undefined {
		const workbenchEnv = this._environmentService as IEnvironmentService & { window?: { id?: number } };
		const windowId = workbenchEnv.window?.id;
		return typeof windowId === 'number' ? `tmp_vscode_${windowId}` : undefined;
	}

	public getResolvedNetworkDomains(): ITerminalSandboxResolvedNetworkDomains {
		let allowedDomains = this._configurationService.getValue<string[]>(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkAllowedDomains) ?? [];
		const deniedDomains = this._configurationService.getValue<string[]>(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkDeniedDomains) ?? [];
		const allowTrustedDomains = this._configurationService.getValue<boolean>(TerminalChatAgentToolsSettingId.TerminalSandboxNetworkAllowTrustedDomains) ?? false;
		if (allowTrustedDomains) {
			allowedDomains = this._addTrustedDomainsToAllowedDomains(allowedDomains);
		}
		return {
			allowedDomains,
			deniedDomains
		};
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

	private _updateAllowWritePathsWithWorkspaceFolders(configuredAllowWrite: string[] | undefined): string[] {
		const workspaceFolderPaths = this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri.path);
		return [...new Set([...workspaceFolderPaths, ...this._defaultWritePaths, ...(configuredAllowWrite ?? [])])];
	}

	private async _resolveSandboxDependencyStatus(forceRefresh = false): Promise<ISandboxDependencyStatus | undefined> {
		if (!forceRefresh && this._sandboxDependencyStatus) {
			return this._sandboxDependencyStatus;
		}

		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, channel => {
				const sandboxHelper = new SandboxHelperChannelClient(channel);
				return sandboxHelper.checkSandboxDependencies();
			});
		}

		return this._sandboxHelperService.checkSandboxDependencies();
	}

}
