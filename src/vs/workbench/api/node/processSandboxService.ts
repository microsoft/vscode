/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { VSBuffer } from '../../../base/common/buffer.js';
import { FileAccess } from '../../../base/common/network.js';
import { dirname, join } from '../../../base/common/path.js';
import { isWindows } from '../../../base/common/platform.js';
import { generateUuid } from '../../../base/common/uuid.js';

export interface IProcessSandboxCommandOptions {
	command: string;
	allowedDomains?: string[];
	deniedDomains?: string[];
	allowWrite?: string[];
}

export interface IProcessSandboxedCommand {
	executable: string;
	args: string[];
	env: Record<string, string | undefined>;
}

export class ProcessSandboxService {
	private readonly _srtPath?: string;
	private readonly _execPath?: string;
	private readonly _tmpDir?: string;

	constructor() {
		if (this.isSupported()) {
			const appRoot = dirname(FileAccess.asFileUri('').fsPath);
			this._srtPath = join(appRoot, 'node_modules', '@anthropic-ai', 'sandbox-runtime', 'dist', 'cli.js');
			this._execPath = process.execPath;
			this._tmpDir = tmpdir();
		}
	}

	public isSupported(): boolean {
		return !isWindows && Boolean(process.versions.electron);
	}

	public async wrapCommand(options: IProcessSandboxCommandOptions): Promise<IProcessSandboxedCommand> {
		if (!this.isSupported()) {
			throw new Error('Process sandboxing is only supported on non-Windows native Electron environments');
		}
		if (!this._tmpDir) {
			throw new Error('Temp directory not available to create sandbox settings');
		}
		if (!this._srtPath) {
			throw new Error('Sandbox runtime path not initialized');
		}
		if (!this._execPath) {
			throw new Error('Executable path not set to run sandbox commands');
		}

		const configPath = join(this._tmpDir, `vscode-sandbox-settings-${generateUuid()}.json`);
		const sandboxSettings = {
			network: {
				allowedDomains: options.allowedDomains ?? [],
				deniedDomains: options.deniedDomains ?? []
			},
			filesystem: {
				allowWrite: options.allowWrite ?? []
			}
		};

		await writeFile(configPath, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, '\t')).buffer);

		return {
			executable: this._execPath,
			args: [
				this._srtPath,
				`TMPDIR=${this._tmpDir}`,
				'--settings',
				configPath,
				'-c',
				options.command
			],
			env: {
				...process.env,
				ELECTRON_RUN_AS_NODE: '1'
			}
		};
	}
}
