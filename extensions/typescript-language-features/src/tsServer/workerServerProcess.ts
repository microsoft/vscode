/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as Proto from '../protocol';
import { TsServerProcess } from './server';

declare const Worker: any;
declare type Worker = any;

export class WorkerServerProcess implements TsServerProcess {

	public static fork(
		args: readonly string[]
	) {
		const worker = new Worker('/builtin-extension/typescript-language-features/node_modules/typescript/tsserver.js');
		return new WorkerServerProcess(worker, args);
	}

	private _onDataHandlers = new Set<(data: Proto.Response) => void>();
	private _onErrorHandlers = new Set<(err: Error) => void>();
	private _onExitHandlers = new Set<(code: number | null) => void>();

	public constructor(
		private readonly worker: Worker,
		args: readonly string[],
	) {
		worker.addEventListener('message', (msg: any) => {
			for (const handler of this._onDataHandlers) {
				handler(msg.data);
			}
		});
		worker.postMessage(args);
	}

	write(serverRequest: Proto.Request): void {
		this.worker.postMessage(serverRequest);
	}

	onData(handler: (response: Proto.Response) => void): void {
		this._onDataHandlers.add(handler);
	}

	onError(handler: (err: Error) => void): void {
		this._onErrorHandlers.add(handler);
		// Todo: not implemented
	}

	onExit(handler: (code: number | null) => void): void {
		this._onExitHandlers.add(handler);
		// Todo: not implemented
	}

	kill(): void {
		this.worker.terminate();
	}
}
