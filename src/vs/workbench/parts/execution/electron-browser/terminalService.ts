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
import {IMessageService} from 'vs/platform/message/common/message';

import cp = require('child_process');
import processes = require('vs/base/node/processes');

export class WinTerminalService implements ITerminalService {
	public serviceId = ITerminalService;

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService,
		@IMessageService private _messageService: IMessageService
	) {
	}

	public openTerminal(path: string): void {
		cp.spawn(processes.getWindowsShell(), ['/c', 'start', '/wait'], { cwd: path });
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
		}).then(name => uri.parse(require.toUrl(`vs/workbench/parts/execution/electron-browser/${ name }`)).fsPath);
	}
}

export class LinuxTerminalService implements ITerminalService {
	public serviceId = ITerminalService;

	public openTerminal(path: string): void {
		cp.spawn('x-terminal-emulator', [], { cwd: path });
	}
}
