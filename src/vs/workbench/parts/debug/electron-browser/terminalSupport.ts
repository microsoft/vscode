/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITerminalService, ITerminalInstance, ITerminalConfiguration } from 'vs/workbench/parts/terminal/common/terminal';
import { ITerminalService as IExternalTerminalService } from 'vs/workbench/parts/execution/common/execution';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class TerminalSupport {

	private static integratedTerminalInstance: ITerminalInstance;
	private static terminalDisposedListener: IDisposable;

	public static runInTerminal(terminalService: ITerminalService, nativeTerminalService: IExternalTerminalService, configurationService: IConfigurationService, args: DebugProtocol.RunInTerminalRequestArguments, response: DebugProtocol.RunInTerminalResponse): TPromise<void> {

		if (args.kind === 'external') {
			return nativeTerminalService.runInTerminal(args.title, args.cwd, args.args, args.env || {});
		}

		let delay = 0;
		if (!TerminalSupport.integratedTerminalInstance) {
			TerminalSupport.integratedTerminalInstance = terminalService.createInstance({ name: args.title || nls.localize('debug.terminal.title', "debuggee") });
			delay = 2000;	// delay the first sendText so that the newly created terminal is ready.
		}
		if (!TerminalSupport.terminalDisposedListener) {
			// React on terminal disposed and check if that is the debug terminal #12956
			TerminalSupport.terminalDisposedListener = terminalService.onInstanceDisposed(terminal => {
				if (TerminalSupport.integratedTerminalInstance && TerminalSupport.integratedTerminalInstance.id === terminal.id) {
					TerminalSupport.integratedTerminalInstance = null;
				}
			});
		}
		terminalService.setActiveInstance(TerminalSupport.integratedTerminalInstance);
		terminalService.showPanel(true);

		return new TPromise<void>((c, e) => {

			setTimeout(() => {
				if (TerminalSupport.integratedTerminalInstance) {
					const command = this.prepareCommand(args, configurationService);
					TerminalSupport.integratedTerminalInstance.sendText(command, true);
					c(void 0);
				} else {
					e(new Error(nls.localize('debug.terminal.not.available.error', "Integrated terminal not available")));
				}
			}, delay);

		});
	}

	private static prepareCommand(args: DebugProtocol.RunInTerminalRequestArguments, configurationService: IConfigurationService): string {

		// get the shell configuration for the current platform
		let shell: string;
		const shell_config = (<ITerminalConfiguration>configurationService.getConfiguration<any>().terminal.integrated).shell;
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

			const quote = (s: string) => {
				s = s.replace(/\'/g, '\'\'');
				return s.indexOf(' ') >= 0 || s.indexOf('\'') >= 0 || s.indexOf('"') >= 0 ? `'${s}'` : s;
			};

			if (args.cwd) {
				command += `cd '${args.cwd}'; `;
			}
			if (args.env) {
				for (let key in args.env) {
					command += `$env:${key}='${args.env[key]}'; `;
				}
			}
			for (let a of args.args) {
				command += `${quote(a)} `;
			}

		} else if (shell.indexOf('cmd.exe') >= 0) {

			const quote = (s: string) => {
				s = s.replace(/\"/g, '""');
				return (s.indexOf(' ') >= 0 || s.indexOf('"') >= 0) ? `"${s}"` : s;
			};

			if (args.cwd) {
				command += `cd ${quote(args.cwd)} && `;
			}
			if (args.env) {
				command += 'cmd /C "';
				for (let key in args.env) {
					command += `set "${key}=${args.env[key]}" && `;
				}
			}
			for (let a of args.args) {
				command += `${quote(a)} `;
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