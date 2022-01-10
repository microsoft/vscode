/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { insert } from 'vs/base/common/arrays';
import { ThrottledDelayer } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { normalize } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IFileChange, IWatchOptions } from 'vs/platform/files/common/files';
import { AbstractRecursiveWatcherClient, IDiskFileChange, ILogMessage, INonRecursiveWatcher, INonRecursiveWatchRequest, IRecursiveWatchRequest, toFileChanges } from 'vs/platform/files/common/watcher';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';

export abstract class AbstractDiskFileSystemProvider extends Disposable {

	constructor(
		protected readonly logService: ILogService
	) {
		super();
	}

	protected readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	protected readonly _onDidWatchError = this._register(new Emitter<string>());
	readonly onDidWatchError = this._onDidWatchError.event;

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		if (opts.recursive) {
			return this.watchRecursive(resource, opts);
		}

		return this.watchNonRecursive(resource, opts);
	}

	//#region File Watching (recursive)

	private recursiveWatcher: AbstractRecursiveWatcherClient | undefined;

	private readonly recursiveFoldersToWatch: IRecursiveWatchRequest[] = [];
	private readonly recursiveWatchRequestDelayer = this._register(new ThrottledDelayer<void>(0));

	private watchRecursive(resource: URI, opts: IWatchOptions): IDisposable {

		// Add to list of folders to watch recursively
		const folderToWatch: IRecursiveWatchRequest = { path: this.toFilePath(resource), excludes: opts.excludes };
		const remove = insert(this.recursiveFoldersToWatch, folderToWatch);

		// Trigger update
		this.refreshRecursiveWatchers();

		return toDisposable(() => {

			// Remove from list of folders to watch recursively
			remove();

			// Trigger update
			this.refreshRecursiveWatchers();
		});
	}

	private refreshRecursiveWatchers(): void {

		// Buffer requests for recursive watching to decide on right watcher
		// that supports potentially watching more than one folder at once
		this.recursiveWatchRequestDelayer.trigger(() => {
			return this.doRefreshRecursiveWatchers();
		}).catch(error => onUnexpectedError(error));
	}

	private doRefreshRecursiveWatchers(): Promise<void> {

		// Create watcher if this is the first time
		if (!this.recursiveWatcher) {
			this.recursiveWatcher = this._register(this.createRecursiveWatcher(
				changes => this._onDidChangeFile.fire(toFileChanges(changes)),
				msg => this.onWatcherLogMessage(msg),
				this.logService.getLevel() === LogLevel.Trace
			));

			// Apply log levels dynamically
			this._register(this.logService.onDidChangeLogLevel(() => {
				this.recursiveWatcher?.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
			}));
		}

		// Allow subclasses to override watch requests
		this.massageRecursiveWatchRequests(this.recursiveFoldersToWatch);

		// Ask to watch the provided folders
		return this.recursiveWatcher.watch(this.recursiveFoldersToWatch);
	}

	protected massageRecursiveWatchRequests(requests: IRecursiveWatchRequest[]): void {
		// subclasses can override to alter behaviour
	}

	protected abstract createRecursiveWatcher(
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): AbstractRecursiveWatcherClient;

	//#endregion

	//#region File Watching (non-recursive)

	private watchNonRecursive(resource: URI, opts: IWatchOptions): IDisposable {
		const disposables = new DisposableStore();

		const watcher = disposables.add(this.createNonRecursiveWatcher(
			{
				path: this.toFilePath(resource),
				excludes: opts.excludes
			},
			changes => this._onDidChangeFile.fire(toFileChanges(changes)),
			msg => this.onWatcherLogMessage(msg),
			this.logService.getLevel() === LogLevel.Trace
		));

		disposables.add(this.logService.onDidChangeLogLevel(() => {
			watcher.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
		}));

		return disposables;
	}

	protected abstract createNonRecursiveWatcher(
		request: INonRecursiveWatchRequest,
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): INonRecursiveWatcher;

	private onWatcherLogMessage(msg: ILogMessage): void {
		if (msg.type === 'error') {
			this._onDidWatchError.fire(msg.message);
		}

		this.logService[msg.type](msg.message);
	}

	protected toFilePath(resource: URI): string {
		return normalize(resource.fsPath);
	}

	//#endregion
}
