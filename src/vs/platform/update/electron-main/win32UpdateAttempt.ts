/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, SpawnOptions } from 'child_process';
import { unlinkSync } from 'fs';
import { readFile, unlink, writeFile } from 'fs/promises';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import * as path from '../../../base/common/path.js';
import { ILogService } from '../../log/common/log.js';
import { IUpdateChildProcess, Win32UpdateProcess } from './win32UpdateProcess.js';

type SpawnUpdateProcess = (command: string, args: readonly string[], options: SpawnOptions) => IUpdateChildProcess;

export interface IUpdateProgress {
	readonly current: number;
	readonly total: number;
}

export class Win32UpdateAttempt {
	readonly cancellationTokenSource = new CancellationTokenSource();
	readonly updateFilePath: string;
	readonly cancelFilePath: string;
	readonly progressFilePath: string;
	private completed = false;
	private _process: Win32UpdateProcess | undefined;

	constructor(
		cachePath: string,
		readonly packagePath: string,
		quality: string,
		version: string,
		readonly id: string,
		private readonly logService: ILogService,
	) {
		this.updateFilePath = path.join(cachePath, `CodeSetup-${quality}-${version}-${id}.flag`);
		this.cancelFilePath = path.join(cachePath, `cancel-${id}.flag`);
		this.progressFilePath = path.join(cachePath, `update-progress-${id}`);
	}

	get isActive(): boolean {
		return !this.completed && !this.cancellationTokenSource.token.isCancellationRequested;
	}

	get process(): Win32UpdateProcess | undefined {
		return this._process;
	}

	async prepare(): Promise<void> {
		await writeFile(this.updateFilePath, 'flag');
	}

	startProcess(sessionEndFlagPath: string, additionalArguments: readonly string[], spawnProcess: SpawnUpdateProcess = spawn): Win32UpdateProcess {
		if (this._process) {
			throw new Error('Update process already started');
		}

		const installerArguments = [
			'/verysilent',
			'/log',
			`/update="${this.updateFilePath}"`,
			`/progress="${this.progressFilePath}"`,
			`/sessionend="${sessionEndFlagPath}"`,
			`/cancel="${this.cancelFilePath}"`,
			'/nocloseapplications',
			'/mergetasks=runcode,!desktopicon,!quicklaunchicon',
			...additionalArguments
		];

		const childProcess = spawnProcess(this.packagePath, installerArguments, {
			detached: true,
			stdio: ['ignore', 'ignore', 'ignore'],
			windowsVerbatimArguments: true,
			env: { ...process.env, __COMPAT_LAYER: 'RunAsInvoker' }
		});

		const updateProcess = this._process = new Win32UpdateProcess(childProcess, () => writeFile(this.cancelFilePath, 'cancel'));
		updateProcess.whenTerminated.then(() => {
			if (this._process === updateProcess) {
				this._process = undefined;
			}
		});
		return updateProcess;
	}

	async readProgress(): Promise<IUpdateProgress | undefined> {
		try {
			const progressContent = await readFile(this.progressFilePath, 'utf8');
			const [currentValue, totalValue] = progressContent.split(',');
			const current = parseInt(currentValue, 10);
			const total = parseInt(totalValue, 10);
			return !isNaN(current) && !isNaN(total) ? { current, total } : undefined;
		} catch {
			return undefined;
		}
	}

	async stopProcess(): Promise<void> {
		const result = await this._process?.stop();
		if (result?.cancelError) {
			this.logService.warn('update#stopUpdateProcess: failed to write cancel file', result.cancelError);
		}
		if (result?.killed) {
			this.logService.trace('update#stopUpdateProcess: process did not exit gracefully, killed process tree');
		}
	}

	async cleanup(removePackage = false): Promise<void> {
		const filePaths = [this.updateFilePath, this.cancelFilePath, this.progressFilePath];
		if (removePackage) {
			filePaths.push(this.packagePath);
		}

		await Promise.all(filePaths.map(async filePath => {
			const error = await this.unlink(filePath);
			if (error) {
				this.logService.warn(`update#cleanupUpdateAttempt: failed to remove ${path.basename(filePath)}`, error);
			}
		}));
	}

	acceptForInstall(): void {
		try {
			unlinkSync(this.updateFilePath);
		} catch {
			// The installer may already have removed the flag.
		}
	}

	complete(): boolean {
		if (!this.isActive) {
			return false;
		}

		this.completed = true;
		this.cancellationTokenSource.dispose(true);
		return true;
	}

	private async unlink(filePath: string): Promise<Error | undefined> {
		try {
			await unlink(filePath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				return error instanceof Error ? error : new Error(String(error));
			}
		}
		return undefined;
	}
}
