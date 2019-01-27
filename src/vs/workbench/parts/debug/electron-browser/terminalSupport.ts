/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ITerminalService, ITerminalInstance } from 'vs/workbench/parts/terminal/common/terminal';
import { ITerminalService as IExternalTerminalService } from 'vs/workbench/parts/execution/common/execution';
import { ITerminalLauncher, ITerminalSettings } from 'vs/workbench/parts/debug/common/debug';
import { hasChildProcesses, prepareCommand } from 'vs/workbench/parts/debug/node/terminals';

export class TerminalLauncher implements ITerminalLauncher {

	private integratedTerminalInstance: ITerminalInstance;
	private terminalDisposedListener: IDisposable;

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
		@IExternalTerminalService private readonly nativeTerminalService: IExternalTerminalService
	) {
	}

	runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): Promise<number | undefined> {

		if (args.kind === 'external') {
			return this.nativeTerminalService.runInTerminal(args.title, args.cwd, args.args, args.env || {});
		}

		if (!this.terminalDisposedListener) {
			// React on terminal disposed and check if that is the debug terminal #12956
			this.terminalDisposedListener = this.terminalService.onInstanceDisposed(terminal => {
				if (this.integratedTerminalInstance && this.integratedTerminalInstance.id === terminal.id) {
					this.integratedTerminalInstance = null;
				}
			});
		}

		let t = this.integratedTerminalInstance;
		if ((t && hasChildProcesses(t.processId)) || !t) {
			t = this.terminalService.createTerminal({ name: args.title || nls.localize('debug.terminal.title', "debuggee") });
			this.integratedTerminalInstance = t;
		}
		this.terminalService.setActiveInstance(t);
		this.terminalService.showPanel(true);

		return new Promise<number | undefined>((resolve, error) => {

			if (typeof t.processId === 'number') {
				// no need to wait
				resolve(t.processId);
			}

			// shell not ready: wait for ready event
			const toDispose = t.onProcessIdReady(t => {
				toDispose.dispose();
				resolve(t.processId);
			});

			// do not wait longer than 5 seconds
			setTimeout(_ => {
				error(new Error('terminal shell timeout'));
			}, 5000);

		}).then(shellProcessId => {

			const command = prepareCommand(args, config);
			t.sendText(command, true);

			return shellProcessId;
		});
	}
}
