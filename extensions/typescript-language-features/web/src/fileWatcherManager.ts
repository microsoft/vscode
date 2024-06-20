/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as ts from 'typescript/lib/tsserverlibrary';
import { URI } from 'vscode-uri';
import { Logger } from './logging';
import { PathMapper, fromResource, looksLikeLibDtsPath, looksLikeNodeModules, mapUri } from './pathMapper';

/**
 * Copied from `ts.FileWatcherEventKind` to avoid direct dependency.
 */
enum FileWatcherEventKind {
	Created = 0,
	Changed = 1,
	Deleted = 2,
}

export class FileWatcherManager {
	private static readonly noopWatcher: ts.FileWatcher = { close() { } };

	private readonly watchFiles = new Map<string, { callback: ts.FileWatcherCallback; pollingInterval?: number; options?: ts.WatchOptions }>();
	private readonly watchDirectories = new Map<string, { callback: ts.DirectoryWatcherCallback; recursive?: boolean; options?: ts.WatchOptions }>();

	private watchId = 0;

	constructor(
		private readonly watchPort: MessagePort,
		extensionUri: URI,
		private readonly enabledExperimentalTypeAcquisition: boolean,
		private readonly pathMapper: PathMapper,
		private readonly logger: Logger
	) {
		watchPort.onmessage = (e: any) => this.updateWatch(e.data.event, URI.from(e.data.uri), extensionUri);
	}

	watchFile(path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions): ts.FileWatcher {
		if (looksLikeLibDtsPath(path)) { // We don't support watching lib files on web since they are readonly
			return FileWatcherManager.noopWatcher;
		}

		this.logger.logVerbose('fs.watchFile', { path });

		let uri: URI;
		try {
			uri = this.pathMapper.toResource(path);
		} catch (e) {
			console.error(e);
			return FileWatcherManager.noopWatcher;
		}

		this.watchFiles.set(path, { callback, pollingInterval, options });
		const watchIds = [++this.watchId];
		this.watchPort.postMessage({ type: 'watchFile', uri: uri, id: watchIds[0] });
		if (this.enabledExperimentalTypeAcquisition && looksLikeNodeModules(path)) {
			watchIds.push(++this.watchId);
			this.watchPort.postMessage({ type: 'watchFile', uri: mapUri(uri, 'vscode-node-modules'), id: watchIds[1] });
		}
		return {
			close: () => {
				this.logger.logVerbose('fs.watchFile.close', { path });
				this.watchFiles.delete(path);
				for (const id of watchIds) {
					this.watchPort.postMessage({ type: 'dispose', id });
				}
			}
		};
	}

	watchDirectory(path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions): ts.FileWatcher {
		this.logger.logVerbose('fs.watchDirectory', { path });

		let uri: URI;
		try {
			uri = this.pathMapper.toResource(path);
		} catch (e) {
			console.error(e);
			return FileWatcherManager.noopWatcher;
		}

		this.watchDirectories.set(path, { callback, recursive, options });
		const watchIds = [++this.watchId];
		this.watchPort.postMessage({ type: 'watchDirectory', recursive, uri, id: this.watchId });
		return {
			close: () => {
				this.logger.logVerbose('fs.watchDirectory.close', { path });

				this.watchDirectories.delete(path);
				for (const id of watchIds) {
					this.watchPort.postMessage({ type: 'dispose', id });
				}
			}
		};
	}

	private updateWatch(event: 'create' | 'change' | 'delete', uri: URI, extensionUri: URI) {
		const kind = this.toTsWatcherKind(event);
		const path = fromResource(extensionUri, uri);

		const fileWatcher = this.watchFiles.get(path);
		if (fileWatcher) {
			fileWatcher.callback(path, kind);
			return;
		}

		for (const watch of Array.from(this.watchDirectories.keys()).filter(dir => path.startsWith(dir))) {
			this.watchDirectories.get(watch)!.callback(path);
			return;
		}

		console.error(`no watcher found for ${path}`);
	}

	private toTsWatcherKind(event: 'create' | 'change' | 'delete') {
		if (event === 'create') {
			return FileWatcherEventKind.Created;
		} else if (event === 'change') {
			return FileWatcherEventKind.Changed;
		} else if (event === 'delete') {
			return FileWatcherEventKind.Deleted;
		}
		throw new Error(`Unknown event: ${event}`);
	}
}

