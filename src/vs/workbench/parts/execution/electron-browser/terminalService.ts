/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import errors = require('vs/base/common/errors');
import uri from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {ITerminalService} from 'vs/workbench/parts/execution/common/execution';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {DEFAULT_WINDOWS_TERM, DEFAULT_LINUX_TERM} from 'vs/workbench/parts/execution/electron-browser/terminal';

import cp = require('child_process');
import processes = require('vs/base/node/processes');

export class WinTerminalService implements ITerminalService {
	public serviceId = ITerminalService;

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService
	) {
	}

	public openTerminal(path: string): void {
		this._configurationService.loadConfiguration().done(configuration => {
			return new Promise((success, failed) => {
				this.spawnTerminal(
					cp,
					configuration,
					processes.getWindowsShell(),
					path,
					success,
					err => {
						errors.onUnexpectedError(err);
						failed(err);
					}
				);
			});
		}, errors.onUnexpectedError);
	}

	private spawnTerminal(spawner, configuration, command: string, path: string, onExit, onError) {
		let terminalConfig = configuration.terminal;
		let exec = terminalConfig.windows.exec || DEFAULT_WINDOWS_TERM;
		let cmdArgs = ['/c', 'start', '/wait', exec];

		let child = spawner.spawn(command, cmdArgs, { cwd: path });
		child.on('error', onError);
		child.on('exit', onExit);
	}
}

export class MacTerminalService implements ITerminalService {
	public serviceId = ITerminalService;
	private _terminalApplicationScriptPath: TPromise<string>;

	public openTerminal(path: string): void {
		this.getTerminalHelperScriptPath().done(helperPath => {
			cp.spawn('/usr/bin/osascript', [helperPath, path]);
		}, errors.onUnexpectedError);
	}

	private getTerminalHelperScriptPath(): TPromise<string> {
		if (this._terminalApplicationScriptPath) {
			return this._terminalApplicationScriptPath;
		}

		return this._terminalApplicationScriptPath = new TPromise<string>((c, e) => {
			let child = cp.spawn('/usr/bin/osascript', ['-e', 'exists application "iTerm"']);
			child.on('error', e);
			child.on('exit', (code: number) => {
				c(code === 0 ? 'iterm.scpt' : 'terminal.scpt');
			});
		}).then(name => uri.parse(require.toUrl(`vs/workbench/parts/execution/electron-browser/${name}`)).fsPath);
	}
}

export class LinuxTerminalService implements ITerminalService {
	public serviceId = ITerminalService;

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService
	) { }


	public openTerminal(path: string): void {
		this._configurationService.loadConfiguration().done(configuration => {
			return new Promise((success, failed) => {
				this.spawnTerminal(
					cp,
					configuration,
					path,
					success,
					err => {
						errors.onUnexpectedError(err);
						failed(err);
					}
				);
			});
		}, errors.onUnexpectedError);
	}

	private spawnTerminal(spawner, configuration, path: string, onExit, onError) {
		let terminalConfig = configuration.terminal;
		let exec = terminalConfig.linux.exec || DEFAULT_LINUX_TERM;
		const child = spawner.spawn(exec, [], { cwd: path });
		child.on('error', onError);
		child.on('exit', onExit);
	}

}
