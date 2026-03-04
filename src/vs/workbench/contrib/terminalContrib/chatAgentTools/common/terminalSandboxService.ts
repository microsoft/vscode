/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { match as matchGlobPattern } from '../../../../../base/common/glob.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { dirname, posix, win32 } from '../../../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITerminalSandboxNetworkSettings } from './terminalSandbox.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TerminalChatAgentToolsSettingId } from './terminalChatAgentToolsConfiguration.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { ITrustedDomainService } from '../../../url/common/trustedDomainService.js';

export const ITerminalSandboxService = createDecorator<ITerminalSandboxService>('terminalSandboxService');

export interface ITerminalSandboxService {
	readonly _serviceBrand: undefined;
	isEnabled(): Promise<boolean>;
	wrapCommand(command: string): string;
	getSandboxConfigPath(forceRefresh?: boolean): Promise<string | undefined>;
	getTempDir(): URI | undefined;
	getDomainListStatus(domain: string): { inAllowedDomains: boolean; inDeniedDomains: boolean };
	addDomainToAllowedDomains(domain: string): Promise<boolean>;
	getFileSystemPathStatus(path: string): { inDenyRead: boolean; inAllowWrite: boolean; inDenyWrite: boolean };
	addPathToAllowedWrite(path: string): Promise<boolean>;
	setNeedsForceUpdateConfigFile(): void;
}

type ITerminalSandboxFileSystemSettings = { denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] };

