/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { match as globMatch } from '../../../base/common/glob.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { posix, win32 } from '../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../base/common/platform.js';
import { arch } from '../../../base/common/process.js';
import { ExtUri } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { matchesDomainPattern, normalizeDomain } from '../../networkFilter/common/domainMatcher.js';
import { AgentNetworkDomainSettingId } from '../../networkFilter/common/settings.js';
import { ISandboxDependencyStatus, type IWindowsMxcConfig, IWindowsMxcFilesystemPolicy, type IWindowsMxcPolicyContainment, type IWindowsMxcSandboxPolicy } from './sandboxHelperService.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId, isAgentSandboxEnabledValue, normalizeAgentSandboxEnabledValue, type AgentSandboxEnabledSettingValue } from './settings.js';
import { IWindowsMxcTerminalSandboxRuntime } from './terminalSandboxMxcRuntime.js';
import { getTerminalSandboxReadAllowListForCommands } from './terminalSandboxReadAllowList.js';
import { getTerminalSandboxRuntimeConfigurationForCommands } from './terminalSandboxRuntimeConfigurationPerOperation.js';
import { ITerminalSandboxCommand, ITerminalSandboxFileAccessCheckResult, ITerminalSandboxPrecheckInputs, ITerminalSandboxPrerequisiteCheckResult, ITerminalSandboxResolvedNetworkDomains, ITerminalSandboxWrapResult, TerminalSandboxFileAccessPermission, TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation } from './terminalSandboxService.js';

interface ITerminalSandboxFileSystemSetting {
	denyRead?: string[];
	allowRead?: string[];
	allowWrite?: string[];
	denyWrite?: string[];
}

interface ITerminalSandboxFileSystemAccessPaths {
	allowReadPaths: string[];
	allowWritePaths: string[];
	denyReadPaths: string[];
	denyWritePaths: string[] | undefined;
}

/** Runtime information needed to launch the sandbox-runtime CLI. */
export interface ITerminalSandboxRuntimeInfo {
	/** Directory that contains `node_modules/@vscode/sandbox-runtime` and `node_modules/@vscode/ripgrep`. */
	appRoot: string;
	/** Path of the node/electron executable used to run sandbox-runtime. */
	execPath?: string;
	/**
	 * When true the engine prefixes the wrapped command with `ELECTRON_RUN_AS_NODE=1`
	 * so the Electron binary acts as a Node.js executable. Set by hosts that resolve
	 * an Electron-based exec path (the local workbench); leave undefined / false when
	 * `execPath` already points at a real `node` binary (remote, agent host).
	 */
	runAsNode?: boolean;
	/** CPU architecture of the environment that runs the sandbox runtime. */
	arch?: string;
}

/**
 * Host adapter that supplies the engine with environment/workspace data the
 * platform layer cannot resolve on its own. Hosts (workbench, agent host)
 * implement this to bridge their per-environment services (`IRemoteAgentService`,
 * `IWorkspaceContextService`, `IEnvironmentService`, `IProductService`,
 * `ISandboxHelperService`, …) into the engine.
 */
export interface ITerminalSandboxEngineHost {
	/** Effective OS used by sandbox decisions. May be the remote OS in workbench. */
	getOS(): Promise<OperatingSystem>;
	/** Resolves app root + node/electron exec path (after the remote env is known, if applicable). */
	getRuntimeInfo(): Promise<ITerminalSandboxRuntimeInfo>;
	/** Resolves the user home used for `~`-expansion and the default deny-read entry. */
	getUserHome(): Promise<URI | undefined>;
	/**
	 * Resolves the directory the engine creates and uses as its sandbox temp dir
	 * (sandbox-settings JSON file lives here). May return undefined when no
	 * suitable location exists, in which case sandboxing is disabled.
	 */
	getSandboxTempDir(): Promise<URI | undefined>;
	/** Path added to `allowRead` and `allowWrite` for the engine's workspace/session storage area. */
	getWorkspaceStorageReadRoot(): Promise<URI | undefined>;
	/** Roots that must be writable inside the sandbox (workspace folders / session cwds). */
	getWriteRoots(): readonly URI[];
	/** Fires when {@link getWriteRoots} or {@link getWorkspaceStorageReadRoot} change. */
	readonly onDidChangeRoots: Event<void>;
	/** Resolves the installed sandbox-dependency status (bubblewrap, socat). */
	checkSandboxDependencies(): Promise<ISandboxDependencyStatus | undefined>;
	/** Resolves host filesystem policy fragments needed by the Windows MXC process container. */
	getWindowsMxcFilesystemPolicy(): Promise<IWindowsMxcFilesystemPolicy | undefined>;
	/** Resolves host environment variables needed by the Windows MXC process container. */
	getWindowsMxcEnvironment(): Promise<string[] | undefined>;
	/** Builds a Windows MXC payload from a target-environment MXC sandbox policy. */
	buildWindowsMxcSandboxPayload(commandLine: string, policy: IWindowsMxcSandboxPolicy, workingDirectory?: string, containerName?: string, containment?: IWindowsMxcPolicyContainment): Promise<IWindowsMxcConfig | undefined>;
	/**
	 * Returns the effective value of a sandbox-related configuration setting,
	 * or `undefined` when the setting is not configured. Implementations are
	 * responsible for mapping deprecated keys to modern ones (the engine
	 * only ever asks for the modern setting IDs).
	 */
	getSandboxSetting<T>(settingId: string): T | undefined;
	/**
	 * Fires when any value returned by {@link getSandboxSetting} may have
	 * changed. The engine invalidates its sandbox-config file on each event.
	 * Implementations should pre-filter to sandbox-relevant keys.
	 */
	readonly onDidChangeSandboxSettings: Event<void>;
}

