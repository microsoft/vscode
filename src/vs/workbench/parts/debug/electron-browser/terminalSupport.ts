/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITerminalService, ITerminalInstance } from 'vs/workbench/parts/terminal/common/terminal';
import { ITerminalService as IExternalTerminalService } from 'vs/workbench/parts/execution/common/execution';
import { ITerminalLauncher, ITerminalSettings } from 'vs/workbench/parts/debug/common/debug';
import { hasChildprocesses, prepareCommand } from 'vs/workbench/parts/debug/node/terminals';

export class AbstractTerminalLauncher implements ITerminalLauncher {

	private integratedTerminalInstance: ITerminalInstance;
	private terminalDisposedListener: IDisposable;

	constructor(private terminalService: ITerminalService) {
	}

	async runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<void> {

		if (args.kind === 'external') {
			return this.runInExternalTerminal(args, config);
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
		if ((t && await this.isBusy(t.processId)) || !t) {
			t = this.terminalService.createTerminal({ name: args.title || nls.localize('debug.terminal.title', "debuggee") });
			this.integratedTerminalInstance = t;
		}
		this.terminalService.setActiveInstance(t);
		this.terminalService.showPanel(true);

		const command = await this.prepareCommand(args, config);

		return new TPromise((resolve, error) => {
			setTimeout(_ => {
				t.sendText(command, true);
				resolve(void 0);
			}, 500);
		});
	}

	protected runInExternalTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<void> {
		return void 0;
	}

	protected isBusy(processId: number): TPromise<boolean> {
		return TPromise.as(hasChildprocesses(processId));
	}

	protected prepareCommand(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<string> {
		return TPromise.as(prepareCommand(args, config));
	}
}

export class TerminalLauncher extends AbstractTerminalLauncher {

	constructor(
		@ITerminalService terminalService: ITerminalService,
		@IExternalTerminalService private nativeTerminalService: IExternalTerminalService
	) {
		super(terminalService);
	}

	runInExternalTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<void> {
		return this.nativeTerminalService.runInTerminal(args.title, args.cwd, args.args, args.env || {});
	}
}
