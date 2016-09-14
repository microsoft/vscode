/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import platform = require('vs/base/common/platform');
import {TPromise} from 'vs/base/common/winjs.base';
import {ITerminalService, ITerminalInstance} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {ITerminalService as IExternalTerminalService} from 'vs/workbench/parts/execution/common/execution';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';


export interface IIntegratedTerminalConfiguration {
	terminal: {
		integrated: {
			shell: {
				windows: string,
				linux: string,
				osx: string
			}
		}
	};
}

export class TerminalSupport {

	private static integratedTerminalInstance: ITerminalInstance;

	public static runInTerminal(terminalService: ITerminalService, nativeTerminalService: IExternalTerminalService, configurationService: IConfigurationService, args: DebugProtocol.RunInTerminalRequestArguments, response: DebugProtocol.RunInTerminalResponse): TPromise<void> {

		if (args.kind === 'external') {
			return nativeTerminalService.runInTerminal(args.title, args.cwd, args.args, args.env);
		}

		if (!TerminalSupport.integratedTerminalInstance) {
			TerminalSupport.integratedTerminalInstance = terminalService.createInstance(args.title || nls.localize('debuggee', "debuggee"));
		}
		terminalService.setActiveInstance(TerminalSupport.integratedTerminalInstance);
		terminalService.showPanel(true);
		const command = this.prepareCommand(args, configurationService);
		TerminalSupport.integratedTerminalInstance.sendText(command, true);
		return TPromise.as(void 0);
	}

	private static prepareCommand(args: DebugProtocol.RunInTerminalRequestArguments, configurationService: IConfigurationService): string {

		const quote1 = (s: string) => {
			s = s.replace(/\"/g, '""');
			return (s.indexOf(' ') >= 0 || s.indexOf('"') >= 0) ? `"${s}"` : s;
		};

		// get the shell configuration for the current platform
		let shell: string;
		const shell_config = configurationService.getConfiguration<IIntegratedTerminalConfiguration>().terminal.integrated.shell;
		if (platform.isWindows) {
			shell = shell_config.windows;
		} else if (platform.isLinux) {
			shell = shell_config.linux;
		} else if (platform.isMacintosh) {
			shell = shell_config.osx;
		}

		shell = shell.toLowerCase();

		let command = '';
		if (shell.indexOf('powershell') >= 0) {

			if (args.cwd) {
				command += `cd ${quote1(args.cwd)}; `;
			}
			if (args.env) {
				for (let key in args.env) {
					command += `$env:${key}='${args.env[key]}'; `;
				}
			}
			for (let a of args.args) {
				command += `${quote1(a)} `;
			}

		} else if (shell.indexOf('cmd.exe') >= 0) {

			if (args.cwd) {
				command += `cd ${quote1(args.cwd)} && `;
			}
			if (args.env) {
				command += 'cmd /C "';
				for (let key in args.env) {
					command += `set "${key}=${args.env[key]}" && `;
				}
			}
			for (let a of args.args) {
				command += `${quote1(a)} `;
			}
			if (args.env) {
				command += '"';
			}

		} else {

			// fallback: unix shell
			const quote = (s: string) => {
				s = s.replace(/\"/g, '\\"');
				return s.indexOf(' ') >= 0 ? `"${s}"` : s;
			};

			if (args.cwd) {
				command += `cd ${quote(args.cwd)} ; `;
			}
			if (args.env) {
				command += 'env';
				for (let key in args.env) {
					command += ` ${quote(key + '=' + args.env[key])}`;
				}
				command += ' ';
			}
			for (let a of args.args) {
				command += `${quote(a)} `;
			}

		}

		return command;
	}
}