/**
 * Core sandbox engine. Encapsulates the platform-agnostic logic for wrapping
 * commands in a sandbox runtime: enabledness checks, command-line wrapping,
 * sandbox-config generation, network-domain extraction and prerequisite checks.
 *
 * Hosts (workbench / agent host) construct an engine with a host adapter that
 * supplies workspace/remote-specific data, then forward their public service
 * methods to the engine and add their own host-specific concerns
 * (chat elicitation, lifecycle hooks, …) on top.
 */
export class TerminalSandboxEngine extends Disposable {
	private static readonly _urlRegex = /(?:https?|wss?):\/\/[^\s'"`|&;<>]+/gi;
	private static readonly _sshRemoteRegex = /(?:^|[\s'"`])(?:[^\s@:'"`]+@)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::[^\s'"`|&;<>]+)(?=$|[\s'"`|&;<>])/gi;
	private static readonly _hostRegex = /(?:^|[\s'"`(=])([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::\d+)?(?=(?:\/[^\s'"`|&;<>]*)?(?:$|[\s'"`)\]|,;|&<>]))/gi;

	private readonly _sandboxSettingsId: string = generateUuid();
	private _runtimeResolved = false;
	private _appRoot: string | undefined;
	private _execPath: string | undefined;
	private _runAsNode = false;
	private _userHome: URI | undefined;
	private _srtPath: string | undefined;
	private _rgPath: string | undefined;
	private _mxcPath: string | undefined;
	private _windowsMxcFilesystemPolicy: IWindowsMxcFilesystemPolicy | undefined;
	private _windowsMxcEnvironment: string[] | undefined;
	private _sandboxConfigPath: string | undefined;
	private _sandboxDependencyStatus: ISandboxDependencyStatus | undefined;
	private _needsForceUpdateConfigFile = true;
	private _tempDir: URI | undefined;
	private _commandAllowListKeywords: readonly string[] = [];
	private _commandAllowListCommandDetails: readonly ITerminalSandboxCommand[] = [];
	private _commandCwd: URI | undefined;
	private _commandLine: string | undefined;
	private _commandShell: string | undefined;
	private _commandAllowNetwork = false;
	private _os: OperatingSystem = OS;
	private readonly _defaultWritePaths: string[] = [];
	private readonly _fileSystemPathExtUri = new ExtUri(() => this._os === OperatingSystem.Windows);

	constructor(
		private readonly _host: ITerminalSandboxEngineHost,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IWindowsMxcTerminalSandboxRuntime private readonly _windowsMxcRuntime: IWindowsMxcTerminalSandboxRuntime,
	) {
		super();
		this._register(Event.runAndSubscribe(this._host.onDidChangeSandboxSettings, () => {
			this.setNeedsForceUpdateConfigFile();
		}));
		this._register(this._host.onDidChangeRoots(() => this.setNeedsForceUpdateConfigFile()));
	}

	async isEnabled(precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<boolean> {
		return this._isSandboxConfiguredEnabled(precheckInputs);
	}

	async isSandboxAllowNetworkEnabled(precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<boolean> {
		if (!(await this._isSandboxConfiguredEnabled(precheckInputs))) {
			return false;
		}
		return this._isSandboxAllowNetworkConfigured();
	}

	areUnsandboxedCommandsAllowed(): boolean {
		return this._areUnsandboxedCommandsAllowed();
	}

	areRetryWithAllowNetworkRequestsAllowed(): boolean {
		return this._areRetryWithAllowNetworkRequestsAllowed();
	}

	async getOS(): Promise<OperatingSystem> {
		this._os = await this._host.getOS();
		return this._os;
	}

	getTempDir(): URI | undefined {
		return this._tempDir;
	}

	setNeedsForceUpdateConfigFile(): void {
		this._needsForceUpdateConfigFile = true;
	}

	getResolvedNetworkDomains(): ITerminalSandboxResolvedNetworkDomains {
		const allowedDomains = this._getSettingValue<string[]>(AgentNetworkDomainSettingId.AllowedNetworkDomains) ?? [];
		const deniedDomains = this._getSettingValue<string[]>(AgentNetworkDomainSettingId.DeniedNetworkDomains) ?? [];
		return { allowedDomains, deniedDomains };
	}

	async wrapCommand(command: string, requestUnsandboxedExecution?: boolean, shell?: string, cwd?: URI, commandDetails?: readonly ITerminalSandboxCommand[], requestAllowNetwork?: boolean): Promise<ITerminalSandboxWrapResult> {
		const allowUnsandboxedCommands = this._areUnsandboxedCommandsAllowed();
		const retryWithAllowNetworkRequests = this._areRetryWithAllowNetworkRequestsAllowed();
		const shouldInspectBlockedDomains = requestUnsandboxedExecution !== true && requestAllowNetwork !== true && (retryWithAllowNetworkRequests || allowUnsandboxedCommands);
		const blockedDomainResult = shouldInspectBlockedDomains ? this._getBlockedDomains(command) : { blockedDomains: [], deniedDomains: [] };
		const requiresPreflightAllowNetwork = retryWithAllowNetworkRequests && blockedDomainResult.blockedDomains.length > 0;
		const allowNetworkForCommand = requestUnsandboxedExecution !== true && ((requestAllowNetwork === true && retryWithAllowNetworkRequests) || requiresPreflightAllowNetwork);
		const normalizedCommandDetails = this._normalizeCommandDetails(commandDetails ?? []);
		const normalizedCommandKeywords = this._normalizeCommandKeywords(normalizedCommandDetails.map(c => c.keyword));
		const currentReadAllowListPaths = getTerminalSandboxReadAllowListForCommands(this._os, this._commandAllowListKeywords, this._commandAllowListCommandDetails);
		const nextReadAllowListPaths = getTerminalSandboxReadAllowListForCommands(this._os, normalizedCommandKeywords, normalizedCommandDetails);
		const currentRuntimeConfiguration = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
		const nextRuntimeConfiguration = getTerminalSandboxRuntimeConfigurationForCommands(this._os, normalizedCommandDetails);
		const shouldRefreshConfig = this._commandAllowListKeywords.length === 0
			|| this._needsForceUpdateConfigFile
			|| !this._areStringArraysEqual(this._commandAllowListKeywords, normalizedCommandKeywords)
			|| !this._areStringArraysEqual(currentReadAllowListPaths, nextReadAllowListPaths)
			|| !this._areObjectsEqual(currentRuntimeConfiguration, nextRuntimeConfiguration)
			|| this._commandCwd?.toString() !== cwd?.toString()
			|| this._commandAllowNetwork !== allowNetworkForCommand
			|| (this._os === OperatingSystem.Windows && (this._commandLine !== command || this._commandShell !== shell));
		if (shouldRefreshConfig) {
			this._commandAllowListKeywords = normalizedCommandKeywords;
			this._commandAllowListCommandDetails = normalizedCommandDetails;
			this._commandCwd = cwd;
			this._commandLine = command;
			this._commandShell = shell;
			this._commandAllowNetwork = allowNetworkForCommand;
			await this.getSandboxConfigPath(true);
		}

		if (!this._sandboxConfigPath || !this._tempDir) {
			throw new Error('Sandbox config path or temp dir not initialized');
		}

		// If per-command network relaxation is disabled, preserve the existing
		// unsandbox fallback for commands with statically-detected blocked domains.
		if (!requestUnsandboxedExecution && !retryWithAllowNetworkRequests && allowUnsandboxedCommands && blockedDomainResult.blockedDomains.length > 0) {
			return {
				command: this._wrapUnsandboxedCommand(command, shell),
				isSandboxWrapped: false,
				blockedDomains: blockedDomainResult.blockedDomains,
				deniedDomains: blockedDomainResult.deniedDomains,
				requiresUnsandboxConfirmation: true,
			};
		}

		// If requestUnsandboxedExecution is true, need to ensure env variables set during sandbox still apply.
		if (requestUnsandboxedExecution && allowUnsandboxedCommands) {
			return {
				command: this._wrapUnsandboxedCommand(command, shell),
				isSandboxWrapped: false,
			};
		}

		const allowNetworkConfirmationMetadata = requiresPreflightAllowNetwork ? {
			blockedDomains: blockedDomainResult.blockedDomains,
			deniedDomains: blockedDomainResult.deniedDomains,
		} : undefined;

		if (this._os === OperatingSystem.Windows) {
			if (!this._mxcPath) {
				throw new Error('MXC executable path not resolved');
			}
			return {
				command: this._windowsMxcRuntime.wrapCommand(this._mxcPath, this._sandboxConfigPath),
				isSandboxWrapped: true,
				requiresAllowNetworkConfirmation: allowNetworkForCommand && !this._isSandboxAllowNetworkConfigured() ? true : undefined,
				...allowNetworkConfirmationMetadata,
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
		const commandToRunInSandbox = this._getSandboxCommandWithPreservedCwd(command, cwd);
		const sandboxRuntimeCommand = `PATH="$PATH:${this._pathDirname(this._rgPath)}" TMPDIR="${this._tempDir.path}" CLAUDE_TMPDIR="${this._tempDir.path}" "${this._execPath}" "${this._srtPath}" --settings "${this._sandboxConfigPath}" -c ${this._quoteShellArgument(commandToRunInSandbox)}`;
		// On workbench Electron builds the exec path points at the Electron binary, so we
		// prefix `ELECTRON_RUN_AS_NODE=1` to make it behave as Node.js. Remote workbench and
		// the agent host already resolve a real `node` binary and the host clears the flag.
		if (this._runAsNode) {
			const nodeSandboxRuntimeCommand = `ELECTRON_RUN_AS_NODE=1 ${sandboxRuntimeCommand}`;
			return {
				command: this._wrapSandboxRuntimeCommandForLaunch(nodeSandboxRuntimeCommand, cwd),
				isSandboxWrapped: true,
				requiresAllowNetworkConfirmation: allowNetworkForCommand && !this._isSandboxAllowNetworkConfigured() ? true : undefined,
				...allowNetworkConfirmationMetadata,
			};
		}
		return {
			command: this._wrapSandboxRuntimeCommandForLaunch(sandboxRuntimeCommand, cwd),
			isSandboxWrapped: true,
			requiresAllowNetworkConfirmation: allowNetworkForCommand && !this._isSandboxAllowNetworkConfigured() ? true : undefined,
			...allowNetworkConfirmationMetadata,
		};
	}

	async checkForSandboxingPrereqs(forceRefresh: boolean = false, precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<ITerminalSandboxPrerequisiteCheckResult> {
		if (!(await this._isSandboxConfiguredEnabled(precheckInputs))) {
			return {
				enabled: false,
				sandboxConfigPath: undefined,
				failedCheck: undefined,
			};
		}

		const sandboxConfigPath = await this.getSandboxConfigPath(forceRefresh, precheckInputs);
		if (!sandboxConfigPath) {
			return {
				enabled: true,
				sandboxConfigPath,
				failedCheck: TerminalSandboxPrerequisiteCheck.Config,
			};
		}

		if (!(await this._checkSandboxDependencies(forceRefresh))) {
			const missingDependencies = await this.getMissingSandboxDependencies();
			if (missingDependencies.length === 0 && this._sandboxDependencyStatus?.bubblewrapInstalled && !this._sandboxDependencyStatus.bubblewrapUsable) {
				return {
					enabled: true,
					sandboxConfigPath,
					failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
					remediations: this._getBubblewrapRemediations(),
					detail: this._sandboxDependencyStatus.bubblewrapError,
				};
			}
			return {
				enabled: true,
				sandboxConfigPath,
				failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
				missingDependencies,
			};
		}

		return {
			enabled: true,
			sandboxConfigPath,
			failedCheck: undefined,
		};
	}

	async checkFileAccess(permission: TerminalSandboxFileAccessPermission, paths: readonly string[], precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<ITerminalSandboxFileAccessCheckResult> {
		if (!(await this._isSandboxConfiguredEnabled(precheckInputs))) {
			return { allowed: true, denied: [] };
		}

		await this._resolveRuntimeInfo();
		if (!this._tempDir) {
			await this._initTempDir();
		}

		const configFilePath = this._tempDir ? this._getUriPath(URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`)) : undefined;
		const accessPaths = await this._getFileSystemAccessPaths(configFilePath);
		const denied: string[] = [];
		for (const path of paths) {
			if (!path || !await this._hasFileSystemAccess(permission, path, accessPaths)) {
				denied.push(path);
			}
		}

		return { allowed: denied.length === 0, denied };
	}

