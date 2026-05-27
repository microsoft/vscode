/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { dirname } from '../../../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { arch } from '../../../../../base/common/process.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { SANDBOX_HELPER_CHANNEL_NAME, SandboxHelperChannelClient } from '../../../../../platform/sandbox/common/sandboxHelperIpc.js';
import { ISandboxDependencyStatus, ISandboxHelperService, IWindowsMxcFilesystemPolicy } from '../../../../../platform/sandbox/common/sandboxHelperService.js';
import { ITerminalSandboxEngineHost, ITerminalSandboxRuntimeInfo, TerminalSandboxEngine } from '../../../../../platform/sandbox/common/terminalSandboxEngine.js';
import { readSandboxSetting, SANDBOX_SETTING_KEYS } from './sandboxSettingsReader.js';
import { ITerminalSandboxService, type ISandboxDependencyInstallOptions, type ISandboxDependencyInstallResult, type ITerminalSandboxCommand, type ITerminalSandboxPrecheckInputs, type ITerminalSandboxPrerequisiteCheckResult, type ITerminalSandboxResolvedNetworkDomains, type ITerminalSandboxWrapResult } from '../../../../../platform/sandbox/common/terminalSandboxService.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ChatModel } from '../../../chat/common/model/chatModel.js';
import { ChatElicitationRequestPart } from '../../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ElicitationState, IChatService } from '../../../chat/common/chatService/chatService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { ILifecycleService, WillShutdownJoinerOrder } from '../../../../services/lifecycle/common/lifecycle.js';

export { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck } from '../../../../../platform/sandbox/common/terminalSandboxService.js';
export type { ISandboxDependencyInstallOptions, ISandboxDependencyInstallResult, ISandboxDependencyInstallTerminal, ITerminalSandboxCommand, ITerminalSandboxPrecheckInputs, ITerminalSandboxPrerequisiteCheckResult, ITerminalSandboxResolvedNetworkDomains, ITerminalSandboxWrapResult } from '../../../../../platform/sandbox/common/terminalSandboxService.js';

/**
 * Context passed to the password prompt during dependency installation.
 */
interface ISandboxDependencyInstallTerminalContext {
	focusTerminal(): Promise<void>;
	onDidInputData: Event<string>;
	onDisposed: Event<unknown>;
	didSendInstallCommand(): boolean;
}

/** Subdirectory under the user home + product data folder where the engine creates its temp dir. */
const SANDBOX_TEMP_DIR_NAME = 'tmp';

function affectsSandboxSettings(e: IConfigurationChangeEvent): boolean {
	return SANDBOX_SETTING_KEYS.some(key => e.affectsConfiguration(key));
}

export class TerminalSandboxService extends Disposable implements ITerminalSandboxService {
	readonly _serviceBrand: undefined;

	private readonly _engine: TerminalSandboxEngine;
	private readonly _remoteEnvDetailsPromise: Promise<IRemoteAgentEnvironment | null>;
	private _remoteEnvDetails: IRemoteAgentEnvironment | null | undefined;
	private readonly _onDidChangeRoots = this._register(new Emitter<void>());

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IProductService private readonly _productService: IProductService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ISandboxHelperService private readonly _sandboxHelperService: ISandboxHelperService,
		@IChatService private readonly _chatService: IChatService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();

		const onDidChangeSandboxSettings = Event.filter(this._configurationService.onDidChangeConfiguration, affectsSandboxSettings);

