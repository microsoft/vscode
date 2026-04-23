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
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TerminalChatAgentToolsSettingId } from './terminalChatAgentToolsConfiguration.js';
import { AgentNetworkDomainSettingId } from '../../../../../platform/networkFilter/common/settings.js';
import { matchesDomainPattern, normalizeDomain } from '../../../../../platform/networkFilter/common/domainMatcher.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
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
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck, type ISandboxDependencyInstallOptions, type ISandboxDependencyInstallResult, type ITerminalSandboxPrerequisiteCheckResult, type ITerminalSandboxResolvedNetworkDomains, type ITerminalSandboxWrapResult } from '../../../../../platform/sandbox/common/terminalSandboxService.js';

export { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck } from '../../../../../platform/sandbox/common/terminalSandboxService.js';
export type { ISandboxDependencyInstallOptions, ISandboxDependencyInstallResult, ISandboxDependencyInstallTerminal, ITerminalSandboxPrerequisiteCheckResult, ITerminalSandboxResolvedNetworkDomains, ITerminalSandboxWrapResult } from '../../../../../platform/sandbox/common/terminalSandboxService.js';

/**
 * Context passed to the password prompt during dependency installation.
 */
interface ISandboxDependencyInstallTerminalContext {
	focusTerminal(): Promise<void>;
	onDidInputData: Event<string>;
	onDisposed: Event<unknown>;
	didSendInstallCommand(): boolean;
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
	private static readonly _urlRegex = /(?:https?|wss?):\/\/[^\s'"`|&;<>]+/gi;
	private static readonly _sshRemoteRegex = /(?:^|[\s'"`])(?:[^\s@:'"`]+@)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::[^\s'"`|&;<>]+)(?=$|[\s'"`|&;<>])/gi;
	private static readonly _hostRegex = /(?:^|[\s'"`(=])([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::\d+)?(?=(?:\/[^\s'"`|&;<>]*)?(?:$|[\s'"`)\]|,;|&<>]))/gi;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
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
				e?.affectsConfiguration(AgentSandboxSettingId.AgentSandboxEnabled) ||
				e?.affectsConfiguration(AgentSandboxSettingId.DeprecatedAgentSandboxEnabled) ||
				e?.affectsConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains) ||
				e?.affectsConfiguration(AgentNetworkDomainSettingId.DeprecatedSandboxAllowedNetworkDomains) ||
				e?.affectsConfiguration(AgentNetworkDomainSettingId.DeprecatedOldAllowedNetworkDomains) ||
				e?.affectsConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains) ||
				e?.affectsConfiguration(AgentNetworkDomainSettingId.DeprecatedSandboxDeniedNetworkDomains) ||
				e?.affectsConfiguration(AgentNetworkDomainSettingId.DeprecatedOldDeniedNetworkDomains) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxLinuxFileSystem) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxMacFileSystem) ||
				e?.affectsConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime)
			) {
				this.setNeedsForceUpdateConfigFile();
			}
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

	public wrapCommand(command: string, requestUnsandboxedExecution?: boolean, shell?: string): ITerminalSandboxWrapResult {
		if (!this._sandboxConfigPath || !this._tempDir) {
			throw new Error('Sandbox config path or temp dir not initialized');
		}

		const blockedDomainResult = requestUnsandboxedExecution ? { blockedDomains: [], deniedDomains: [] } : this._getBlockedDomains(command);
		if (!requestUnsandboxedExecution && blockedDomainResult.blockedDomains.length > 0) {
			return {
				command: this._wrapUnsandboxedCommand(command, shell),
				isSandboxWrapped: false,
				blockedDomains: blockedDomainResult.blockedDomains,
				deniedDomains: blockedDomainResult.deniedDomains,
				requiresUnsandboxConfirmation: true,
			};
		}

		// If requestUnsandboxedExecution is true, need to ensure env variables set during sandbox still apply.
		if (requestUnsandboxedExecution) {
			return {
				command: this._wrapUnsandboxedCommand(command, shell),
				isSandboxWrapped: false,
			};
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
			return {
				command: wrappedCommand,
				isSandboxWrapped: true,
			};
		}
		return {
			command: `ELECTRON_RUN_AS_NODE=1 ${wrappedCommand}`,
			isSandboxWrapped: true,
		};
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

	private _wrapUnsandboxedCommand(command: string, shell?: string): string {
		if (!this._tempDir?.path) {
			return command;
		}
		if (!shell) {
			return `(TMPDIR="${this._tempDir.path}"; export TMPDIR; ${command})`;
		}
		return `env TMPDIR="${this._tempDir.path}" ${this._quoteShellArgument(shell)} -c ${this._quoteShellArgument(command)}`;
	}

	private _getBlockedDomains(command: string): { blockedDomains: string[]; deniedDomains: string[] } {
		const domains = this._extractDomains(command);
		if (domains.length === 0) {
			return { blockedDomains: [], deniedDomains: [] };
		}

		const { allowedDomains, deniedDomains } = this.getResolvedNetworkDomains();
		const blockedDomains = new Set<string>();
		const explicitlyDeniedDomains = new Set<string>();
		for (const domain of domains) {
			if (deniedDomains.some(pattern => matchesDomainPattern(domain, pattern))) {
				blockedDomains.add(domain);
				explicitlyDeniedDomains.add(domain);
				continue;
			}
			if (!allowedDomains.some(pattern => matchesDomainPattern(domain, pattern))) {
				blockedDomains.add(domain);
			}
		}
		return {
			blockedDomains: [...blockedDomains],
			deniedDomains: [...explicitlyDeniedDomains],
		};
	}

	private _extractDomains(command: string): string[] {
		const domains = new Set<string>();
		let match: RegExpExecArray | null;

		TerminalSandboxService._urlRegex.lastIndex = 0;
		while ((match = TerminalSandboxService._urlRegex.exec(command)) !== null) {
			const domain = this._extractDomainFromUrl(match[0]);
			if (domain) {
				domains.add(domain);
			}
		}

		TerminalSandboxService._sshRemoteRegex.lastIndex = 0;
		while ((match = TerminalSandboxService._sshRemoteRegex.exec(command)) !== null) {
			const domain = normalizeDomain(match[1], true);
			if (domain) {
				domains.add(domain);
			}
		}

		TerminalSandboxService._hostRegex.lastIndex = 0;
		while ((match = TerminalSandboxService._hostRegex.exec(command)) !== null) {
			const domain = normalizeDomain(match[1]);
			if (domain) {
				domains.add(domain);
			}
		}

		return [...domains];
	}

	private _extractDomainFromUrl(value: string): string | undefined {
		try {
			const authority = URI.parse(value).authority;
			return normalizeDomain(authority, true);
		} catch {
			return undefined;
		}
	}

	private async _isSandboxConfiguredEnabled(): Promise<boolean> {
		const os = await this.getOS();
		if (os === OperatingSystem.Windows) {
			return false;
		}
		return this._isSandboxEnabled(this._getSettingValue<AgentSandboxEnabledValue | boolean>(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxSettingId.DeprecatedAgentSandboxEnabled) ?? AgentSandboxEnabledValue.Off);
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
			const allowedDomainsSetting = this._getSettingValue<string[]>(AgentNetworkDomainSettingId.AllowedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedSandboxAllowedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedOldAllowedNetworkDomains) ?? [];
			const deniedDomainsSetting = this._getSettingValue<string[]>(AgentNetworkDomainSettingId.DeniedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedSandboxDeniedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedOldDeniedNetworkDomains) ?? [];
			const linuxFileSystemSetting = this._os === OperatingSystem.Linux
				? this._getSettingValue<{ denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }>(TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem, TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxLinuxFileSystem) ?? {}
				: {};
			const macFileSystemSetting = this._os === OperatingSystem.Macintosh
				? this._getSettingValue<{ denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }>(TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem, TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxMacFileSystem) ?? {}
				: {};
			const runtimeSetting = this._getSettingValue<Record<string, unknown>>(TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime) ?? {};
			const configFileUri = URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);
			const linuxAllowWrite = this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite);
			const macAllowWrite = this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite);

			const sandboxSettings = {
				network: {
					allowedDomains: allowedDomainsSetting,
					deniedDomains: deniedDomainsSetting
				},
				filesystem: {
					denyRead: this._os === OperatingSystem.Macintosh ? macFileSystemSetting.denyRead : linuxFileSystemSetting.denyRead,
					allowWrite: this._os === OperatingSystem.Macintosh ? macAllowWrite : linuxAllowWrite,
					denyWrite: this._os === OperatingSystem.Macintosh ? macFileSystemSetting.denyWrite : linuxFileSystemSetting.denyWrite,
				},
			};
			this._mergeAdditionalSandboxConfigProperties(sandboxSettings as Record<string, unknown>, runtimeSetting);
			this._sandboxConfigPath = configFileUri.path;
			await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, '\t')), { overwrite: true });
			return this._sandboxConfigPath;
		}
		return undefined;
	}

	private _mergeAdditionalSandboxConfigProperties(target: Record<string, unknown>, additional: Record<string, unknown>): void {
		for (const [key, value] of Object.entries(additional)) {
			if (!Object.prototype.hasOwnProperty.call(target, key)) {
				target[key] = value;
				continue;
			}

			const existingValue = target[key];
			if (this._isObjectForSandboxConfigMerge(existingValue) && this._isObjectForSandboxConfigMerge(value)) {
				this._mergeAdditionalSandboxConfigProperties(existingValue, value);
			}
		}
	}

	private _isObjectForSandboxConfigMerge(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
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
		const allowedDomains = this._getSettingValue<string[]>(AgentNetworkDomainSettingId.AllowedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedSandboxAllowedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedOldAllowedNetworkDomains) ?? [];
		const deniedDomains = this._getSettingValue<string[]>(AgentNetworkDomainSettingId.DeniedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedSandboxDeniedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedOldDeniedNetworkDomains) ?? [];
		return {
			allowedDomains,
			deniedDomains
		};
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


	private _isSandboxEnabled(value: AgentSandboxEnabledValue | boolean): boolean {
		return value === true || value === AgentSandboxEnabledValue.On;
	}

	private _getSettingValue<T>(settingId: TerminalChatAgentToolsSettingId | AgentNetworkDomainSettingId | AgentSandboxSettingId, ...deprecatedSettingIds: (TerminalChatAgentToolsSettingId | AgentNetworkDomainSettingId | AgentSandboxSettingId)[]): T | undefined {
		const setting = this._configurationService.inspect<T>(settingId);
		if (setting.userValue !== undefined) {
			return setting.value;
		}
		for (const deprecatedId of deprecatedSettingIds) {
			const deprecated = this._configurationService.inspect<T>(deprecatedId);
			if (deprecated.userValue !== undefined) {
				this._logService.warn(`TerminalSandboxService: Using deprecated setting ${deprecatedId} because ${settingId} is not set. Please update your settings to use ${settingId} instead.`);
				return deprecated.value;
			}
		}
		return setting.value;
	}
}

