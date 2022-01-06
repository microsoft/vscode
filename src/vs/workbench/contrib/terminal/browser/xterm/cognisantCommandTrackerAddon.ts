/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { ShellIntegrationInfo, ShellIntegrationInteraction, TerminalCommand } from 'vs/platform/terminal/common/terminal';
import { getCurrentTimestamp } from 'vs/workbench/contrib/terminal/browser/terminalTime';
import { CommandTrackerAddon } from 'vs/workbench/contrib/terminal/browser/xterm/commandTrackerAddon';
import { Terminal } from 'xterm';

export class CognisantCommandTrackerAddon extends CommandTrackerAddon {
	private _dataIsCommand = false;
	private _commands: TerminalCommand[] = [];
	private _exitCode: number | undefined;
	private _cwd: string | undefined;
	private _currentCommand = '';

	private readonly _onCwdChanged = new Emitter<string>();
	readonly onCwdChanged = this._onCwdChanged.event;

	override activate(terminal: Terminal): void {
		terminal.onData(data => {
			if (this._dataIsCommand) {
				this._currentCommand += data;
			}
		});
	}

	override handleIntegratedShellChange(event: { type: string, value: string }): void {
		switch (event.type) {
			case ShellIntegrationInfo.CurrentDir:
				this._cwd = event.value;
				this._onCwdChanged.fire(this._cwd);
				break;
			case ShellIntegrationInfo.RemoteHost:
				break;
			case ShellIntegrationInteraction.PromptStart:
				break;
			case ShellIntegrationInteraction.CommandStart:
				this._dataIsCommand = true;
				break;
			case ShellIntegrationInteraction.CommandExecuted:
				break;
			case ShellIntegrationInteraction.CommandFinished:
				this._exitCode = Number.parseInt(event.value);
				if (!this._currentCommand.startsWith('\\') && this._currentCommand !== '') {
					this._commands.push(
						{
							command: this._currentCommand,
							timestamp: getCurrentTimestamp(),
							cwd: this._cwd,
							exitCode: this._exitCode
						});
				}
				this._currentCommand = '';
				break;
			default:
				return;
		}
	}

	override getCommands(): TerminalCommand[] {
		return this._commands;
	}
}
