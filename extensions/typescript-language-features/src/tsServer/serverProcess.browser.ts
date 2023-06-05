/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker' />
import { ServiceConnection } from '@vscode/sync-api-common/browser';
import { ApiService, Requests } from '@vscode/sync-api-service';
import * as vscode from 'vscode';
import { TypeScriptServiceConfiguration } from '../configuration/configuration';
import { FileWatcherManager } from './fileWatchingManager';
import type * as Proto from './protocol/protocol';
import { TsServerLog, TsServerProcess, TsServerProcessFactory, TsServerProcessKind } from './server';
import { TypeScriptVersionManager } from './versionManager';
import { TypeScriptVersion } from './versionProvider';

type BrowserWatchEvent = {
	type: 'watchDirectory' | 'watchFile';
	recursive?: boolean;
	uri: {
		scheme: string;
		authority: string;
		path: string;
	};
	id: number;
} | {
	type: 'dispose';
	id: number;
};

export class WorkerServerProcessFactory implements TsServerProcessFactory {
	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public fork(
		version: TypeScriptVersion,
		args: readonly string[],
		kind: TsServerProcessKind,
		_configuration: TypeScriptServiceConfiguration,
		_versionManager: TypeScriptVersionManager,
		tsServerLog: TsServerLog | undefined,
	) {
		const tsServerPath = version.tsServerPath;
		return new WorkerServerProcess(kind, tsServerPath, this._extensionUri, [
			...args,

			// Explicitly give TS Server its path so it can
			// load local resources
			'--executingFilePath', tsServerPath,
		], tsServerLog);
	}
}

class WorkerServerProcess implements TsServerProcess {

	private static idPool = 0;

	private readonly id = WorkerServerProcess.idPool++;

	private readonly _onDataHandlers = new Set<(data: Proto.Response) => void>();
	private readonly _onErrorHandlers = new Set<(err: Error) => void>();
	private readonly _onExitHandlers = new Set<(code: number | null, signal: string | null) => void>();
	private readonly watches = new FileWatcherManager();

	private readonly worker: Worker;

	/** For communicating with TS server synchronously */
	private readonly tsserver: MessagePort;
	/** For communicating watches asynchronously */
	private readonly watcher: MessagePort;
	/** For communicating with filesystem synchronously */
	private readonly syncFs: MessagePort;

	public constructor(
		private readonly kind: TsServerProcessKind,
		tsServerPath: string,
		extensionUri: vscode.Uri,
		args: readonly string[],
		private readonly tsServerLog: TsServerLog | undefined,
	) {
		this.worker = new Worker(tsServerPath, { name: `TS ${kind} server #${this.id}` });

		const tsserverChannel = new MessageChannel();
		const watcherChannel = new MessageChannel();
		const syncChannel = new MessageChannel();
		this.tsserver = tsserverChannel.port2;
		this.watcher = watcherChannel.port2;
		this.syncFs = syncChannel.port2;

		this.tsserver.onmessage = (event) => {
			if (event.data.type === 'log') {
				console.error(`unexpected log message on tsserver channel: ${JSON.stringify(event)}`);
				return;
			}
			for (const handler of this._onDataHandlers) {
				handler(event.data);
			}
		};

		this.watcher.onmessage = (event: MessageEvent<BrowserWatchEvent>) => {
			switch (event.data.type) {
				case 'dispose': {
					this.watches.delete(event.data.id);
					break;
				}
				case 'watchDirectory':
				case 'watchFile': {
					this.watches.create(event.data.id, vscode.Uri.from(event.data.uri), /*watchParentDirs*/ true, !!event.data.recursive, {
						change: uri => this.watcher.postMessage({ type: 'watch', event: 'change', uri }),
						create: uri => this.watcher.postMessage({ type: 'watch', event: 'create', uri }),
						delete: uri => this.watcher.postMessage({ type: 'watch', event: 'delete', uri }),
					});
					break;
				}
				default:
					console.error(`unexpected message on watcher channel: ${JSON.stringify(event)}`);
			}
		};

		this.worker.onmessage = (msg: any) => {
			// for logging only
			if (msg.data.type === 'log') {
				this.appendLog(msg.data.body);
				return;
			}
			console.error(`unexpected message on main channel: ${JSON.stringify(msg)}`);
		};

		this.worker.onerror = (err: ErrorEvent) => {
			console.error('error! ' + JSON.stringify(err));
			for (const handler of this._onErrorHandlers) {
				// TODO: The ErrorEvent type might be wrong; previously this was typed as Error and didn't have the property access.
				handler(err.error);
			}
		};

		this.worker.postMessage(
			{ args, extensionUri },
			[syncChannel.port1, tsserverChannel.port1, watcherChannel.port1]
		);

		const connection = new ServiceConnection<Requests>(syncChannel.port2);
		new ApiService('vscode-wasm-typescript', connection);
		connection.signalReady();
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
		this.worker.terminate();
		this.tsserver.close();
		this.watcher.close();
		this.syncFs.close();
	}

	private appendLog(msg: string) {
		if (this.tsServerLog?.type === 'output') {
			this.tsServerLog.output.appendLine(`(${this.id} - ${this.kind}) ${msg}`);
		}
	}
}

