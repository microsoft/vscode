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
import { Requests, ApiService } from '@vscode/sync-api-service';

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
		// TODO: Create a messagechannel for listening and addEventListener/onerror on that instead.
		// Only send the initial setup via worker
		worker.addEventListener('message', (msg: any) => {
			if (msg.data.type === 'log') {
				this.output.append(msg.data.body);
				return;
			}
			// TODO: A multi-watcher message would look something like this:
			// if (msg.data.type === 'dispose-watcher') {
			//     watchers.get(msg.data.path).dispose()
			// }

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
		// TODO: For prototyping, create one watcher ahead of time and send messages using the worker.
		// For the real thing, it makes more sense to create a third MessageChannel and listen on it; the host
		// can then send messages to tell the extension to create a new filesystemwatcher for each file/directory
		this.output.append('creating fileSystemWatcher\n');
		const watcher = vscode.workspace.createFileSystemWatcher('**/*');
		watcher.onDidChange(e => worker.postMessage({ type: 'watch', event: 'change', path: e.path }));
		watcher.onDidCreate(e => worker.postMessage({ type: 'watch', event: 'create', path: e.path }));
		watcher.onDidDelete(e => worker.postMessage({ type: 'watch', event: 'delete', path: e.path }));
		this.output.append('creating new MessageChannel and posting its port2 + args: ' + args.join(' '));
		const syncChannel = new MessageChannel();
		worker.postMessage({ args, port: syncChannel.port2 }, [syncChannel.port2]);
		const connection = new ServiceConnection<Requests>(syncChannel.port1);
		this.output.append('\ncreating new ApiService with connection\n');
		new ApiService('vscode-wasm-typescript', connection);
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

