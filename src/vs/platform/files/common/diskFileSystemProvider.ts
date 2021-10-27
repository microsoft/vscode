/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { insert } from 'vs/base/common/arrays';
import { ThrottledDelayer } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { normalize } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IFileChange, IWatchOptions } from 'vs/platform/files/common/files';
import { IDiskFileChange, ILogMessage, IWatchRequest, toFileChanges, WatcherService } from 'vs/platform/files/common/watcher';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';

export abstract class AbstractDiskFileSystemProvider extends Disposable {

	constructor(
		protected readonly logService: ILogService
	) {
		super();
	}

	//#region File Watching

	protected readonly _onDidErrorOccur = this._register(new Emitter<string>());
	readonly onDidErrorOccur = this._onDidErrorOccur.event;

	protected readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private recursiveWatcher: WatcherService | undefined;
	private readonly recursiveFoldersToWatch: IWatchRequest[] = [];
	private recursiveWatchRequestDelayer = this._register(new ThrottledDelayer<void>(0));

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		if (opts.recursive) {
			return this.watchRecursive(resource, opts);
		}

		return this.watchNonRecursive(resource);
	}

	private watchRecursive(resource: URI, opts: IWatchOptions): IDisposable {

		// Add to list of folders to watch recursively
		const folderToWatch: IWatchRequest = { path: this.toFilePath(resource), excludes: opts.excludes };
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
				this.recursiveFoldersToWatch.length,
				changes => this._onDidChangeFile.fire(toFileChanges(changes)),
				msg => this.onWatcherLogMessage(msg),
				this.logService.getLevel() === LogLevel.Trace
			));

			// Apply log levels dynamically
			this._register(this.logService.onDidChangeLogLevel(() => {
				this.recursiveWatcher?.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
			}));
		}

		// Ask to watch the provided folders
		return this.doWatch(this.recursiveWatcher, this.recursiveFoldersToWatch);
	}

	protected doWatch(watcher: WatcherService, requests: IWatchRequest[]): Promise<void> {
		return watcher.watch(requests);
	}

	protected abstract createRecursiveWatcher(
		folders: number,
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): WatcherService;

	private watchNonRecursive(resource: URI): IDisposable {
		const watcherService = this.createNonRecursiveWatcher(
			this.toFilePath(resource),
			changes => this._onDidChangeFile.fire(toFileChanges(changes)),
			msg => this.onWatcherLogMessage(msg),
			this.logService.getLevel() === LogLevel.Trace
		);

		const logLevelListener = this.logService.onDidChangeLogLevel(() => {
			watcherService.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
		});

		return combinedDisposable(watcherService, logLevelListener);
	}

	private onWatcherLogMessage(msg: ILogMessage): void {
		if (msg.type === 'error') {
			this._onDidErrorOccur.fire(msg.message);
		}

		this.logService[msg.type](msg.message);
	}

	protected abstract createNonRecursiveWatcher(
		path: string,
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): IDisposable & { setVerboseLogging: (verboseLogging: boolean) => void };

	protected toFilePath(resource: URI): string {
		return normalize(resource.fsPath);
	}

	//#endregion
}
