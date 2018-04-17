/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as terminalEnvironment from 'vs/workbench/parts/terminal/node/terminalEnvironment';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostTerminalServiceShape, MainContext, MainThreadTerminalServiceShape, IMainContext, ShellLaunchConfigDto } from 'vs/workbench/api/node/extHost.protocol';
import { IMessageFromTerminalProcess } from 'vs/workbench/parts/terminal/node/terminal';

export class ExtHostTerminal implements vscode.Terminal {

	private _name: string;
	private _id: number;
	private _proxy: MainThreadTerminalServiceShape;
	private _disposed: boolean;
	private _queuedRequests: ApiRequest[];
	private _pidPromise: Promise<number>;
	private _pidPromiseComplete: (value: number) => any;

	constructor(
		proxy: MainThreadTerminalServiceShape,
		name: string = '',
		id?: number
	) {
		this._proxy = proxy;
		this._name = name;
		if (id) {
			this._id = id;
		}
		this._queuedRequests = [];
		this._pidPromise = new Promise<number>(c => {
			this._pidPromiseComplete = c;
		});
	}

	public create(
		shellPath?: string,
		shellArgs?: string[],
		cwd?: string,
		env?: { [key: string]: string },
		waitOnExit?: boolean
	): void {
		this._proxy.$createTerminal(this._name, shellPath, shellArgs, cwd, env, waitOnExit).then((id) => {
			this._id = id;
			this._queuedRequests.forEach((r) => {
				r.run(this._proxy, this._id);
			});
			this._queuedRequests = [];
		});
	}

	public get name(): string {
		return this._name;
	}

	public get processId(): Thenable<number> {
		return this._pidPromise;
	}

	public sendText(text: string, addNewLine: boolean = true): void {
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$sendText, [text, addNewLine]);
	}

	public show(preserveFocus: boolean): void {
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$show, [preserveFocus]);
	}

	public hide(): void {
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$hide, []);
	}

	public dispose(): void {
		if (!this._disposed) {
			this._disposed = true;
			this._queueApiRequest(this._proxy.$dispose, []);
		}
	}

	public _setProcessId(processId: number): void {
		console.log('extHostTerminalService#_setProcessId', processId);
		this._pidPromiseComplete(processId);
		this._pidPromiseComplete = null;
	}

	private _queueApiRequest(callback: (...args: any[]) => void, args: any[]) {
		let request: ApiRequest = new ApiRequest(callback, args);
		if (!this._id) {
			this._queuedRequests.push(request);
			return;
		}
		request.run(this._proxy, this._id);
	}

	private _checkDisposed() {
		if (this._disposed) {
			throw new Error('Terminal has already been disposed');
		}
	}
}

export class ExtHostTerminalService implements ExtHostTerminalServiceShape {

	private readonly _onDidCloseTerminal: Emitter<vscode.Terminal>;
	private readonly _onDidOpenTerminal: Emitter<vscode.Terminal>;
	private _proxy: MainThreadTerminalServiceShape;
	private _terminals: ExtHostTerminal[] = [];
	private _terminalProcesses: { [id: number]: cp.ChildProcess } = {};

	public get terminals(): ExtHostTerminal[] { return this._terminals; }

	constructor(mainContext: IMainContext) {
		this._onDidCloseTerminal = new Emitter<vscode.Terminal>();
		this._onDidOpenTerminal = new Emitter<vscode.Terminal>();
		this._proxy = mainContext.getProxy(MainContext.MainThreadTerminalService);
	}

	public createTerminal(name?: string, shellPath?: string, shellArgs?: string[]): vscode.Terminal {
		let terminal = new ExtHostTerminal(this._proxy, name);
		terminal.create(shellPath, shellArgs);
		this._terminals.push(terminal);
		return terminal;
	}

	public createTerminalFromOptions(options: vscode.TerminalOptions): vscode.Terminal {
		let terminal = new ExtHostTerminal(this._proxy, options.name);
		terminal.create(options.shellPath, options.shellArgs, options.cwd, options.env /*, options.waitOnExit*/);
		this._terminals.push(terminal);
		return terminal;
	}