	async getSandboxConfigPath(forceRefresh: boolean = false, precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<string | undefined> {
		if (!(await this._isSandboxConfiguredEnabled(precheckInputs))) {
			return undefined;
		}
		await this._resolveRuntimeInfo();
		if (!this._sandboxConfigPath || forceRefresh || this._needsForceUpdateConfigFile) {
			this._sandboxConfigPath = await this._createSandboxConfig();
			this._needsForceUpdateConfigFile = false;
		}
		return this._sandboxConfigPath;
	}

	async getMissingSandboxDependencies(): Promise<string[]> {
		const os = await this.getOS();
		if (os === OperatingSystem.Windows) {
			return [];
		}

		if (!this._sandboxDependencyStatus) {
			this._sandboxDependencyStatus = await this._host.checkSandboxDependencies();
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

	/**
	 * Deletes the sandbox temp directory if one was created. Hosts are expected
	 * to invoke this from their shutdown / disposal path; the engine itself does
	 * not delete the directory on `dispose()` because shutdown joiners need to
	 * be coordinated externally.
	 */
	async cleanupTempDir(): Promise<void> {
		if (!this._tempDir) {
			return;
		}
		try {
			await this._fileService.del(this._tempDir, { recursive: true, useTrash: false });
		} catch (error) {
			this._logService.warn('TerminalSandboxEngine: Failed to delete sandbox temp dir', error);
		}
	}

	// ---- private helpers ----------------------------------------------------

	private async _checkSandboxDependencies(forceRefresh = false): Promise<boolean> {
		const os = await this.getOS();
		if (os === OperatingSystem.Windows) {
			return true;
		}

		if (!forceRefresh && this._sandboxDependencyStatus) {
			return this._sandboxDependencyStatus.bubblewrapInstalled && this._sandboxDependencyStatus.bubblewrapUsable && this._sandboxDependencyStatus.socatInstalled;
		}

		const status = await this._host.checkSandboxDependencies();
		this._sandboxDependencyStatus = status;

		if (status && !status.bubblewrapInstalled) {
			this._logService.warn('TerminalSandboxEngine: bubblewrap (bwrap) is not installed');
		} else if (status && !status.bubblewrapUsable) {
			this._logService.warn('TerminalSandboxEngine: bubblewrap (bwrap) is installed but failed its capability check', status.bubblewrapError);
		}
		if (status && !status.socatInstalled) {
			this._logService.warn('TerminalSandboxEngine: socat is not installed');
		}

		return status ? status.bubblewrapInstalled && status.bubblewrapUsable && status.socatInstalled : true;
	}

	private _getBubblewrapRemediations(): readonly TerminalSandboxPreCheckRemediation[] | undefined {
		return [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction];
	}

	private _quoteShellArgument(value: string): string {
		return `'${value.replace(/'/g, `'\\''`)}'`;
	}

	private _getSandboxCommandWithPreservedCwd(command: string, cwd: URI | undefined): string {
		if (this._os !== OperatingSystem.Linux || !cwd?.path || cwd.path === this._tempDir?.path) {
			return command;
		}
		return `cd ${this._quoteShellArgument(cwd.path)} && ${command}`;
	}

	private _wrapSandboxRuntimeCommandForLaunch(sandboxRuntimeCommand: string, cwd: URI | undefined): string {
		const tempDirPath = this._tempDir?.path;
		return this._os === OperatingSystem.Linux && cwd?.path && tempDirPath && cwd.path !== tempDirPath
			? `cd ${this._quoteShellArgument(tempDirPath)}; ${sandboxRuntimeCommand}`
			: sandboxRuntimeCommand;
	}

	private _wrapUnsandboxedCommand(command: string, shell?: string): string {
		if (this._os === OperatingSystem.Windows) {
			return this._windowsMxcRuntime.wrapUnsandboxedCommand(command);
		}
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

		TerminalSandboxEngine._urlRegex.lastIndex = 0;
		while ((match = TerminalSandboxEngine._urlRegex.exec(command)) !== null) {
			const domain = this._extractDomainFromUrl(match[0]);
			if (domain) {
				domains.add(domain);
			}
		}

		TerminalSandboxEngine._sshRemoteRegex.lastIndex = 0;
		while ((match = TerminalSandboxEngine._sshRemoteRegex.exec(command)) !== null) {
			const domain = normalizeDomain(match[1], true);
			if (domain) {
				domains.add(domain);
			}
		}

		TerminalSandboxEngine._hostRegex.lastIndex = 0;
		while ((match = TerminalSandboxEngine._hostRegex.exec(command)) !== null) {
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

	private _normalizeCommandKeywords(commandKeywords: readonly string[]): string[] {
		return [...new Set(commandKeywords.map(keyword => keyword.toLowerCase()))].sort();
	}

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

	private _isSandboxAllowedByPrecheckInputs(precheckInputs: ITerminalSandboxPrecheckInputs | undefined): boolean {
		return precheckInputs?.isDefaultApprovalPermissionEnabled !== false;
	}

	private async _isSandboxConfiguredEnabled(precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<boolean> {
		if (!this._isSandboxAllowedByPrecheckInputs(precheckInputs)) {
			return false;
		}
		await this.getOS();
		if (this._os === OperatingSystem.Windows) {
			const value = this._getSandboxConfiguredWindowsEnabledValue();
			return isAgentSandboxEnabledValue(value);
		}
		const value = this._getSandboxConfiguredEnabledValue();
		return isAgentSandboxEnabledValue(value);
	}

	private async _resolveRuntimeInfo(): Promise<void> {
		if (this._runtimeResolved) {
			return;
		}
		this._runtimeResolved = true;
		const runtimeInfo = await this._host.getRuntimeInfo();
		this._appRoot = runtimeInfo.appRoot;
		this._execPath = runtimeInfo.execPath;
		this._runAsNode = runtimeInfo.runAsNode ?? false;
		this._userHome = await this._host.getUserHome();
		this._srtPath = this._pathJoin(this._appRoot, 'node_modules', '@vscode', 'sandbox-runtime', 'dist', 'cli.js');
		const rgPlatform = this._os === OperatingSystem.Windows ? 'win32' : this._os === OperatingSystem.Macintosh ? 'darwin' : 'linux';
		const rgBinary = this._os === OperatingSystem.Windows ? 'rg.exe' : 'rg';
		this._rgPath = this._pathJoin(this._appRoot, 'node_modules', '@vscode', 'ripgrep-universal', 'bin', `${rgPlatform}-${arch}`, rgBinary);
		this._mxcPath = this._windowsMxcRuntime.getExecutablePath(this._appRoot, runtimeInfo.arch);
	}

	private async _createSandboxConfig(): Promise<string | undefined> {
		if ((await this.isEnabled()) && !this._tempDir) {
			await this._initTempDir();
		}
		if (!this._tempDir) {
			return undefined;
		}

		const allowNetwork = this._commandAllowNetwork || await this.isSandboxAllowNetworkEnabled();
		const linuxFileSystemSetting = this._os === OperatingSystem.Linux
			? this._getSettingValue<ITerminalSandboxFileSystemSetting>(AgentSandboxSettingId.AgentSandboxLinuxFileSystem) ?? {}
			: {};
		const macFileSystemSetting = this._os === OperatingSystem.Macintosh
			? this._getSettingValue<ITerminalSandboxFileSystemSetting>(AgentSandboxSettingId.AgentSandboxMacFileSystem) ?? {}
			: {};
		const windowsFileSystemSetting = this._os === OperatingSystem.Windows
			? this._getSettingValue<ITerminalSandboxFileSystemSetting>(AgentSandboxSettingId.AgentSandboxWindowsFileSystem) ?? {}
			: {};
		const windowsSchemaVersion = this._os === OperatingSystem.Windows
			? this._getSettingValue<string>(AgentSandboxSettingId.AgentSandboxWindowsSchemaVersion)
			: undefined;
		const runtimeSetting = this._getSettingValue<Record<string, unknown>>(AgentSandboxSettingId.AgentSandboxAdvancedRuntime) ?? {};
		const commandRuntimeSetting = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
		const commandRuntimeAllowReadPaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, 'allowRead');
		const commandRuntimeAllowWritePaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, 'allowWrite');
		const configFileUri = URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);
		const configFilePath = this._getUriPath(configFileUri);
		let allowWritePaths: string[] = [];
		let allowReadPaths: string[] = [];
		let denyReadPaths: string[] = [];
		let denyWritePaths: string[] | undefined;
		if (this._os === OperatingSystem.Windows) {
			const filesystemPolicy = await this._getWindowsMxcFilesystemPolicy();
			const env = await this._getWindowsMxcEnvironment();
			allowWritePaths = await this._resolveFileSystemPaths([
				...await this._updateAllowWritePathsWithWorkspaceFolders(windowsFileSystemSetting.allowWrite),
				...filesystemPolicy.readwritePaths
			]);
			allowReadPaths = await this._resolveFileSystemPaths([...(windowsFileSystemSetting.allowRead ?? []), ...filesystemPolicy.readonlyPaths]);
			denyReadPaths = await this._resolveFileSystemPaths(windowsFileSystemSetting.denyRead ?? []);
			this._windowsMxcEnvironment = env;
		} else if (this._os === OperatingSystem.Macintosh) {
			allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter(path => path !== configFilePath);
			allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(macFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
			denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...(macFileSystemSetting.denyRead ?? []), configFilePath]));
			denyWritePaths = macFileSystemSetting.denyWrite ? await this._resolveFileSystemPaths(macFileSystemSetting.denyWrite) : undefined;
		} else if (this._os === OperatingSystem.Linux) {
			allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter(path => path !== configFilePath);
			allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(linuxFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
			denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...(linuxFileSystemSetting.denyRead ?? []), configFilePath]));
			denyWritePaths = await this._resolveFileSystemPaths(linuxFileSystemSetting.denyWrite);
		}
		const sandboxSettings = this._os === OperatingSystem.Windows ? await this._windowsMxcRuntime.createConfig({
			command: this._commandLine ?? '',
			shell: this._commandShell,
			cwd: this._commandCwd ?? this._getDefaultWindowsMxcCwd(),
			tempDir: this._tempDir,
			schemaVersion: windowsSchemaVersion,
			allowNetwork,
			allowReadPaths,
			allowWritePaths,
			denyReadPaths,
			env: this._windowsMxcEnvironment ?? [],
		}, this._buildSandboxPayload) : {
			network: allowNetwork ? { allowedDomains: [], deniedDomains: [], enabled: false } : this.getResolvedNetworkDomains(),
			filesystem: {
				denyRead: denyReadPaths,
				allowRead: allowReadPaths,
				allowWrite: allowWritePaths,
				denyWrite: denyWritePaths,
			},
		};
		if (this._os !== OperatingSystem.Windows) {
			const sandboxRuntimeSettings = sandboxSettings as Record<string, unknown>;
			this._mergeAdditionalSandboxConfigProperties(sandboxRuntimeSettings, runtimeSetting);
			this._mergeAdditionalSandboxConfigProperties(sandboxRuntimeSettings, commandRuntimeSetting);
			if (this._os === OperatingSystem.Macintosh) {
				sandboxRuntimeSettings.allowPty ??= true;
			}
		}
		this._sandboxConfigPath = configFilePath;
		await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, '\t')), { overwrite: true });
		return this._sandboxConfigPath;
	}

	private async _getFileSystemAccessPaths(configFilePath: string | undefined): Promise<ITerminalSandboxFileSystemAccessPaths> {
		const linuxFileSystemSetting = this._os === OperatingSystem.Linux
			? this._getSettingValue<ITerminalSandboxFileSystemSetting>(AgentSandboxSettingId.AgentSandboxLinuxFileSystem) ?? {}
			: {};
		const macFileSystemSetting = this._os === OperatingSystem.Macintosh
			? this._getSettingValue<ITerminalSandboxFileSystemSetting>(AgentSandboxSettingId.AgentSandboxMacFileSystem) ?? {}
			: {};
		const windowsFileSystemSetting = this._os === OperatingSystem.Windows
			? this._getSettingValue<ITerminalSandboxFileSystemSetting>(AgentSandboxSettingId.AgentSandboxWindowsFileSystem) ?? {}
			: {};
		const commandRuntimeSetting = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
		const commandRuntimeAllowReadPaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, 'allowRead');
		const commandRuntimeAllowWritePaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, 'allowWrite');
		let allowWritePaths: string[] = [];
		let allowReadPaths: string[] = [];
		let denyReadPaths: string[] = [];
		let denyWritePaths: string[] | undefined;
		if (this._os === OperatingSystem.Windows) {
			const filesystemPolicy = await this._getWindowsMxcFilesystemPolicy();
			allowWritePaths = await this._resolveFileSystemPaths([
				...await this._updateAllowWritePathsWithWorkspaceFolders(windowsFileSystemSetting.allowWrite),
				...filesystemPolicy.readwritePaths
			]);
			allowReadPaths = await this._resolveFileSystemPaths([...(windowsFileSystemSetting.allowRead ?? []), ...filesystemPolicy.readonlyPaths]);
			denyReadPaths = await this._resolveFileSystemPaths(windowsFileSystemSetting.denyRead ?? []);
		} else if (this._os === OperatingSystem.Macintosh) {
			allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter(path => path !== configFilePath);
			allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(macFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
			denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...(macFileSystemSetting.denyRead ?? []), ...(configFilePath ? [configFilePath] : [])]));
			denyWritePaths = macFileSystemSetting.denyWrite ? await this._resolveFileSystemPaths(macFileSystemSetting.denyWrite) : undefined;
		} else if (this._os === OperatingSystem.Linux) {
			allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter(path => path !== configFilePath);
			allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(linuxFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
			denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...(linuxFileSystemSetting.denyRead ?? []), ...(configFilePath ? [configFilePath] : [])]));
			denyWritePaths = await this._resolveFileSystemPaths(linuxFileSystemSetting.denyWrite);
		}

		return { allowReadPaths, allowWritePaths, denyReadPaths, denyWritePaths };
	}

	private async _hasFileSystemAccess(permission: TerminalSandboxFileAccessPermission, path: string, accessPaths: ITerminalSandboxFileSystemAccessPaths): Promise<boolean> {
		const resolvedPaths = await this._resolveFileSystemPath(path);
		if (permission === 'write') {
			if (this._os === OperatingSystem.Windows && this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.denyReadPaths)) {
				return false;
			}
			if (this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.denyWritePaths ?? [])) {
				return false;
			}
			return this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.allowWritePaths);
		}

		if (this._matchesAnyFileSystemPath(resolvedPaths, [...accessPaths.allowReadPaths, ...accessPaths.allowWritePaths])) {
			return true;
		}
		return !this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.denyReadPaths);
	}

	private _matchesAnyFileSystemPath(paths: readonly string[], matchers: readonly string[]): boolean {
		return paths.some(path => matchers.some(matcher => this._matchesFileSystemPath(path, matcher)));
	}

	/**
	 * Returns whether a candidate filesystem path is covered by a sandbox allow/deny
	 * matcher. Both values are normalized with the target sandbox OS semantics before
	 * comparison. Non-glob matchers are treated as exact-or-parent matches; glob
	 * matchers are evaluated with VS Code's glob matcher.
	 *
	 * Examples:
	 * - Linux/macOS: `/workspace/project/src/file.ts` matches `/workspace/project`.
	 * - Linux/macOS: `/workspace/project2/file.ts` does not match `/workspace/project`.
	 * - Windows: `C:\Repo\src\file.ts` matches `c:/repo` because matching is
	 *   case-insensitive and backslashes are normalized to `/`.
	 * - Glob: `/workspace/project/package.json` matches `/workspace/project/*.json`.
	 */
	private _matchesFileSystemPath(path: string, matcher: string): boolean {
		const normalizedPath = this._normalizeFileSystemAccessPath(path);
		const normalizedMatcher = this._normalizeFileSystemAccessPath(matcher, true);
		const ignoreCase = this._os === OperatingSystem.Windows;
		if (this._containsGlobPattern(normalizedMatcher)) {
			return globMatch(normalizedMatcher, normalizedPath, { ignoreCase });
		}
		return this._fileSystemPathExtUri.isEqualOrParent(this._toFileSystemAccessUri(normalizedPath), this._toFileSystemAccessUri(normalizedMatcher));
	}

	/**
	 * Converts a normalized sandbox filesystem path into a pseudo URI so the common
	 * `ExtUri.isEqualOrParent` comparer can be used instead of deprecated string
	 * path helpers. A non-`file` scheme is intentional: it keeps comparison on the
	 * URI path component and avoids converting through the host OS' native `fsPath`
	 * rules, which may differ from the sandbox target OS.
	 *
	 * Examples:
	 * - `/workspace/project` becomes `terminal-sandbox-path:/workspace/project`.
	 * - `C:/Repo` becomes `terminal-sandbox-path:/C:/Repo` so Windows drive paths
	 *   are still valid URI paths for comparison.
	 */
	private _toFileSystemAccessUri(path: string): URI {
		return URI.from({ scheme: 'terminal-sandbox-path', path: path.startsWith('/') ? path : `/${path}` });
	}

	/**
	 * Normalizes a path or matcher into the form used for sandbox access checks.
	 * On Windows, backslashes are converted to `/` and URI-shaped drive paths like
	 * `/C:/Users/me` are converted to `C:/Users/me`. Unless `preserveGlob` is true
	 * for a glob matcher, the path is POSIX-normalized to remove redundant `.`/`..`
	 * segments. Trailing slashes are removed except for filesystem roots.
	 *
	 * Examples:
	 * - Linux/macOS: `/workspace/../workspace/app/` becomes `/workspace/app`.
	 * - Windows: `C:\Users\me\project\` becomes `C:/Users/me/project`.
	 * - Windows: `/C:/Users/me/project` becomes `C:/Users/me/project`.
	 * - Glob with `preserveGlob=true`: `/workspace/project/*.json` keeps the glob
	 *   pattern intact for `globMatch`.
	 */
	private _normalizeFileSystemAccessPath(path: string, preserveGlob: boolean = false): string {
		let normalizedPath = this._os === OperatingSystem.Windows ? path.replace(/\\/g, '/') : path;
		if (this._os === OperatingSystem.Windows && /^\/[a-zA-Z]:($|\/)/.test(normalizedPath)) {
			normalizedPath = normalizedPath.slice(1);
		}
		if (!preserveGlob || !this._containsGlobPattern(normalizedPath)) {
			normalizedPath = posix.normalize(normalizedPath);
		}
		if (normalizedPath.length > 1 && normalizedPath.endsWith('/') && !/^[a-zA-Z]:\/$/.test(normalizedPath)) {
			normalizedPath = normalizedPath.replace(/\/+$/, '');
		}
		return normalizedPath;
	}

	private _containsGlobPattern(path: string): boolean {
		return /[*?{\[]/.test(path);
	}

	private readonly _buildSandboxPayload = (commandLine: string, policy: IWindowsMxcSandboxPolicy, workingDirectory?: string, containerName?: string, containment?: IWindowsMxcPolicyContainment): Promise<IWindowsMxcConfig | undefined> => {
		return this._host.buildWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment);
	};

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

	private async _getWindowsMxcFilesystemPolicy(): Promise<IWindowsMxcFilesystemPolicy> {
		if (!this._windowsMxcFilesystemPolicy) {
			this._windowsMxcFilesystemPolicy = await this._host.getWindowsMxcFilesystemPolicy() ?? { readonlyPaths: [], readwritePaths: [] };
		}
		return this._windowsMxcFilesystemPolicy;
	}

	private async _getWindowsMxcEnvironment(): Promise<string[]> {
		if (!this._windowsMxcEnvironment) {
			this._windowsMxcEnvironment = await this._host.getWindowsMxcEnvironment() ?? [];
		}
		return this._windowsMxcEnvironment;
	}

	private _pathJoin = (...segments: string[]) => {
		const path = this._os === OperatingSystem.Windows ? win32 : posix;
		return path.join(...segments);
	};

	private _pathDirname(path: string): string {
		return (this._os === OperatingSystem.Windows ? win32 : posix).dirname(path);
	}

	private _getUriPath(uri: URI): string {
		return this._os === OperatingSystem.Windows ? this._windowsMxcRuntime.toWindowsPath(uri) : uri.path;
	}

	private async _initTempDir(): Promise<void> {
		if (!(await this.isEnabled())) {
			return;
		}
		this._needsForceUpdateConfigFile = true;
		this._tempDir = await this._host.getSandboxTempDir();
		if (this._tempDir) {
			await this._fileService.createFolder(this._tempDir);
			this._defaultWritePaths.push(this._getUriPath(this._tempDir));
		} else {
			this._logService.warn('TerminalSandboxEngine: Cannot create sandbox settings file because no tmpDir is available in this environment');
		}
	}

	private async _updateAllowWritePathsWithWorkspaceFolders(configuredAllowWrite: string[] | undefined, commandRuntimeAllowWrite: string[] = []): Promise<string[]> {
		const writeRootPaths = this._host.getWriteRoots().map(folder => this._getUriPath(folder));
		return [...new Set([...writeRootPaths, ...this._defaultWritePaths, ...await this._getWorkspaceStorageReadPaths(), ...(configuredAllowWrite ?? []), ...commandRuntimeAllowWrite])];
	}

	private _updateDenyReadPathsWithHome(configuredDenyRead: string[] | undefined): string[] {
		// TODO: On Windows, deny read on home directory.
		if (this._os === OperatingSystem.Windows) {
			return [...new Set(configuredDenyRead ?? [])];
		}
		const userHome = this._userHome ? this._getUriPath(this._userHome) : undefined;
		return [...new Set([...(configuredDenyRead ?? []), ...(userHome ? [userHome] : [])])];
	}

	private async _updateAllowReadPathsWithAllowWrite(configuredAllowRead: string[] | undefined, allowWrite: string[], commandRuntimeAllowRead: string[] = []): Promise<string[]> {
		return [...new Set([...(configuredAllowRead ?? []), ...getTerminalSandboxReadAllowListForCommands(this._os, this._commandAllowListKeywords, this._commandAllowListCommandDetails), ...commandRuntimeAllowRead, ...this._getSandboxRuntimeReadPaths(), ...await this._getWorkspaceStorageReadPaths(), ...allowWrite])];
	}

	private async _resolveFileSystemPaths(paths: string[] | undefined): Promise<string[]> {
		const resolvedPaths = await Promise.all((paths ?? []).map(path => this._resolveFileSystemPath(path)));
		const seenPaths = new Set<string>();
		return resolvedPaths.flat().filter(path => {
			const comparisonKey = this._getFileSystemPathComparisonKey(path);
			if (seenPaths.has(comparisonKey)) {
				return false;
			}
			seenPaths.add(comparisonKey);
			return true;
		});
	}

	private _getFileSystemPathComparisonKey(path: string): string {
		return this._os === OperatingSystem.Windows ? path.replace(/\//g, '\\').toLowerCase() : path;
	}

	private async _resolveFileSystemPath(path: string): Promise<string[]> {
		const expandedPath = this._os === OperatingSystem.Linux ? this._expandHomePath(path) : path;
		if (!this._isAbsoluteFileSystemPath(expandedPath)) {
			return [expandedPath];
		}

		try {
			const realpath = await this._fileService.realpath(this._toFileSystemResource(expandedPath));
			const resolvedPath = realpath ? this._getUriPath(realpath) : undefined;
			// Keep the expanded path (the configured path after home expansion) so permissions apply when accessed through the symlink.
			// Also include the resolved path (the canonical symlink target) so the same permissions apply when accessed directly.
			return resolvedPath && resolvedPath !== expandedPath ? [expandedPath, resolvedPath] : [expandedPath];
		} catch {
			return [expandedPath];
		}
	}

	private _isAbsoluteFileSystemPath(path: string): boolean {
		return (this._os === OperatingSystem.Windows ? win32 : posix).isAbsolute(path);
	}

	private _toFileSystemResource(path: string): URI {
		if (this._os === OperatingSystem.Windows) {
			return this._toWindowsFileSystemResource(path);
		}
		return this._userHome?.with({ path }) ?? this._tempDir?.with({ path }) ?? this._host.getWriteRoots()[0]?.with({ path }) ?? URI.file(path);
	}

	private _toWindowsFileSystemResource(path: string): URI {
		// Normalize Windows separators for URI parsing, e.g. `C:\Users\me` becomes `C:/Users/me`.
		const normalizedPath = path.replace(/\\/g, '/');
		// Match UNC paths, e.g. `//server/share/folder` becomes `file://server/share/folder`.
		if (/^\/\/[^/]/.test(normalizedPath)) {
			const firstPathSeparator = normalizedPath.indexOf('/', 2);
			if (firstPathSeparator === -1) {
				return URI.from({ scheme: 'file', authority: normalizedPath.slice(2), path: '/' });
			}
			return URI.from({ scheme: 'file', authority: normalizedPath.slice(2, firstPathSeparator), path: normalizedPath.slice(firstPathSeparator) || '/' });
		}
		// Match drive-letter paths, e.g. `C:/Users/me` becomes `file:///c:/Users/me`.
		if (/^[a-zA-Z]:($|\/)/.test(normalizedPath)) {
			return URI.from({ scheme: 'file', path: `/${normalizedPath[0].toLowerCase()}${normalizedPath.slice(1)}` });
		}
		// Match URI-shaped drive paths, e.g. `/C:/Users/me` becomes `file:///c:/Users/me`.
		if (/^\/[a-zA-Z]:($|\/)/.test(normalizedPath)) {
			return URI.from({ scheme: 'file', path: `/${normalizedPath[1].toLowerCase()}${normalizedPath.slice(2)}` });
		}
		return URI.from({ scheme: 'file', path: normalizedPath });
	}

	private _expandHomePath(path: string): string {
		const userHome = this._userHome?.path;
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
		if (!this._appRoot) {
			return [];
		}
		if (this._os === OperatingSystem.Windows) {
			return this._windowsMxcRuntime.getRuntimeReadPaths(this._appRoot, this._mxcPath);
		}
		const paths: string[] = [this._appRoot];
		if (this._execPath) {
			for (const path of [this._execPath, this._pathDirname(this._execPath)]) {
				if (!this._isPathUnderAppRoot(path)) {
					paths.push(path);
				}
			}
		}
		return paths;
	}

	private _isPathUnderAppRoot(path: string): boolean {
		if (!this._appRoot) {
			return false;
		}
		return path === this._appRoot || path.startsWith(`${this._appRoot}${this._os === OperatingSystem.Windows ? win32.sep : posix.sep}`);
	}

	private async _getWorkspaceStorageReadPaths(): Promise<string[]> {
		const root = await this._host.getWorkspaceStorageReadRoot();
		return root ? [this._getUriPath(root)] : [];
	}

	private _getDefaultWindowsMxcCwd(): URI | undefined {
		return this._host.getWriteRoots()[0];
	}

	private _getSandboxConfiguredEnabledValue(): AgentSandboxEnabledValue {
		return this._normalizeSandboxEnabledValue(this._getSettingValue<AgentSandboxEnabledSettingValue>(AgentSandboxSettingId.AgentSandboxEnabled));
	}

	private _getSandboxConfiguredWindowsEnabledValue(): AgentSandboxEnabledValue {
		return this._normalizeSandboxEnabledValue(this._getSettingValue<AgentSandboxEnabledSettingValue>(AgentSandboxSettingId.AgentSandboxWindowsEnabled));
	}

	private _normalizeSandboxEnabledValue(value: AgentSandboxEnabledSettingValue | undefined): AgentSandboxEnabledValue {
		return value === undefined ? AgentSandboxEnabledValue.Off : normalizeAgentSandboxEnabledValue(value);
	}

	private _isSandboxAllowNetworkConfigured(): boolean {
		if (this._getSettingValue<boolean>(AgentSandboxSettingId.AgentSandboxAllowNetwork) === true) {
			return true;
		}
		if (this._os === OperatingSystem.Windows) {
			return this._getSandboxConfiguredWindowsEnabledValue() === AgentSandboxEnabledValue.AllowNetwork;
		}
		return this._getSandboxConfiguredEnabledValue() === AgentSandboxEnabledValue.AllowNetwork;
	}

	private _areUnsandboxedCommandsAllowed(): boolean {
		return this._getSettingValue<boolean>(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands) === true;
	}

	private _areRetryWithAllowNetworkRequestsAllowed(): boolean {
		return this._getSettingValue<boolean>(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests) === true;
	}

	private _getSettingValue<T>(settingId: AgentSandboxSettingId | AgentNetworkDomainSettingId): T | undefined {
		return this._host.getSandboxSetting<T>(settingId);
	}
}
