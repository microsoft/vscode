/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isLinux, isMacintosh, isNative, isWindows } from '../../../../base/common/platform.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITerminalLogService, ITerminalSandboxSettings } from '../../../../platform/terminal/common/terminal.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { dirname, join } from '../../../../base/common/path.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { TerminalContribSettingId } from '../../terminal/terminalContribExports.js';

export const ISandboxService = createDecorator<ISandboxService>('sandboxService');

export interface ISandboxService {
	readonly _serviceBrand: undefined;
	isEnabled(): boolean;
	wrapCommand(command: string): string;
	getSandboxConfigPath(forceRefresh?: boolean): Promise<string | undefined>;
	getTempDir(): URI | undefined;
	setNeedsForceUpdateConfigFile(): void;
}

export class SandboxService implements ISandboxService {
	readonly _serviceBrand: undefined;
	private _srtPath: string;
	private _sandboxConfigPath: string | undefined;
	private _needsForceUpdateConfigFile = true;
	private _tempDir: URI | undefined;
	private _sandboxSettingsId: string | undefined;


	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
		const appRoot = dirname(FileAccess.asFileUri('').fsPath);
		this._srtPath = join(appRoot, 'node_modules', '.bin', 'srt');
		this._sandboxSettingsId = generateUuid();
		this._initTempDir();
	}

	public isEnabled(): boolean {
		if (isWindows) {
			return false;
		}
		const enabledSetting = this._configurationService.getValue<boolean>(TerminalContribSettingId.TerminalSandboxEnabled);
		const isEnabled = enabledSetting === true;
		if (!isEnabled) {
			return false;
		}
		return true;
	}

	public wrapCommand(command: string): string {
		if (!this._sandboxConfigPath || !this._tempDir) {
			throw new Error('Sandbox config path or temp dir not initialized');
		}
		return `"${this._srtPath}" TMPDIR=${this._tempDir.fsPath} --settings "${this._sandboxConfigPath}" "${command}"`;
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

	private async _createSandboxConfig(): Promise<string | undefined> {

		if (this.isEnabled() && !this._tempDir) {
			this._initTempDir();
		}
		if (this._tempDir) {
			const networkSetting = this._configurationService.getValue<ITerminalSandboxSettings['network']>(TerminalContribSettingId.TerminalSandboxNetwork) ?? {};
			const linuxFileSystemSetting = isLinux
				? this._configurationService.getValue<ITerminalSandboxSettings['filesystem']>(TerminalContribSettingId.TerminalSandboxLinuxFileSystem) ?? {}
				: {};
			const macFileSystemSetting = isMacintosh
				? this._configurationService.getValue<ITerminalSandboxSettings['filesystem']>(TerminalContribSettingId.TerminalSandboxMacFileSystem) ?? {}
				: {};
			const configFileUri = joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);
			const sandboxSettings = {
				network: {
					allowedDomains: networkSetting.allowedDomains ?? [],
					deniedDomains: networkSetting.deniedDomains ?? []
				},
				filesystem: {
					denyRead: isMacintosh ? macFileSystemSetting.denyRead : linuxFileSystemSetting.denyRead,
					allowWrite: isMacintosh ? macFileSystemSetting.allowWrite : linuxFileSystemSetting.allowWrite,
					denyWrite: isMacintosh ? macFileSystemSetting.denyWrite : linuxFileSystemSetting.denyWrite,
				}
			};
			this._sandboxConfigPath = configFileUri.fsPath;
			await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, '\t')), { overwrite: true });
			return this._sandboxConfigPath;
		}
		return undefined;
	}

	private _initTempDir(): void {
		if (this.isEnabled() && isNative) {
			this._needsForceUpdateConfigFile = true;
			const tmpDir = (this._environmentService as IEnvironmentService & { tmpDir: URI }).tmpDir;
			if (!tmpDir) {
				this._logService.warn('SandboxService: Cannot create sandbox settings file because no tmpDir is available in this environment');
				return;
			}
			this._tempDir = tmpDir;
			this._fileService.exists(this._tempDir).then(exists => {
				if (!exists) {
					this._logService.warn(`SandboxService: tmp directory is not present at ${this._tempDir}`);
				}
			});
		}
	}
}
