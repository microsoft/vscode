/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import errors = require('vs/base/common/errors');
import {TPromise} from 'vs/base/common/winjs.base';
import {ITerminalService} from 'vs/workbench/parts/execution/common/execution';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ITerminalConfiguration, DEFAULT_TERMINAL_WINDOWS, DEFAULT_TERMINAL_LINUX, DEFAULT_TERMINAL_OSX} from 'vs/workbench/parts/execution/electron-browser/terminal';

import cp = require('child_process');
import processes = require('vs/base/node/processes');

export class WinTerminalService implements ITerminalService {
	public _serviceBrand: any;

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService
	) {
	}

	public openTerminal(path?: string): void {
		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();

		this.spawnTerminal(cp, configuration, processes.getWindowsShell(), path)
			.done(null, errors.onUnexpectedError);
	}

	private spawnTerminal(spawner, configuration: ITerminalConfiguration, command: string, path?: string): TPromise<void> {
		let terminalConfig = configuration.terminal.external;
		let exec = terminalConfig.windowsExec || DEFAULT_TERMINAL_WINDOWS;
		// The '""' argument is the window title. Without this, exec doesn't work when the path
		// contains spaces
		let cmdArgs = ['/c', 'start', '/wait', '""', exec];

		return new TPromise<void>((c, e) => {
			let env = path ? { cwd: path } : void 0;
			let child = spawner.spawn(command, cmdArgs, env);
			child.on('error', e);
			child.on('exit', () => c(null));
		});
	}
}

export class MacTerminalService implements ITerminalService {
	public _serviceBrand: any;

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService
	) { }

	public openTerminal(path?: string): void {
		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();

		this.spawnTerminal(cp, configuration, path).done(null, errors.onUnexpectedError);
	}

	private spawnTerminal(spawner, configuration: ITerminalConfiguration, path?: string): TPromise<void> {
		let terminalConfig = configuration.terminal.external;
		let terminalApp = terminalConfig.osxExec || DEFAULT_TERMINAL_OSX;

		return new TPromise<void>((c, e) => {
			let child = spawner.spawn('/usr/bin/open', ['-a', terminalApp, path]);
			child.on('error', e);
			child.on('exit', () => c(null));
		});
	}
}

export class LinuxTerminalService implements ITerminalService {
	public _serviceBrand: any;

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService
	) { }


	public openTerminal(path?: string): void {
		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();

		this.spawnTerminal(cp, configuration, path)
			.done(null, errors.onUnexpectedError);
	}

	private spawnTerminal(spawner, configuration: ITerminalConfiguration, path?: string): TPromise<void> {
		let terminalConfig = configuration.terminal.external;
		let exec = terminalConfig.linuxExec || DEFAULT_TERMINAL_LINUX;
		let env = path ? { cwd: path } : void 0;

		return new TPromise<void>((c, e) => {
			const child = spawner.spawn(exec, [], env);
			child.on('error', e);
			child.on('exit', () => c(null));
		});
	}
}
