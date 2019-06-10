/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ipcRenderer as ipc } from 'electron';
import { IOpenFileRequest } from 'vs/platform/windows/common/windows';
import { ITerminalNativeService, LinuxDistro } from 'vs/workbench/contrib/terminal/common/terminal';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { getWindowsBuildNumber, linuxDistro } from 'vs/workbench/contrib/terminal/node/terminal';
import { IQuickPickItem, IPickOptions, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { escapeNonWindowsPath } from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { execFile } from 'child_process';
import { coalesce } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class TerminalNativeService implements ITerminalNativeService {
	public _serviceBrand: any;

	public get linuxDistro(): LinuxDistro { return linuxDistro; }

	private readonly _onOpenFileRequest = new Emitter<IOpenFileRequest>();
	public get onOpenFileRequest(): Event<IOpenFileRequest> { return this._onOpenFileRequest.event; }
	private readonly _onOsResume = new Emitter<void>();
	public get onOsResume(): Event<void> { return this._onOsResume.event; }

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
	) {
		ipc.on('vscode:openFiles', (_event: any, request: IOpenFileRequest) => this._onOpenFileRequest.fire(request));
		ipc.on('vscode:osResume', () => this._onOsResume.fire());
	}

	public whenFileDeleted(path: URI): Promise<void> {
		// Complete when wait marker file is deleted
		return new Promise<void>(resolve => {
			let running = false;
			const interval = setInterval(() => {
				if (!running) {
					running = true;
					this._fileService.exists(path).then(exists => {
						running = false;

						if (!exists) {
							clearInterval(interval);
							resolve(undefined);
						}
					});
				}
			}, 1000);
		});
	}

	public selectDefaultWindowsShell(): Promise<string | undefined> {
		return this._detectWindowsShells().then(shells => {
			const options: IPickOptions<IQuickPickItem> = {
				placeHolder: nls.localize('terminal.integrated.chooseWindowsShell', "Select your preferred terminal shell, you can change this later in your settings")
			};
			return this._quickInputService.pick(shells, options).then(value => {
				if (!value) {
					return undefined;
				}
				const shell = value.description;
				return this._configurationService.updateValue('terminal.integrated.shell.windows', shell, ConfigurationTarget.USER).then(() => shell);
			});
		});
	}

	/**
	 * Get the executable file path of shell from registry.
	 * @param shellName The shell name to get the executable file path
	 * @returns `[]` or `[ 'path' ]`
	 */
	private async _getShellPathFromRegistry(shellName: string): Promise<string[]> {
		const Registry = await import('vscode-windows-registry');

		try {
			const shellPath = Registry.GetStringRegKey('HKEY_LOCAL_MACHINE', `SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${shellName}.exe`, '');

			if (shellPath === undefined) {
				return [];
			}

			return [shellPath];
		} catch (error) {
			return [];
		}
	}

	private async _detectWindowsShells(): Promise<IQuickPickItem[]> {
		// Determine the correct System32 path. We want to point to Sysnative
		// when the 32-bit version of VS Code is running on a 64-bit machine.
		// The reason for this is because PowerShell's important PSReadline
		// module doesn't work if this is not the case. See #27915.
		const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
		const system32Path = `${process.env['windir']}\\${is32ProcessOn64Windows ? 'Sysnative' : 'System32'}`;

		let useWSLexe = false;

		if (getWindowsBuildNumber() >= 16299) {
			useWSLexe = true;
		}

		const expectedLocations = {
			'Command Prompt': [`${system32Path}\\cmd.exe`],
			PowerShell: [`${system32Path}\\WindowsPowerShell\\v1.0\\powershell.exe`],
			'PowerShell Core': await this._getShellPathFromRegistry('pwsh'),
			'WSL Bash': [`${system32Path}\\${useWSLexe ? 'wsl.exe' : 'bash.exe'}`],
			'Git Bash': [
				`${process.env['ProgramW6432']}\\Git\\bin\\bash.exe`,
				`${process.env['ProgramW6432']}\\Git\\usr\\bin\\bash.exe`,
				`${process.env['ProgramFiles']}\\Git\\bin\\bash.exe`,
				`${process.env['ProgramFiles']}\\Git\\usr\\bin\\bash.exe`,
				`${process.env['LocalAppData']}\\Programs\\Git\\bin\\bash.exe`,
			]
		};
		const promises: PromiseLike<[string, string]>[] = [];
		Object.keys(expectedLocations).forEach(key => promises.push(this._validateShellPaths(key, expectedLocations[key])));
		return Promise.all(promises)
			.then(coalesce)
			.then(results => {
				return results.map(result => {
					return <IQuickPickItem>{
						label: result[0],
						description: result[1]
					};
				});
			});
	}

	private _validateShellPaths(label: string, potentialPaths: string[]): Promise<[string, string] | null> {
		if (potentialPaths.length === 0) {
			return Promise.resolve(null);
		}
		const current = potentialPaths.shift();
		if (current! === '') {
			return this._validateShellPaths(label, potentialPaths);
		}
		return this._fileService.exists(URI.file(current!)).then(exists => {
			if (!exists) {
				return this._validateShellPaths(label, potentialPaths);
			}
			return [label, current] as [string, string];
		});
	}

	/**
	 * Converts a path to a path on WSL using the wslpath utility.
	 * @param path The original path.
	 */
	public getWslPath(path: string): Promise<string> {
		if (getWindowsBuildNumber() < 17063) {
			throw new Error('wslpath does not exist on Windows build < 17063');
		}
		return new Promise<string>(c => {
			execFile('bash.exe', ['-c', 'echo $(wslpath ' + escapeNonWindowsPath(path) + ')'], {}, (error, stdout, stderr) => {
				c(escapeNonWindowsPath(stdout.trim()));
			});
		});
	}

	public getWindowsBuildNumber(): number {
		return getWindowsBuildNumber();
	}
}