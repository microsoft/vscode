/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonPtyService, IPtyInstance } from 'vs/platform/terminal/common/terminal';
import { spawn, IWindowsPtyForkOptions, IPtyForkOptions } from 'node-pty';
import { createServer } from 'net';
import { generateUuid } from 'vs/base/common/uuid';

export interface IPtyMainService extends ICommonPtyService { }

export const IPtyMainService = createDecorator<IPtyMainService>('ptyMainService');

const vscodeInstance = generateUuid();

let nextId = 1;

export class PtyMainService implements IPtyMainService {
	declare readonly _serviceBrand: undefined;

	constructor() {
	}

	async spawn(file: string, args: string[] | string, options: IPtyForkOptions | IWindowsPtyForkOptions): Promise<IPtyInstance> {
		const pty = spawn(file, args, options);
		console.log('ptyMainService#createInstance');
		// TODO: Define naming scheme to ensure it's unique per window and terminal
		const socketPath = `\\\\.\\pipe\\vscodepty-${vscodeInstance}-${nextId++}`;
		const server = createServer(socket => {
			socket.write('Starting up');
			pty.onData(d => socket.write(d));
			socket.on('data', data => pty.write(data.toString()));
		});
		server.listen(socketPath);
		return {
			pid: pty.pid,
			socketPath,
		};
	}
}
