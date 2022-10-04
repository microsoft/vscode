/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import type * as Proto from '../protocol';
import { TypeScriptServiceConfiguration } from '../utils/configuration';
import { memoize } from '../utils/memoize';
import { TsServerProcess, TsServerProcessKind } from './server';
import { TypeScriptVersion } from './versionProvider';
// NIEUW
import { ServiceConnection } from '@vscode/sync-api-common/browser';
import { APIRequests, ApiService } from '@vscode/sync-api-service';

const localize = nls.loadMessageBundle();

// slightly more detailed webworker types
declare const Worker: any;
interface Worker {
	onerror: ((ev: Error /*actually, ErrorEvent from webworker*/) => any) | null;
	addEventListener(type: string, listener: (evt: unknown /*Event*/) => void): void;
	postMessage(message: any, transfer?: unknown[] /*MessagePort[]*/): void;
	terminate(): void;
}
interface MessageChannel {
	/** Returns the first MessagePort object. */
	readonly port1: unknown; // MessagePort;
	/** Returns the second MessagePort object. */
	readonly port2: unknown; // MessagePort;
}

declare const MessageChannel: {
	prototype: MessageChannel;
	new(): MessageChannel;
};

export class WorkerServerProcess implements TsServerProcess {

	public static fork(
		version: TypeScriptVersion,
		args: readonly string[],
		_kind: TsServerProcessKind,
		_configuration: TypeScriptServiceConfiguration,
	) {
		const tsServerPath = version.tsServerPath;
		const worker = new Worker(tsServerPath);
		return new WorkerServerProcess(worker, [
			...args,

			// Explicitly give TS Server its path so it can
			// load local resources
			'--executingFilePath', tsServerPath,
		]);
	}

	private _onDataHandlers = new Set<(data: Proto.Response) => void>();
	private _onErrorHandlers = new Set<(err: Error) => void>();
	private _onExitHandlers = new Set<(code: number | null, signal: string | null) => void>();

	public constructor(
		private readonly worker: Worker,
		args: readonly string[],
	) {
		worker.addEventListener('message', (msg: any) => {
			if (msg.data.type === 'log') {
				this.output.append(msg.data.body);
				return;
			}

			this.output.append(JSON.stringify(msg.data) + '\n');
			for (const handler of this._onDataHandlers) {
				handler(msg.data);
			}
		});
		worker.onerror = (err: Error) => {
			this.output.append(JSON.stringify('error! ' + JSON.stringify(err)) + '\n');
			for (const handler of this._onErrorHandlers) {
				handler(err);
			}
		};
		this.output.append('creating new MessageChannel and posting its port2 + args: ' + args.join(' '));
		const syncChannel = new MessageChannel();
		worker.postMessage({ args, port: syncChannel.port2 }, [syncChannel.port2]);
		const connection = new ServiceConnection<APIRequests>(syncChannel.port1);
		this.output.append('\ncreating new ApiService with connection\n');
		new ApiService('TypeScript???', connection, _rval => worker.terminate());
		// TODO: not sure whether ApiService's exitHandler should worker.terminate()
		this.output.append('about to signalReady\n');
		connection.signalReady();
		this.output.append('done constructing WorkerServerProcess\n');
	}

	@memoize
	private get output(): vscode.OutputChannel {
		return vscode.window.createOutputChannel(localize('channelName', 'TypeScript Server Log'));
	}

	write(serverRequest: Proto.Request): void {
		this.worker.postMessage(serverRequest);
	}

	onData(handler: (response: Proto.Response) => void): void {
		this._onDataHandlers.add(handler);
	}

	onError(handler: (err: Error) => void): void {
		this._onErrorHandlers.add(handler);
	}

	onExit(handler: (code: number | null, signal: string | null) => void): void {
		this._onExitHandlers.add(handler);
		// Todo: not implemented
	}

	kill(): void {
		this.worker.terminate();
	}
}