		const host: ITerminalSandboxEngineHost = {
			getOS: () => this._resolveOS(),
			getRuntimeInfo: () => this._resolveRuntimeInfo(),
			getUserHome: () => this._resolveUserHome(),
			getSandboxTempDir: () => this._resolveSandboxTempDir(),
			getWorkspaceStorageReadRoot: () => this._resolveWorkspaceStorageReadRoot(),
			getWriteRoots: () => this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri),
			onDidChangeRoots: this._onDidChangeRoots.event,
			checkSandboxDependencies: () => this._resolveSandboxDependencyStatus(),
			getWindowsMxcFilesystemPolicy: () => this._resolveWindowsMxcFilesystemPolicy(),
			getWindowsMxcEnvironment: () => this._resolveWindowsMxcEnvironment(),
			getSandboxSetting: <T>(settingId: string): T | undefined => this._readSandboxSetting<T>(settingId),
			onDidChangeSandboxSettings: Event.map(onDidChangeSandboxSettings, () => undefined),
		};
		this._engine = this._register(instantiationService.createInstance(TerminalSandboxEngine, host));

		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._onDidChangeRoots.fire()));

		this._register(lifecycleService.onWillShutdown(e => {
			if (!this._engine.getTempDir()) {
				return;
			}
			e.join(this._engine.cleanupTempDir(), {
				id: 'join.deleteFilesInSandboxTempDir',
				label: localize('deleteFilesInSandboxTempDir', "Delete Files in Sandbox Temp Dir"),
				order: WillShutdownJoinerOrder.Default
			});
		}));
	}

	// ---- ITerminalSandboxService forwarders ---------------------------------

	isEnabled(precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<boolean> {
		return this._engine.isEnabled(precheckInputs);
	}

	isSandboxAllowNetworkEnabled(precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<boolean> {
		return this._engine.isSandboxAllowNetworkEnabled(precheckInputs);
	}

	getOS(): Promise<OperatingSystem> {
		return this._engine.getOS();
	}

	wrapCommand(command: string, requestUnsandboxedExecution?: boolean, shell?: string, cwd?: URI, commandDetails?: readonly ITerminalSandboxCommand[]): Promise<ITerminalSandboxWrapResult> {
		return this._engine.wrapCommand(command, requestUnsandboxedExecution, shell, cwd, commandDetails);
	}

	checkForSandboxingPrereqs(forceRefresh: boolean = false, precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<ITerminalSandboxPrerequisiteCheckResult> {
		return this._engine.checkForSandboxingPrereqs(forceRefresh, precheckInputs);
	}

	getSandboxConfigPath(forceRefresh: boolean = false, precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<string | undefined> {
		return this._engine.getSandboxConfigPath(forceRefresh, precheckInputs);
	}

	getTempDir(): URI | undefined {
		return this._engine.getTempDir();
	}

	setNeedsForceUpdateConfigFile(): void {
		this._engine.setNeedsForceUpdateConfigFile();
	}

	getResolvedNetworkDomains(): ITerminalSandboxResolvedNetworkDomains {
		return this._engine.getResolvedNetworkDomains();
	}

	getMissingSandboxDependencies(): Promise<string[]> {
		return this._engine.getMissingSandboxDependencies();
	}

	// ---- host adapter helpers -----------------------------------------------

	private async _resolveRemoteEnv(): Promise<IRemoteAgentEnvironment | null> {
		if (this._remoteEnvDetails === undefined) {
			this._remoteEnvDetails = await this._remoteEnvDetailsPromise;
		}
		return this._remoteEnvDetails;
	}

	private async _resolveOS(): Promise<OperatingSystem> {
		const remoteEnv = await this._resolveRemoteEnv();
		return remoteEnv ? remoteEnv.os : OS;
	}

	private _readSandboxSetting<T>(settingId: string): T | undefined {
		return readSandboxSetting<T>(this._configurationService, this._logService, settingId);
	}

	private async _resolveRuntimeInfo(): Promise<ITerminalSandboxRuntimeInfo> {
		const remoteEnv = await this._resolveRemoteEnv();
		if (remoteEnv) {
			// Remote workbench: server resolves a real `node` binary, no env prefix needed.
			return { appRoot: remoteEnv.os === OperatingSystem.Windows ? this._toWindowsPath(remoteEnv.appRoot) : remoteEnv.appRoot.path, execPath: remoteEnv.execPath, runAsNode: false, arch: remoteEnv.arch };
		}
		// Local workbench: app root is local and exec path points at the Electron binary,
		// so the engine must prefix `ELECTRON_RUN_AS_NODE=1` when invoking it.
		const localAppRootUri = FileAccess.asFileUri('');
		const localAppRoot = OS === OperatingSystem.Windows ? dirname(localAppRootUri.fsPath) : dirname(localAppRootUri.path);
		const nativeEnv = this._environmentService as IEnvironmentService & { execPath?: string };
		return { appRoot: localAppRoot, execPath: nativeEnv.execPath, runAsNode: true, arch };
	}

	private _toWindowsPath(uri: URI): string {
		let value: string;
		if (uri.authority && uri.path.length > 1 && uri.scheme === 'file') {
			value = `\\\\${uri.authority}${uri.path}`;
		} else if (/^\/[a-zA-Z]:/.test(uri.path)) {
			value = uri.path.slice(1);
		} else {
			value = uri.fsPath;
		}
		return value.replace(/\//g, '\\');
	}

	private async _resolveUserHome(): Promise<URI | undefined> {
		const remoteEnv = await this._resolveRemoteEnv();
		if (remoteEnv?.userHome) {
			return remoteEnv.userHome;
		}
		const nativeEnv = this._environmentService as IEnvironmentService & { userHome?: URI };
		return nativeEnv.userHome;
	}

	private async _resolveSandboxTempDir(): Promise<URI | undefined> {
		const remoteEnv = await this._resolveRemoteEnv();
		const sandboxTempDirName = this._getSandboxWindowTempDirName();
		if (remoteEnv?.userHome) {
			const sandboxRoot = URI.joinPath(remoteEnv.userHome, this._productService.serverDataFolderName ?? this._productService.dataFolderName, SANDBOX_TEMP_DIR_NAME);
			return sandboxTempDirName ? URI.joinPath(sandboxRoot, sandboxTempDirName) : sandboxRoot;
		}

		const nativeEnv = this._environmentService as IEnvironmentService & { userHome?: URI };
		if (nativeEnv.userHome) {
			const sandboxRoot = URI.joinPath(nativeEnv.userHome, this._productService.dataFolderName, SANDBOX_TEMP_DIR_NAME);
			return sandboxTempDirName ? URI.joinPath(sandboxRoot, sandboxTempDirName) : sandboxRoot;
		}
		return undefined;
	}

	private async _resolveWorkspaceStorageReadRoot(): Promise<URI | undefined> {
		const remoteEnv = await this._resolveRemoteEnv();
		const workspaceStorageHome = remoteEnv?.workspaceStorageHome ?? this._environmentService.workspaceStorageHome;
		const workspaceId = this._workspaceContextService.getWorkspace().id;
		return URI.joinPath(workspaceStorageHome, workspaceId);
	}

	private _getSandboxWindowTempDirName(): string | undefined {
		const workbenchEnv = this._environmentService as IEnvironmentService & { window?: { id?: number } };
		const windowId = workbenchEnv.window?.id;
		return typeof windowId === 'number' ? `tmp_vscode_${windowId}` : undefined;
	}

	private async _resolveSandboxDependencyStatus(): Promise<ISandboxDependencyStatus | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, channel => {
				const sandboxHelper = new SandboxHelperChannelClient(channel);
				return sandboxHelper.checkSandboxDependencies();
			});
		}
		return this._sandboxHelperService.checkSandboxDependencies();
	}

	private async _resolveWindowsMxcFilesystemPolicy(): Promise<IWindowsMxcFilesystemPolicy | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, channel => {
				const sandboxHelper = new SandboxHelperChannelClient(channel);
				return sandboxHelper.getWindowsMxcFilesystemPolicy();
			});
		}
		return this._sandboxHelperService.getWindowsMxcFilesystemPolicy();
	}

	private async _resolveWindowsMxcEnvironment(): Promise<string[] | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, channel => {
				const sandboxHelper = new SandboxHelperChannelClient(channel);
				return sandboxHelper.getWindowsMxcEnvironment();
			});
		}
		return this._sandboxHelperService.getWindowsMxcEnvironment();
	}

	// ---- workbench-only flows -----------------------------------------------

	async installMissingSandboxDependencies(missingDependencies: string[], sessionResource: URI | undefined, token: CancellationToken, options: ISandboxDependencyInstallOptions): Promise<ISandboxDependencyInstallResult> {
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
<<<<<<< HEAD
=======

	private _quoteShellArgument(value: string): string {
		return `'${value.replace(/'/g, `'\\''`)}'`;
	}

	private _getSandboxCommandWithPreservedCwd(command: string, cwd: URI | undefined): string {
		if (this._os !== OperatingSystem.Linux || !cwd?.path || cwd.path === this._tempDir?.path) {
			return command;
		}
		return `cd ${this._quoteShellArgument(cwd.path)} && ${command}`;
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
		if (this._isSandboxAllowNetworkConfigured()) {
			return { blockedDomains: [], deniedDomains: [] };
		}

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

	/**
	 * Creates a stable, case-insensitive keyword set for config refresh checks and
	 * coarse command allow-list rules.
	 */
	private _normalizeCommandKeywords(commandKeywords: readonly string[]): string[] {
		return [...new Set(commandKeywords.map(keyword => keyword.toLowerCase()))].sort();
	}

	/**
	 * Normalizes command details for deterministic comparisons while preserving
	 * argument order within each command for argument-sensitive allow-list rules.
	 */
	private _normalizeCommandDetails(commandDetails: readonly ITerminalSandboxCommand[]): ITerminalSandboxCommand[] {
		const seen = new Set<string>();
		const result: ITerminalSandboxCommand[] = [];
		for (const command of commandDetails) {
			const normalizedCommand = { keyword: command.keyword.toLowerCase(), args: [...command.args] };
			const key = JSON.stringify(normalizedCommand);
			if (!seen.has(key)) {
				seen.add(key);
				result.push(normalizedCommand);
			}
		}
		return result.sort((a, b) => a.keyword.localeCompare(b.keyword) || a.args.join('\0').localeCompare(b.args.join('\0')));
	}

	private _areStringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
		return a.length === b.length && a.every((keyword, index) => keyword === b[index]);
	}

	private _areObjectsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
		return JSON.stringify(a) === JSON.stringify(b);
	}

	private async _isSandboxConfiguredEnabled(): Promise<boolean> {
		const os = await this.getOS();
		if (os === OperatingSystem.Windows) {
			return false;
		}
		const value = this._getSandboxConfiguredEnabledValue();
		return value === true || value === AgentSandboxEnabledValue.On || value === AgentSandboxEnabledValue.AllowNetwork;
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
		this._srtPath = this._pathJoin(this._appRoot, 'node_modules', '@vscode', 'sandbox-runtime', 'dist', 'cli.js');
		this._rgPath = this._pathJoin(this._appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg');
	}

	private async _createSandboxConfig(): Promise<string | undefined> {

		if ((await this.isEnabled()) && !this._tempDir) {
			await this._initTempDir();
		}
		if (this._tempDir) {
			const allowNetwork = await this.isSandboxAllowNetworkEnabled();
			const linuxFileSystemSetting = this._os === OperatingSystem.Linux
				? this._getSettingValue<ITerminalSandboxFileSystemSetting>(TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem, TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxLinuxFileSystem) ?? {}
				: {};
			const macFileSystemSetting = this._os === OperatingSystem.Macintosh
				? this._getSettingValue<ITerminalSandboxFileSystemSetting>(TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem, TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxMacFileSystem) ?? {}
				: {};
			const runtimeSetting = this._getSettingValue<Record<string, unknown>>(TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime) ?? {};
			const commandRuntimeSetting = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
			const commandRuntimeAllowReadPaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, 'allowRead');
			const commandRuntimeAllowWritePaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, 'allowWrite');
			const configFileUri = URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);
			let allowWritePaths: string[] = [];
			let allowReadPaths: string[] = [];
			let denyReadPaths: string[] = [];
			let denyWritePaths: string[] | undefined;
			if (this._os === OperatingSystem.Macintosh) {
				allowWritePaths = this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths);
				allowReadPaths = this._updateAllowReadPathsWithAllowWrite(macFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths);
				denyReadPaths = this._updateDenyReadPathsWithHome(macFileSystemSetting.denyRead);
				denyWritePaths = macFileSystemSetting.denyWrite;
			} else if (this._os === OperatingSystem.Linux) {
				allowWritePaths = this._resolveLinuxFileSystemPaths(this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths));
				allowReadPaths = this._resolveLinuxFileSystemPaths(this._updateAllowReadPathsWithAllowWrite(linuxFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
				denyReadPaths = this._resolveLinuxFileSystemPaths(this._updateDenyReadPathsWithHome(linuxFileSystemSetting.denyRead));
				denyWritePaths = this._resolveLinuxFileSystemPaths(linuxFileSystemSetting.denyWrite);
			}
			const sandboxSettings = {
				network: allowNetwork ? { allowedDomains: [], deniedDomains: [], enabled: false } : this.getResolvedNetworkDomains(),
				filesystem: {
					denyRead: denyReadPaths,
					allowRead: allowReadPaths,
					allowWrite: allowWritePaths,
					denyWrite: denyWritePaths,
				},
			};
			this._mergeAdditionalSandboxConfigProperties(sandboxSettings as Record<string, unknown>, allowNetwork ? this._withoutNetworkRuntimeSetting(runtimeSetting) : runtimeSetting);
			this._mergeAdditionalSandboxConfigProperties(sandboxSettings as Record<string, unknown>, commandRuntimeSetting);
			this._sandboxConfigPath = configFileUri.path;
			await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, '\t')), { overwrite: true });
			return this._sandboxConfigPath;
		}
		return undefined;
	}

	private _getCommandRuntimeFileSystemPaths(runtimeSetting: Record<string, unknown>, key: 'allowRead' | 'allowWrite'): string[] {
		const filesystem = runtimeSetting.filesystem;
		if (!this._isObjectForSandboxConfigMerge(filesystem)) {
			return [];
		}

		const paths = filesystem[key];
		if (!Array.isArray(paths)) {
			return [];
		}

		return paths.filter((path): path is string => typeof path === 'string');
	}

	private _withoutNetworkRuntimeSetting(runtimeSetting: Record<string, unknown>): Record<string, unknown> {
		const sanitizedRuntimeSetting = { ...runtimeSetting };
		delete sanitizedRuntimeSetting.network;
		return sanitizedRuntimeSetting;
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

	private _updateAllowWritePathsWithWorkspaceFolders(configuredAllowWrite: string[] | undefined, commandRuntimeAllowWrite: string[] = []): string[] {
		const workspaceFolderPaths = this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri.path);
		return [...new Set([...workspaceFolderPaths, ...this._defaultWritePaths, ...this._getWorkspaceStoragePaths(), ...(configuredAllowWrite ?? []), ...commandRuntimeAllowWrite])];
	}

	private _updateDenyReadPathsWithHome(configuredDenyRead: string[] | undefined): string[] {
		const userHome = this._getUserHomePath();
		return [...new Set([...(configuredDenyRead ?? []), ...(userHome ? [userHome] : [])])];
	}

	private _updateAllowReadPathsWithAllowWrite(configuredAllowRead: string[] | undefined, allowWrite: string[], commandRuntimeAllowRead: string[] = []): string[] {
		return [...new Set([...(configuredAllowRead ?? []), ...getTerminalSandboxReadAllowListForCommands(this._os, this._commandAllowListKeywords, this._commandAllowListCommandDetails), ...commandRuntimeAllowRead, ...this._getSandboxRuntimeReadPaths(), ...allowWrite])];
	}

	private _resolveLinuxFileSystemPaths(paths: string[] | undefined): string[] {
		return (paths ?? []).map(path => this._expandHomePath(path));
	}

	private _expandHomePath(path: string): string {
		const userHome = this._getUserHomePath();
		if (!userHome) {
			return path;
		}
		if (path === '~') {
			return userHome;
		}
		if (path.startsWith('~/')) {
			return this._pathJoin(userHome, path.slice(2));
		}
		return path;
	}

	private _getSandboxRuntimeReadPaths(): string[] {
		const paths: string[] = [this._appRoot];
		if (this._execPath) {
			for (const path of [this._execPath, dirname(this._execPath)]) {
				if (!this._isPathUnderAppRoot(path)) {
					paths.push(path);
				}
			}
		}
		return paths;
	}

	private _isPathUnderAppRoot(path: string): boolean {
		return path === this._appRoot || path.startsWith(`${this._appRoot}${this._os === OperatingSystem.Windows ? win32.sep : posix.sep}`);
	}

	private _getWorkspaceStoragePaths(): string[] {
		const workspaceStorageHome = this._remoteEnvDetails?.workspaceStorageHome ?? this._environmentService.workspaceStorageHome;
		const workspaceId = this._workspaceContextService.getWorkspace().id;
		return [URI.joinPath(workspaceStorageHome, workspaceId).path];
	}

	private _getUserHomePath(): string | undefined {
		const nativeEnv = this._environmentService as IEnvironmentService & { userHome?: URI };
		return this._remoteEnvDetails?.userHome?.path ?? nativeEnv.userHome?.path;
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


	private _getSandboxConfiguredEnabledValue(): AgentSandboxEnabledValue | boolean {
		return this._getSettingValue<AgentSandboxEnabledValue | boolean>(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxSettingId.DeprecatedAgentSandboxEnabled) ?? AgentSandboxEnabledValue.Off;
	}

	private _isSandboxAllowNetworkConfigured(): boolean {
		return this._getSandboxConfiguredEnabledValue() === AgentSandboxEnabledValue.AllowNetwork;
	}

	private _areUnsandboxedCommandsAllowed(): boolean {
		return this._getSettingValue<boolean>(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands) === true;
	}

	private _getSettingValue<T>(settingId: TerminalChatAgentToolsSettingId | AgentNetworkDomainSettingId | AgentSandboxSettingId, ...deprecatedSettingIds: (TerminalChatAgentToolsSettingId | AgentNetworkDomainSettingId | AgentSandboxSettingId)[]): T | undefined {
		const setting = this._configurationService.inspect<T>(settingId);
		if (setting.userValue !== undefined) {
			return setting.value;
		}
		if (deprecatedSettingIds.length > 0) {
			const userConfiguredKeys = this._configurationService.keys().user;
			for (const deprecatedId of deprecatedSettingIds) {
				const deprecated = this._configurationService.inspect<T>(deprecatedId);
				// Some deprecated settings are parent keys of newer settings, for example
				// `chat.agent.sandbox` and `chat.agent.sandbox.fileSystem.linux`. Inspecting the
				// parent key can return the namespace object even when the deprecated key itself
				// was not configured, so only fall back when the exact deprecated key exists.
				if (deprecated.userValue !== undefined && userConfiguredKeys.includes(deprecatedId)) {
					this._logService.warn(`TerminalSandboxService: Using deprecated setting ${deprecatedId} because ${settingId} is not set. Please update your settings to use ${settingId} instead.`);
					return deprecated.value;
				}
			}
		}
		return setting.value;
	}
>>>>>>> baff7c669e5 (Merge pull request #317202 from dileepyavan/DileepY/317160-release-1.121)
}
