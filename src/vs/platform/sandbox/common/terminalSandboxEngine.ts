/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { dirname, posix, win32 } from '../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../configuration/common/configuration.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { matchesDomainPattern, normalizeDomain } from '../../networkFilter/common/domainMatcher.js';
import { AgentNetworkDomainSettingId } from '../../networkFilter/common/settings.js';
import { ISandboxDependencyStatus } from './sandboxHelperService.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from './settings.js';
import { getTerminalSandboxReadAllowListForCommands } from './terminalSandboxReadAllowList.js';
import { getTerminalSandboxRuntimeConfigurationForCommands } from './terminalSandboxRuntimeConfigurationPerOperation.js';
import { ITerminalSandboxCommand, ITerminalSandboxPrerequisiteCheckResult, ITerminalSandboxResolvedNetworkDomains, ITerminalSandboxWrapResult, TerminalSandboxPrerequisiteCheck } from './terminalSandboxService.js';

interface ITerminalSandboxFileSystemSetting {
	denyRead?: string[];
	allowRead?: string[];
	allowWrite?: string[];
	denyWrite?: string[];
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
	/** Path added to `allowRead` for the engine's workspace/session storage area. */
	getWorkspaceStorageReadRoot(): Promise<URI | undefined>;
	/** Roots that must be writable inside the sandbox (workspace folders / session cwds). */
	getWriteRoots(): readonly URI[];
	/** Fires when {@link getWriteRoots} or {@link getWorkspaceStorageReadRoot} change. */
	readonly onDidChangeRoots: Event<void>;
	/** Resolves the installed sandbox-dependency status (bubblewrap, socat). */
	checkSandboxDependencies(): Promise<ISandboxDependencyStatus | undefined>;
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
	private _sandboxConfigPath: string | undefined;
	private _sandboxDependencyStatus: ISandboxDependencyStatus | undefined;
	private _needsForceUpdateConfigFile = true;
	private _tempDir: URI | undefined;
	private _commandAllowListKeywords: readonly string[] = [];
	private _commandAllowListCommandDetails: readonly ITerminalSandboxCommand[] = [];
	private _commandCwd: URI | undefined;
	private _os: OperatingSystem = OS;
	private readonly _defaultWritePaths: string[] = [];

