/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNative, isWindows } from '../../../../base/common/platform.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISandboxTerminalSettings, ITerminalLogService } from '../../../../platform/terminal/common/terminal.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { dirname, join } from '../../../../base/common/path.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';

export const ISandboxUtility = createDecorator<ISandboxUtility>('sandboxUtility');

export interface ISandboxUtility {
	readonly _serviceBrand: undefined;
	isEnabled(): boolean;
	wrapCommand(command: string): string;
	getSandboxConfigPath(forceRefresh?: boolean): Promise<string | undefined>;
	getTempDir(): URI | undefined;
	setNeedsForceUpdateConfigFile(): void;
}

export class SandboxUtility implements ISandboxUtility {
	readonly _serviceBrand: undefined;
	private static _srtPath: string;
	private static _sandboxConfigPath: string | undefined;
	private _needsForceUpdateConfigFile = true;
	private static _tempDir: URI | undefined;
	private static _sandboxSettingsId: string | undefined;
	private static readonly TERMINAL_SANDBOX_SETTING_ID = 'chat.tools.terminal.sandbox';

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
		const appRoot = dirname(FileAccess.asFileUri('').fsPath);
		SandboxUtility._srtPath = SandboxUtility._srtPath ?? join(appRoot, 'node_modules', '.bin', 'srt');
		SandboxUtility._sandboxSettingsId = generateUuid();
		this._initTempDir();
	}

	public isEnabled(): boolean {
		if (isWindows) {
			return false;
		}
		const settings = this._configurationService.getValue<ISandboxTerminalSettings>(SandboxUtility.TERMINAL_SANDBOX_SETTING_ID);
		const isEnabled = settings?.enabled === true;
		if (!isEnabled) {
			return false;
		}
		return true;
	}

	public wrapCommand(command: string): string {
		if (!SandboxUtility._sandboxConfigPath || !SandboxUtility._tempDir) {
			throw new Error('Sandbox config path or temp dir not initialized');
		}
		return `"${SandboxUtility._srtPath}" TMPDIR=${SandboxUtility._tempDir.fsPath} --settings "${SandboxUtility._sandboxConfigPath}" "${command}"`;
	}

	public getTempDir(): URI | undefined {
		return SandboxUtility._tempDir;
	}

	public setNeedsForceUpdateConfigFile(): void {
		this._needsForceUpdateConfigFile = true;
	}

	public async getSandboxConfigPath(forceRefresh: boolean = false): Promise<string | undefined> {
		if (!SandboxUtility._sandboxConfigPath || forceRefresh || this._needsForceUpdateConfigFile) {
			SandboxUtility._sandboxConfigPath = await this._createSandboxConfig();
			this._needsForceUpdateConfigFile = false;
		}
		return SandboxUtility._sandboxConfigPath;
	}

	private async _createSandboxConfig(): Promise<string | undefined> {
		const sandboxSetting = this._configurationService.getValue<ISandboxTerminalSettings>(SandboxUtility.TERMINAL_SANDBOX_SETTING_ID);
		if (sandboxSetting.enabled && SandboxUtility._tempDir) {
			const configFileUri = joinPath(SandboxUtility._tempDir!, `vscode-sandbox-settings-${SandboxUtility._sandboxSettingsId}.json`);
			const sandboxSettings = {
				network: {
					allowedDomains: sandboxSetting.network?.allowedDomains || [],
					deniedDomains: sandboxSetting.network?.deniedDomains || []
				},
				filesystem: {
					denyRead: sandboxSetting.filesystem?.denyRead || [],
					allowWrite: sandboxSetting.filesystem?.allowWrite || ['.'],
					denyWrite: sandboxSetting.filesystem?.denyWrite || []
				}
			};
			SandboxUtility._sandboxConfigPath = configFileUri.fsPath;
			await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, '\t')), { overwrite: true });
			return SandboxUtility._sandboxConfigPath;
		}
		return undefined;
	}

	private _initTempDir(): void {
		if (this.isEnabled() && isNative) {
			this._needsForceUpdateConfigFile = true;
			const tmpDir = (this._environmentService as IEnvironmentService & { tmpDir: URI }).tmpDir;
			if (!tmpDir) {
				this._logService.warn('SandboxUtility: Cannot create sandbox settings file because no tmpDir is available in this environment');
				return;
			}
			SandboxUtility._tempDir = tmpDir;
			this._fileService.exists(SandboxUtility._tempDir).then(exists => {
				if (!exists) {
					this._logService.warn(`SandboxUtility: tmp directory is not present at ${SandboxUtility._tempDir}`);
				}
			});
		}
	}
}