export class TerminalSandboxService extends Disposable implements ITerminalSandboxService {
	readonly _serviceBrand: undefined;
	private _srtPath: string | undefined;
	private _rgPath: string | undefined;
	private _srtPathResolved = false;
	private _execPath?: string;
	private _sandboxConfigPath: string | undefined;
	private _needsForceUpdateConfigFile = true;
	private _tempDir: URI | undefined;
	private _sandboxSettingsId: string | undefined;
	private _remoteEnvDetailsPromise: Promise<IRemoteAgentEnvironment | null>;
	private _remoteEnvDetails: IRemoteAgentEnvironment | null = null;
	private _appRoot: string;
	private _os: OperatingSystem = OS;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ITrustedDomainService private readonly _trustedDomainService: ITrustedDomainService,
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
	}

	public async isEnabled(): Promise<boolean> {
		this._remoteEnvDetails = await this._remoteEnvDetailsPromise;
		this._os = this._remoteEnvDetails ? this._remoteEnvDetails.os : OS;
		if (this._os === OperatingSystem.Windows) {
			return false;
		}
		return this._configurationService.getValue<boolean>(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled);
	}

	public wrapCommand(command: string): string {
		if (!this._sandboxConfigPath || !this._tempDir) {
			throw new Error('Sandbox config path or temp dir not initialized');
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
		const wrappedCommand = `PATH="$PATH:${dirname(this._rgPath)}" TMPDIR="${this._tempDir.path}" "${this._execPath}" "${this._srtPath}" --settings "${this._sandboxConfigPath}" -c ${this._quoteShellArgument(command)}`;
		if (this._remoteEnvDetails) {
			return `${wrappedCommand}`;
		}
		return `ELECTRON_RUN_AS_NODE=1 ${wrappedCommand}`;
	}

	public getTempDir(): URI | undefined {
		return this._tempDir;
	}

	public getDomainListStatus(domain: string): { inAllowedDomains: boolean; inDeniedDomains: boolean } {
		const networkSetting = this._configurationService.getValue<ITerminalSandboxNetworkSettings>(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork) ?? {};
		const allowedDomains = networkSetting.allowTrustedDomains
			? this._addTrustedDomainsToAllowedDomains(networkSetting.allowedDomains ?? [])
			: (networkSetting.allowedDomains ?? []);

		return {
			inAllowedDomains: this._isDomainInList(domain, allowedDomains),
			inDeniedDomains: this._isDomainInList(domain, networkSetting.deniedDomains ?? []),
		};
	}

	public async addDomainToAllowedDomains(domain: string): Promise<boolean> {
		const normalizedDomain = this._normalizeDomain(domain);
		if (!normalizedDomain) {
			return false;
		}

		const networkSetting = this._configurationService.getValue<ITerminalSandboxNetworkSettings>(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork) ?? {};
		const configuredAllowedDomains = networkSetting.allowedDomains ?? [];
		if (this._isDomainInList(normalizedDomain, configuredAllowedDomains)) {
			return false;
		}

		await this._configurationService.updateValue(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			...networkSetting,
			allowedDomains: [...configuredAllowedDomains, normalizedDomain],
		}, ConfigurationTarget.USER);

		return true;
	}

	public getFileSystemPathStatus(path: string): { inDenyRead: boolean; inAllowWrite: boolean; inDenyWrite: boolean } {
		const fileSystemSetting = this._getCurrentFileSystemSettings();

		return {
			inDenyRead: this._isPathInList(path, fileSystemSetting.denyRead ?? []),
			inAllowWrite: this._isPathInList(path, fileSystemSetting.allowWrite ?? []),
			inDenyWrite: this._isPathInList(path, fileSystemSetting.denyWrite ?? []),
		};
	}

	public async addPathToAllowedWrite(path: string): Promise<boolean> {
		const normalizedPath = this._normalizeSandboxPath(path);
		if (!normalizedPath) {
			return false;
		}

		const fileSystemSettingId = this._getCurrentFileSystemSettingId();
		if (!fileSystemSettingId) {
			return false;
		}

		const fileSystemSetting = this._getCurrentFileSystemSettings();
		const configuredAllowWrite = fileSystemSetting.allowWrite ?? [];
		if (this._isPathInList(normalizedPath, configuredAllowWrite)) {
			return false;
		}

		await this._configurationService.updateValue(fileSystemSettingId, {
			...fileSystemSetting,
			allowWrite: [...configuredAllowWrite, normalizedPath],
		}, ConfigurationTarget.USER);

		return true;
	}

	public setNeedsForceUpdateConfigFile(): void {
		this._needsForceUpdateConfigFile = true;
	}

	public async getSandboxConfigPath(forceRefresh: boolean = false): Promise<string | undefined> {
		await this._resolveSrtPath();
		if (!this._sandboxConfigPath || forceRefresh || this._needsForceUpdateConfigFile) {
			this._sandboxConfigPath = await this._createSandboxConfig();
			this._needsForceUpdateConfigFile = false;
		}
		return this._sandboxConfigPath;
	}

	private _quoteShellArgument(value: string): string {
		return `'${value.replace(/'/g, `'\\''`)}'`;
	}

	private async _resolveSrtPath(): Promise<void> {
		if (this._srtPathResolved) {
			return;
		}
		this._srtPathResolved = true;
		const remoteEnv = this._remoteEnvDetails || await this._remoteEnvDetailsPromise;
		if (remoteEnv) {

			this._appRoot = remoteEnv.appRoot.path;
			this._execPath = this._pathJoin(this._appRoot, 'node');
		}
		this._srtPath = this._pathJoin(this._appRoot, 'node_modules', '@anthropic-ai', 'sandbox-runtime', 'dist', 'cli.js');
		this._rgPath = this._pathJoin(this._appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg');
	}

	private async _createSandboxConfig(): Promise<string | undefined> {

		if (await this.isEnabled() && !this._tempDir) {
			await this._initTempDir();
		}
		if (this._tempDir) {
			const networkSetting = this._configurationService.getValue<ITerminalSandboxNetworkSettings>(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork) ?? {};
			const linuxFileSystemSetting = this._os === OperatingSystem.Linux
				? this._configurationService.getValue<{ denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }>(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem) ?? {}
				: {};
			const macFileSystemSetting = this._os === OperatingSystem.Macintosh
				? this._configurationService.getValue<{ denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }>(TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem) ?? {}
				: {};
			const configFileUri = URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);

			let allowedDomains = networkSetting.allowedDomains ?? [];
			if (networkSetting.allowTrustedDomains) {
				allowedDomains = this._addTrustedDomainsToAllowedDomains(allowedDomains);
			}

			const sandboxSettings = {
				network: {
					allowedDomains,
					deniedDomains: networkSetting.deniedDomains ?? []
				},
				filesystem: {
					denyRead: this._os === OperatingSystem.Macintosh ? macFileSystemSetting.denyRead : linuxFileSystemSetting.denyRead,
					allowWrite: this._os === OperatingSystem.Macintosh ? macFileSystemSetting.allowWrite : linuxFileSystemSetting.allowWrite,
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
			if (remoteEnv) {
				this._tempDir = remoteEnv.tmpDir;
			} else {
				const environmentService = this._environmentService as IEnvironmentService & { tmpDir?: URI };
				this._tempDir = environmentService.tmpDir;
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

	private _isDomainInList(domain: string, configuredDomains: readonly string[]): boolean {
		const normalizedDomain = this._normalizeDomain(domain);
		if (!normalizedDomain) {
			return false;
		}
		return configuredDomains.some(candidate => this._matchesConfiguredDomain(normalizedDomain, candidate));
	}

	private _matchesConfiguredDomain(domain: string, candidate: string): boolean {
		const normalizedCandidate = this._normalizeDomain(candidate);
		if (!normalizedCandidate) {
			return false;
		}

		if (normalizedCandidate.startsWith('*.')) {
			const suffix = normalizedCandidate.slice(2);
			return domain.endsWith(`.${suffix}`);
		}

		return domain === normalizedCandidate;
	}

	private _normalizeDomain(domain: string | undefined): string | undefined {
		if (!domain) {
			return undefined;
		}
		// Normalize domain by trimming, converting to lowercase, removing leading/trailing dots and ports.
		return domain.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '').replace(/:\d+$/, '') || undefined;
	}

	private _getCurrentFileSystemSettingId(): TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem | TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem | undefined {
		if (this._os === OperatingSystem.Linux) {
			return TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem;
		}

		if (this._os === OperatingSystem.Macintosh) {
			return TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem;
		}

		return undefined;
	}

	private _getCurrentFileSystemSettings(): ITerminalSandboxFileSystemSettings {
		const fileSystemSettingId = this._getCurrentFileSystemSettingId();
		if (!fileSystemSettingId) {
			return {};
		}

		return this._configurationService.getValue<ITerminalSandboxFileSystemSettings>(fileSystemSettingId) ?? {};
	}

	private _isPathInList(path: string, configuredPaths: readonly string[]): boolean {
		const normalizedPath = this._normalizeSandboxPath(path);
		if (!normalizedPath) {
			return false;
		}

		return configuredPaths.some(candidate => this._matchesConfiguredPath(normalizedPath, candidate));
	}

	private _matchesConfiguredPath(path: string, candidate: string): boolean {
		const normalizedCandidate = this._normalizeSandboxPath(candidate);
		if (!normalizedCandidate) {
			return false;
		}

		if (this._os === OperatingSystem.Macintosh && this._hasGlobPattern(normalizedCandidate) && matchGlobPattern(normalizedCandidate, path)) {
			return true;
		}

		if (path === normalizedCandidate) {
			return true;
		}

		const candidateWithSeparator = normalizedCandidate.endsWith('/') ? normalizedCandidate : `${normalizedCandidate}/`;
		return path.startsWith(candidateWithSeparator);
	}

	private _hasGlobPattern(path: string): boolean {
		return /[*?{\[]/.test(path);
	}

	private _normalizeSandboxPath(path: string | undefined): string | undefined {
		if (!path) {
			return undefined;
		}

		const trimmedPath = path.trim().replace(/^['"`]+|['"`]+$/g, '');
		if (!trimmedPath) {
			return undefined;
		}

		const normalizedPath = posix.normalize(trimmedPath.replace(/\\/g, '/'));
		if (normalizedPath === '/') {
			return normalizedPath;
		}

		return normalizedPath.replace(/\/+$/, '') || undefined;
	}


}