	constructor(
		private readonly _host: ITerminalSandboxEngineHost,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e: IConfigurationChangeEvent | undefined) => {
			if (this._affectsSandboxConfiguration(e)) {
				this.setNeedsForceUpdateConfigFile();
			}
		}));
		this._register(this._host.onDidChangeRoots(() => this.setNeedsForceUpdateConfigFile()));
	}

	async isEnabled(): Promise<boolean> {
		return this._isSandboxConfiguredEnabled();
	}

	async isSandboxAllowNetworkEnabled(): Promise<boolean> {
		if (!(await this._isSandboxConfiguredEnabled())) {
			return false;
		}
		return this._isSandboxAllowNetworkConfigured();
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
		const allowedDomains = this._getSettingValue<string[]>(AgentNetworkDomainSettingId.AllowedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedSandboxAllowedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedOldAllowedNetworkDomains) ?? [];
		const deniedDomains = this._getSettingValue<string[]>(AgentNetworkDomainSettingId.DeniedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedSandboxDeniedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedOldDeniedNetworkDomains) ?? [];
		return { allowedDomains, deniedDomains };
	}

	async wrapCommand(command: string, requestUnsandboxedExecution?: boolean, shell?: string, cwd?: URI, commandDetails?: readonly ITerminalSandboxCommand[]): Promise<ITerminalSandboxWrapResult> {
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
			|| this._commandCwd?.toString() !== cwd?.toString();
		if (shouldRefreshConfig) {
			this._commandAllowListKeywords = normalizedCommandKeywords;
			this._commandAllowListCommandDetails = normalizedCommandDetails;
			this._commandCwd = cwd;
			await this.getSandboxConfigPath(true);
		}

		if (!this._sandboxConfigPath || !this._tempDir) {
			throw new Error('Sandbox config path or temp dir not initialized');
		}

		const allowUnsandboxedCommands = this._areUnsandboxedCommandsAllowed();

		// Check if the command would attempt to access any blocked network domains before wrapping it in the sandbox.
		const blockedDomainResult = requestUnsandboxedExecution || !allowUnsandboxedCommands ? { blockedDomains: [], deniedDomains: [] } : this._getBlockedDomains(command);
		if (!requestUnsandboxedExecution && allowUnsandboxedCommands && blockedDomainResult.blockedDomains.length > 0) {
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
		const sandboxRuntimeCommand = `PATH="$PATH:${dirname(this._rgPath)}" TMPDIR="${this._tempDir.path}" CLAUDE_TMPDIR="${this._tempDir.path}" "${this._execPath}" "${this._srtPath}" --settings "${this._sandboxConfigPath}" -c ${this._quoteShellArgument(commandToRunInSandbox)}`;
		const wrappedCommand = this._os === OperatingSystem.Linux && cwd?.path && cwd.path !== this._tempDir.path
			? `cd ${this._quoteShellArgument(this._tempDir.path)}; ${sandboxRuntimeCommand}`
			: sandboxRuntimeCommand;
		// On workbench Electron builds the exec path points at the Electron binary, so we
		// prefix `ELECTRON_RUN_AS_NODE=1` to make it behave as Node.js. Remote workbench and
		// the agent host already resolve a real `node` binary and the host clears the flag.
		if (this._runAsNode) {
			return {
				command: `ELECTRON_RUN_AS_NODE=1 ${wrappedCommand}`,
				isSandboxWrapped: true,
			};
		}
		return {
			command: wrappedCommand,
			isSandboxWrapped: true,
		};
	}

	async checkForSandboxingPrereqs(forceRefresh: boolean = false): Promise<ITerminalSandboxPrerequisiteCheckResult> {
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

	async getSandboxConfigPath(forceRefresh: boolean = false): Promise<string | undefined> {
		if (!(await this._isSandboxConfiguredEnabled())) {
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

		if (!this._sandboxDependencyStatus || !this._sandboxDependencyStatus.bubblewrapInstalled || !this._sandboxDependencyStatus.socatInstalled) {
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

	private _affectsSandboxConfiguration(e: IConfigurationChangeEvent | undefined): boolean {
		if (!e) {
			return true; // initial run-and-subscribe
		}
		return e.affectsConfiguration(AgentSandboxSettingId.AgentSandboxEnabled)
			|| e.affectsConfiguration(AgentSandboxSettingId.DeprecatedAgentSandboxEnabled)
			|| e.affectsConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains)
			|| e.affectsConfiguration(AgentNetworkDomainSettingId.DeprecatedSandboxAllowedNetworkDomains)
			|| e.affectsConfiguration(AgentNetworkDomainSettingId.DeprecatedOldAllowedNetworkDomains)
			|| e.affectsConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains)
			|| e.affectsConfiguration(AgentNetworkDomainSettingId.DeprecatedSandboxDeniedNetworkDomains)
			|| e.affectsConfiguration(AgentNetworkDomainSettingId.DeprecatedOldDeniedNetworkDomains)
			|| e.affectsConfiguration(AgentSandboxSettingId.AgentSandboxLinuxFileSystem)
			|| e.affectsConfiguration(AgentSandboxSettingId.DeprecatedAgentSandboxLinuxFileSystem)
			|| e.affectsConfiguration(AgentSandboxSettingId.AgentSandboxMacFileSystem)
			|| e.affectsConfiguration(AgentSandboxSettingId.DeprecatedAgentSandboxMacFileSystem)
			|| e.affectsConfiguration(AgentSandboxSettingId.AgentSandboxAdvancedRuntime);
	}

	private async _checkSandboxDependencies(forceRefresh = false): Promise<boolean> {
		const os = await this.getOS();
		if (os === OperatingSystem.Windows) {
			return false;
		}

		if (!forceRefresh && this._sandboxDependencyStatus) {
			return this._sandboxDependencyStatus.bubblewrapInstalled && this._sandboxDependencyStatus.socatInstalled;
		}

		const status = await this._host.checkSandboxDependencies();
		this._sandboxDependencyStatus = status;

		if (status && !status.bubblewrapInstalled) {
			this._logService.warn('TerminalSandboxEngine: bubblewrap (bwrap) is not installed');
		}
		if (status && !status.socatInstalled) {
			this._logService.warn('TerminalSandboxEngine: socat is not installed');
		}

		return status ? status.bubblewrapInstalled && status.socatInstalled : true;
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

	private async _isSandboxConfiguredEnabled(): Promise<boolean> {
		const os = await this.getOS();
		if (os === OperatingSystem.Windows) {
			return false;
		}
		const value = this._getSandboxConfiguredEnabledValue();
		return value === true || value === AgentSandboxEnabledValue.On || value === AgentSandboxEnabledValue.AllowNetwork;
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
		this._rgPath = this._pathJoin(this._appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg');
	}

	private async _createSandboxConfig(): Promise<string | undefined> {
		if ((await this.isEnabled()) && !this._tempDir) {
			await this._initTempDir();
		}
		if (!this._tempDir) {
			return undefined;
		}

		const allowNetwork = await this.isSandboxAllowNetworkEnabled();
		const linuxFileSystemSetting = this._os === OperatingSystem.Linux
			? this._getSettingValue<ITerminalSandboxFileSystemSetting>(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, AgentSandboxSettingId.DeprecatedAgentSandboxLinuxFileSystem) ?? {}
			: {};
		const macFileSystemSetting = this._os === OperatingSystem.Macintosh
			? this._getSettingValue<ITerminalSandboxFileSystemSetting>(AgentSandboxSettingId.AgentSandboxMacFileSystem, AgentSandboxSettingId.DeprecatedAgentSandboxMacFileSystem) ?? {}
			: {};
		const runtimeSetting = this._getSettingValue<Record<string, unknown>>(AgentSandboxSettingId.AgentSandboxAdvancedRuntime) ?? {};
		const commandRuntimeSetting = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
		const commandRuntimeAllowReadPaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, 'allowRead');
		const commandRuntimeAllowWritePaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, 'allowWrite');
		const configFileUri = URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);
		let allowWritePaths: string[] = [];
		let allowReadPaths: string[] = [];
		let denyReadPaths: string[] = [];
		let denyWritePaths: string[] | undefined;
		if (this._os === OperatingSystem.Macintosh) {
			allowWritePaths = await this._resolveFileSystemPaths(this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths));
			allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(macFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
			denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome(macFileSystemSetting.denyRead));
			denyWritePaths = macFileSystemSetting.denyWrite ? await this._resolveFileSystemPaths(macFileSystemSetting.denyWrite) : undefined;
		} else if (this._os === OperatingSystem.Linux) {
			allowWritePaths = await this._resolveFileSystemPaths(this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths));
			allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(linuxFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
			denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome(linuxFileSystemSetting.denyRead));
			denyWritePaths = await this._resolveFileSystemPaths(linuxFileSystemSetting.denyWrite);
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

	private _pathJoin = (...segments: string[]) => {
		const path = this._os === OperatingSystem.Windows ? win32 : posix;
		return path.join(...segments);
	};

	private async _initTempDir(): Promise<void> {
		if (!(await this.isEnabled())) {
			return;
		}
		this._needsForceUpdateConfigFile = true;
		this._tempDir = await this._host.getSandboxTempDir();
		if (this._tempDir) {
			await this._fileService.createFolder(this._tempDir);
			this._defaultWritePaths.push(this._tempDir.path);
		} else {
			this._logService.warn('TerminalSandboxEngine: Cannot create sandbox settings file because no tmpDir is available in this environment');
		}
	}

	private _updateAllowWritePathsWithWorkspaceFolders(configuredAllowWrite: string[] | undefined, commandRuntimeAllowWrite: string[] = []): string[] {
		const writeRootPaths = this._host.getWriteRoots().map(folder => folder.path);
		return [...new Set([...writeRootPaths, ...this._defaultWritePaths, ...(configuredAllowWrite ?? []), ...commandRuntimeAllowWrite])];
	}

	private _updateDenyReadPathsWithHome(configuredDenyRead: string[] | undefined): string[] {
		const userHome = this._userHome?.path;
		return [...new Set([...(configuredDenyRead ?? []), ...(userHome ? [userHome] : [])])];
	}

	private async _updateAllowReadPathsWithAllowWrite(configuredAllowRead: string[] | undefined, allowWrite: string[], commandRuntimeAllowRead: string[] = []): Promise<string[]> {
		return [...new Set([...(configuredAllowRead ?? []), ...getTerminalSandboxReadAllowListForCommands(this._os, this._commandAllowListKeywords, this._commandAllowListCommandDetails), ...commandRuntimeAllowRead, ...this._getSandboxRuntimeReadPaths(), ...await this._getWorkspaceStorageReadPaths(), ...allowWrite])];
	}

	private async _resolveFileSystemPaths(paths: string[] | undefined): Promise<string[]> {
		const resolvedPaths = await Promise.all((paths ?? []).map(path => this._resolveFileSystemPath(path)));
		return [...new Set(resolvedPaths)];
	}

	private async _resolveFileSystemPath(path: string): Promise<string> {
		const expandedPath = this._os === OperatingSystem.Linux ? this._expandHomePath(path) : path;
		if (!this._isAbsoluteFileSystemPath(expandedPath)) {
			return expandedPath;
		}

		try {
			const realpath = await this._fileService.realpath(this._toFileSystemResource(expandedPath));
			return realpath?.path && realpath.path !== expandedPath ? realpath.path : expandedPath;
		} catch {
			return expandedPath;
		}
	}

	private _isAbsoluteFileSystemPath(path: string): boolean {
		return (this._os === OperatingSystem.Windows ? win32 : posix).isAbsolute(path);
	}

	private _toFileSystemResource(path: string): URI {
		return this._userHome?.with({ path }) ?? this._tempDir?.with({ path }) ?? this._host.getWriteRoots()[0]?.with({ path }) ?? URI.file(path);
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
		if (!this._appRoot) {
			return false;
		}
		return path === this._appRoot || path.startsWith(`${this._appRoot}${this._os === OperatingSystem.Windows ? win32.sep : posix.sep}`);
	}

	private async _getWorkspaceStorageReadPaths(): Promise<string[]> {
		const root = await this._host.getWorkspaceStorageReadRoot();
		return root ? [root.path] : [];
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

	private _getSettingValue<T>(settingId: AgentSandboxSettingId | AgentNetworkDomainSettingId, ...deprecatedSettingIds: (AgentSandboxSettingId | AgentNetworkDomainSettingId)[]): T | undefined {
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
					this._logService.warn(`TerminalSandboxEngine: Using deprecated setting ${deprecatedId} because ${settingId} is not set. Please update your settings to use ${settingId} instead.`);
					return deprecated.value;
				}
			}
		}
		return setting.value;
	}
}