	public get onDidCloseTerminal(): Event<vscode.Terminal> {
		return this._onDidCloseTerminal && this._onDidCloseTerminal.event;
	}

	public get onDidOpenTerminal(): Event<vscode.Terminal> {
		return this._onDidOpenTerminal && this._onDidOpenTerminal.event;
	}

	public $acceptTerminalClosed(id: number): void {
		let index = this._getTerminalIndexById(id);
		if (index === null) {
			// The terminal was not created by the terminal API, ignore it
			return;
		}
		let terminal = this._terminals.splice(index, 1)[0];
		this._onDidCloseTerminal.fire(terminal);
	}

	public $acceptTerminalOpened(id: number, name: string): void {
		console.log('terminal opened: ' + id);
		let index = this._getTerminalIndexById(id);
		if (index !== null) {
			// The terminal has already been created (via createTerminal*), only fire the event
			this._onDidOpenTerminal.fire(this.terminals[index]);
			return;
		}
		let terminal = new ExtHostTerminal(this._proxy, name, id);
		this._terminals.push(terminal);
		this._onDidOpenTerminal.fire(terminal);
	}

	public $acceptTerminalProcessId(id: number, processId: number): void {
		let terminal = this._getTerminalById(id);
		console.log('ExtHostTerminalService#$acceptTerminalProcessId ' + id + ' ' + processId);
		if (terminal) {
			terminal._setProcessId(processId);
		}
	}

	public $createProcess(id: number, shellLaunchConfig: ShellLaunchConfigDto, cols: number, rows: number): void {
		shellLaunchConfig = {
			env: {},
			executable: 'bash'
		};


		// TODO: Launch process
		// TODO: Associate the process with the terminal object/id
		// TODO: terminal has incorrect name/options, fix up
		const parentEnv = { ...process.env };
		const env = terminalEnvironment.createTerminalEnv(parentEnv, shellLaunchConfig, '/home/daniel', undefined, cols, rows);
		// TODO: Use Uri?
		let cwd = path.dirname(require.toUrl('../../parts/terminal/node/terminalProcess')).replace('file://', '');
		console.log(cwd);
		const options = { env, cwd, execArgv: [] };

		let bootstrapUri = require.toUrl('bootstrap').replace('file://', '') + '.js';
		console.log(bootstrapUri);

		// cwd = '/home/daniel/dev/Microsoft/vscode/out/vs/workbench/parts/terminal/node';
		// bootstrapUri = '/home/daniel/dev/Microsoft/vscode/out/bootstrap';
		// env['AMD_ENTRYPOINT'] = 'vs/workbench/parts/terminal/node/terminalProcess';
		this._terminalProcesses[id] = cp.fork(bootstrapUri, ['--type=terminal'], options);

		this._terminalProcesses[id].on('message', (message: IMessageFromTerminalProcess) => {
			switch (message.type) {
				case 'pid': this._proxy.$sendProcessPid(id, <number>message.content); break;
				case 'title': this._proxy.$sendProcessTitle(id, <string>message.content); break;
				case 'data': this._proxy.$sendProcessData(id, <string>message.content); break;
			}
		});

		const terminal = this._getTerminalById(id);
		console.log('$createProcess terminal: ' + terminal.name);
	}

	public $acceptTerminalProcessWrite(id: number, data: string): void {
		this._terminalProcesses[id].send({ event: 'input', data });
	}

	private _getTerminalById(id: number): ExtHostTerminal {
		let index = this._getTerminalIndexById(id);
		return index !== null ? this._terminals[index] : null;
	}

	private _getTerminalIndexById(id: number): number {
		let index: number = null;
		this._terminals.some((terminal, i) => {
			// TODO: This shouldn't be cas
			let thisId = (<any>terminal)._id;
			if (thisId === id) {
				index = i;
				return true;
			}
			return false;
		});
		return index;
	}
}

class ApiRequest {

	private _callback: (...args: any[]) => void;
	private _args: any[];

	constructor(callback: (...args: any[]) => void, args: any[]) {
		this._callback = callback;
		this._args = args;
	}

	public run(proxy: MainThreadTerminalServiceShape, id: number) {
		this._callback.apply(proxy, [id].concat(this._args));
	}
}
