/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonPtyService, IPtyInstance } from 'vs/platform/terminal/common/terminal';
import { spawn, IWindowsPtyForkOptions, IPtyForkOptions, IPty } from 'node-pty';
import { createServer } from 'net';
import { generateUuid } from 'vs/base/common/uuid';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export interface IPtyMainService extends ICommonPtyService { }

export const IPtyMainService = createDecorator<IPtyMainService>('ptyMainService');

const vscodeInstance = generateUuid();

let nextId = 1;

export class PtyMainService implements IPtyMainService {
	declare readonly _serviceBrand: undefined;

	private _pty: IPty | undefined;
	private _ptyInstance: IPtyInstance | undefined;
	private _data: string = '';
	private _disposables: IDisposable[] = [];

	constructor() {
	}

	async spawn(file: string, args: string[] | string, options: IPtyForkOptions | IWindowsPtyForkOptions): Promise<IPtyInstance> {
		// Reattach if it's still there
		if (this._pty) {
			dispose(this._disposables);
			this._disposables.length = 0;
			const server = createServer(socket => {
				this._disposables.push(this._pty!.onData(d => {
					this._data += d;
					socket.write(d);
				}));
				socket.on('data', data => this._pty!.write(data.toString()));
				this._disposables.push({ dispose: () => socket.destroy() });
			});
			server.listen(this._ptyInstance!.socketPath);
			this._ptyInstance!.restoreData = this._data;
			return this._ptyInstance!;
		}

		this._pty = spawn(file, args, options);
		console.log('ptyMainService#createInstance');
		// TODO: Define naming scheme to ensure it's unique per window and terminal
		const socketPath = `\\\\.\\pipe\\vscodepty-${vscodeInstance}-${nextId++}`;
		const server = createServer(socket => {
			this._disposables.push(this._pty!.onData(d => {
				this._data += d;
				socket.write(d);
			}));
			socket.on('data', data => this._pty!.write(data.toString()));
			this._disposables.push({ dispose: () => socket.destroy() });
		});
		server.listen(socketPath);
		this._ptyInstance = {
			pid: this._pty!.pid,
			socketPath,
			restoreData: ''
		};
		return this._ptyInstance;
	}
}
