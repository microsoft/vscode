/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='dom' />
import * as vscode from 'vscode';
import type * as Proto from '../protocol';
import { TypeScriptServiceConfiguration } from '../utils/configuration';
import { memoize } from '../utils/memoize';
import { TsServerProcess, TsServerProcessKind } from './server';
import { TypeScriptVersion } from './versionProvider';
import { ServiceConnection } from '@vscode/sync-api-common/browser';
import { Requests, ApiService } from '@vscode/sync-api-service';


// slightly more detailed webworker types
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

	private readonly _onDataHandlers = new Set<(data: Proto.Response) => void>();
	private readonly _onErrorHandlers = new Set<(err: Error) => void>();
	private readonly _onExitHandlers = new Set<(code: number | null, signal: string | null) => void>();
	private readonly tsserver: MessagePort;

	public constructor(
		private readonly mainChannel: Worker,
		args: readonly string[],
	) {
		// 1. worker (for initial setup, can be closed afterward, or not, in which case the top-level listener should assert or something)
		// 2. sync:  (for communicating with FS synchronously)
		// 3. watcher: watcher channel
		// 4. tsserver: (for communicating with TS server synchronously)
		const tsserverChannel = new MessageChannel();
		this.tsserver = tsserverChannel.port2;
		this.tsserver.onmessage = (event) => {
			if (event.data.type === 'log') {
				console.error(`unexpected log message on tsserver channel: ${JSON.stringify(event)}`);
				return;
			}
			for (const handler of this._onDataHandlers) {
				handler(event.data);
			}
		};
		mainChannel.onmessage = (msg: any) => {
			// for logging only
			if (msg.data.type === 'log') {
				this.output.append(msg.data.body);
				return;
			}
			console.error(`unexpected message on main channel: ${JSON.stringify(msg)}`);
			// TODO: A multi-watcher message would look something like this:
			// if (msg.data.type === 'dispose-watcher') {
			//	 watchers.get(msg.data.path).dispose()
			// }
		};
		mainChannel.onerror = (err: ErrorEvent) => {
			this.output.append(JSON.stringify('error! ' + JSON.stringify(err)) + '\n');
			for (const handler of this._onErrorHandlers) {
				// TODO: The ErrorEvent type might be wrong; previously this was typed as Error and didn't have the property access.
				handler(err.error);
			}
		};
		// TODO: For prototyping, create one watcher ahead of time and send messages using the worker.
		// For the real thing, it makes more sense to create a third MessageChannel and listen on it; the host
		// can then send messages to tell the extension to create a new filesystemwatcher for each file/directory
		const watcher = vscode.workspace.createFileSystemWatcher('**/*');
		watcher.onDidChange(e => mainChannel.postMessage({ type: 'watch', event: 'change', path: e.path }));
		watcher.onDidCreate(e => mainChannel.postMessage({ type: 'watch', event: 'create', path: e.path }));
		watcher.onDidDelete(e => mainChannel.postMessage({ type: 'watch', event: 'delete', path: e.path }));
		this.output.append('creating new MessageChannel and posting its port2 + args: ' + args.join(' '));
		const syncChannel = new MessageChannel();
		mainChannel.postMessage({ args }, [syncChannel.port2, tsserverChannel.port1]);
		const connection = new ServiceConnection<Requests>(syncChannel.port1);
		new ApiService('vscode-wasm-typescript', connection);
		connection.signalReady();
		this.output.append('done constructing WorkerServerProcess\n');
	}

	@memoize
	private get output(): vscode.OutputChannel {
		return vscode.window.createOutputChannel(vscode.l10n.t("TypeScript Server Log"));
	}

	write(serverRequest: Proto.Request): void {
		this.tsserver.postMessage(serverRequest);
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
		this.mainChannel.terminate();
		this.tsserver.close();
	}
}

