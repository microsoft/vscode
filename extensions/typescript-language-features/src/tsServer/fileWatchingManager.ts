/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { Schemes } from '../configuration/schemes';
import { Logger } from '../logging/logger';
import { disposeAll, IDisposable } from '../utils/dispose';
import { ResourceMap } from '../utils/resourceMap';

interface DirWatcherEntry {
	readonly uri: vscode.Uri;
	readonly listeners: IDisposable[];
}


export class FileWatcherManager implements IDisposable {

	private readonly _fileWatchers = new Map<number, {
		readonly uri: vscode.Uri;
		readonly watcher: vscode.FileSystemWatcher;
		readonly dirWatchers: DirWatcherEntry[];
	}>();

	private readonly _dirWatchers = new ResourceMap<{
		readonly uri: vscode.Uri;
		readonly watcher: vscode.FileSystemWatcher;
		refCount: number;
	}>(uri => uri.toString(), { onCaseInsensitiveFileSystem: false });

	constructor(
		private readonly logger: Logger,
	) { }

	dispose(): void {
		for (const entry of this._fileWatchers.values()) {
			entry.watcher.dispose();
		}
		this._fileWatchers.clear();

		for (const entry of this._dirWatchers.values()) {
			entry.watcher.dispose();
		}
		this._dirWatchers.clear();
	}

	create(id: number, uri: vscode.Uri, watchParentDirs: boolean, isRecursive: boolean, listeners: { create?: (uri: vscode.Uri) => void; change?: (uri: vscode.Uri) => void; delete?: (uri: vscode.Uri) => void }): void {
		this.logger.trace(`Creating file watcher for ${uri.toString()}`);

		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri, isRecursive ? '**' : '*'), !listeners.create, !listeners.change, !listeners.delete);
		const parentDirWatchers: DirWatcherEntry[] = [];
		this._fileWatchers.set(id, { uri, watcher, dirWatchers: parentDirWatchers });

		if (listeners.create) { watcher.onDidCreate(listeners.create); }
		if (listeners.change) { watcher.onDidChange(listeners.change); }
		if (listeners.delete) { watcher.onDidDelete(listeners.delete); }

		if (watchParentDirs && uri.scheme !== Schemes.untitled) {
			// We need to watch the parent directories too for when these are deleted / created
			for (let dirUri = Utils.dirname(uri); dirUri.path.length > 1; dirUri = Utils.dirname(dirUri)) {
				const dirWatcher: DirWatcherEntry = { uri: dirUri, listeners: [] };

				let parentDirWatcher = this._dirWatchers.get(dirUri);
				if (!parentDirWatcher) {
					this.logger.trace(`Creating parent dir watcher for ${dirUri.toString()}`);
					const glob = new vscode.RelativePattern(Utils.dirname(dirUri), Utils.basename(dirUri));
					const parentWatcher = vscode.workspace.createFileSystemWatcher(glob, !listeners.create, true, !listeners.delete);
					parentDirWatcher = { uri: dirUri, refCount: 0, watcher: parentWatcher };
					this._dirWatchers.set(dirUri, parentDirWatcher);
				}
				parentDirWatcher.refCount++;

				if (listeners.create) {
					dirWatcher.listeners.push(parentDirWatcher.watcher.onDidCreate(async () => {
						// Just because the parent dir was created doesn't mean our file was created
						try {
							const stat = await vscode.workspace.fs.stat(uri);
							if (stat.type === vscode.FileType.File) {
								listeners.create!(uri);
							}
						} catch {
							// Noop
						}
					}));
				}

				if (listeners.delete) {
					// When the parent dir is deleted, consider our file deleted too
					// TODO: this fires if the file previously did not exist and then the parent is deleted
					dirWatcher.listeners.push(parentDirWatcher.watcher.onDidDelete(listeners.delete));
				}

				parentDirWatchers.push(dirWatcher);
			}
		}
	}


	delete(id: number): void {
		const entry = this._fileWatchers.get(id);
		if (entry) {
			this.logger.trace(`Deleting file watcher for ${entry.uri}`);

			for (const dirWatcher of entry.dirWatchers) {
				disposeAll(dirWatcher.listeners);

				const dirWatcherEntry = this._dirWatchers.get(dirWatcher.uri);
				if (dirWatcherEntry) {
					if (--dirWatcherEntry.refCount <= 0) {
						this.logger.trace(`Deleting parent dir ${dirWatcherEntry.uri}`);
						dirWatcherEntry.watcher.dispose();
						this._dirWatchers.delete(dirWatcher.uri);
					}
				}
			}

			entry.watcher.dispose();
		}

		this._fileWatchers.delete(id);
	}
}
