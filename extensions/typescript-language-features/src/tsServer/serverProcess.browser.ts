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
import { TypeScriptVersionManager } from './versionManager';

export class WorkerServerProcess implements TsServerProcess {

	public static fork(
		version: TypeScriptVersion,
		args: readonly string[],
		_kind: TsServerProcessKind,
		_configuration: TypeScriptServiceConfiguration,
		_versionManager: TypeScriptVersionManager,
		extensionUri: vscode.Uri,
	) {
		const tsServerPath = version.tsServerPath;
		const worker = new Worker(tsServerPath);
		return new WorkerServerProcess(worker, extensionUri, [
			...args,

			// Explicitly give TS Server its path so it can
			// load local resources
			'--executingFilePath', tsServerPath,
		]);
	}

	private readonly _onDataHandlers = new Set<(data: Proto.Response) => void>();
	private readonly _onErrorHandlers = new Set<(err: Error) => void>();
	private readonly _onExitHandlers = new Set<(code: number | null, signal: string | null) => void>();
	/** For communicating with TS server synchronously */
	private readonly tsserver: MessagePort;
	/** For communicating watches asynchronously */
	private readonly watcher: MessagePort;
	/** For communicating with filesystem synchronously */
	private readonly syncFs: MessagePort;

	public constructor(
		/** For logging and initial setup */
		private readonly mainChannel: Worker,
		extensionUri: vscode.Uri,
		args: readonly string[],
	) {
		const tsserverChannel = new MessageChannel();
		const watcherChannel = new MessageChannel();
		const syncChannel = new MessageChannel();
		this.tsserver = tsserverChannel.port2;
		this.watcher = watcherChannel.port2;
		this.syncFs = syncChannel.port1;
		this.tsserver.onmessage = (event) => {
			if (event.data.type === 'log') {
				console.error(`unexpected log message on tsserver channel: ${JSON.stringify(event)}`);
				return;
			}
			for (const handler of this._onDataHandlers) {
				handler(event.data);
			}
		};
		this.watcher.onmessage = (event) => {
			// TODO: A multi-watcher message would look something like this:
			// if (msg.data.type === 'dispose-watcher') {
			//	 watchers.get(msg.data.path).dispose()
			// }
			console.error(`unexpected message on watcher channel: ${JSON.stringify(event)}`);
		};
		mainChannel.onmessage = (msg: any) => {
			// for logging only
			if (msg.data.type === 'log') {
				this.output.append(msg.data.body);
				return;
			}
			console.error(`unexpected message on main channel: ${JSON.stringify(msg)}`);
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
		const fsWatcher = vscode.workspace.createFileSystemWatcher('**/*');
		fsWatcher.onDidChange(e => this.watcher.postMessage({ type: 'watch', event: 'change', path: e.path }));
		fsWatcher.onDidCreate(e => this.watcher.postMessage({ type: 'watch', event: 'create', path: e.path }));
		fsWatcher.onDidDelete(e => this.watcher.postMessage({ type: 'watch', event: 'delete', path: e.path }));
		this.output.append('creating new MessageChannel and posting its port2 + args: ' + args.join(' '));
		mainChannel.postMessage(
			{ args, extensionUri: { scheme: extensionUri.scheme, authority: extensionUri.authority, path: extensionUri.path } },
			[syncChannel.port2, tsserverChannel.port1, watcherChannel.port1]
		);
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
		this.watcher.close();
		this.syncFs.close();
	}
}

