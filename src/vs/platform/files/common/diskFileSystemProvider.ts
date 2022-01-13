/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { insert } from 'vs/base/common/arrays';
import { ThrottledDelayer } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { normalize } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IFileChange, IWatchOptions } from 'vs/platform/files/common/files';
import { AbstractNonRecursiveWatcherClient, AbstractUniversalWatcherClient, IDiskFileChange, ILogMessage, INonRecursiveWatchRequest, IRecursiveWatchRequest, toFileChanges } from 'vs/platform/files/common/watcher';
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

	private recursiveWatcher: AbstractUniversalWatcherClient | undefined;

	private readonly recursivePathsToWatch: IRecursiveWatchRequest[] = [];
	private readonly recursiveWatchRequestDelayer = this._register(new ThrottledDelayer<void>(0));

	private watchRecursive(resource: URI, opts: IWatchOptions): IDisposable {

		// Add to list of paths to watch recursively
		const pathToWatch: IRecursiveWatchRequest = { path: this.toFilePath(resource), excludes: opts.excludes, recursive: true };
		const remove = insert(this.recursivePathsToWatch, pathToWatch);

		// Trigger update
		this.refreshRecursiveWatchers();

		return toDisposable(() => {

			// Remove from list of paths to watch recursively
			remove();

			// Trigger update
			this.refreshRecursiveWatchers();
		});
	}

	private refreshRecursiveWatchers(): void {

		// Buffer requests for recursive watching to decide on right watcher
		// that supports potentially watching more than one path at once
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
		this.massageRecursiveWatchRequests(this.recursivePathsToWatch);

		// Ask to watch the provided paths
		return this.recursiveWatcher.watch(this.recursivePathsToWatch);
	}

	protected massageRecursiveWatchRequests(requests: IRecursiveWatchRequest[]): void {
		// subclasses can override to alter behaviour
	}

	protected abstract createRecursiveWatcher(
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): AbstractUniversalWatcherClient;

	//#endregion

	//#region File Watching (non-recursive)

	private nonRecursiveWatcher: AbstractNonRecursiveWatcherClient | undefined;

	private readonly nonRecursivePathsToWatch: INonRecursiveWatchRequest[] = [];
	private readonly nonRecursiveWatchRequestDelayer = this._register(new ThrottledDelayer<void>(0));

	private watchNonRecursive(resource: URI, opts: IWatchOptions): IDisposable {

		// Add to list of paths to watch non-recursively
		const pathToWatch: INonRecursiveWatchRequest = { path: this.toFilePath(resource), excludes: opts.excludes, recursive: false };
		const remove = insert(this.nonRecursivePathsToWatch, pathToWatch);

		// Trigger update
		this.refreshNonRecursiveWatchers();

		return toDisposable(() => {

			// Remove from list of paths to watch non-recursively
			remove();

			// Trigger update
			this.refreshNonRecursiveWatchers();
		});
	}

	private refreshNonRecursiveWatchers(): void {

		// Buffer requests for nonrecursive watching to decide on right watcher
		// that supports potentially watching more than one path at once
		this.nonRecursiveWatchRequestDelayer.trigger(() => {
			return this.doRefreshNonRecursiveWatchers();
		}).catch(error => onUnexpectedError(error));
	}

	private doRefreshNonRecursiveWatchers(): Promise<void> {

		// Create watcher if this is the first time
		if (!this.nonRecursiveWatcher) {
			this.nonRecursiveWatcher = this._register(this.createNonRecursiveWatcher(
				changes => this._onDidChangeFile.fire(toFileChanges(changes)),
				msg => this.onWatcherLogMessage(msg),
				this.logService.getLevel() === LogLevel.Trace
			));

			// Apply log levels dynamically
			this._register(this.logService.onDidChangeLogLevel(() => {
				this.nonRecursiveWatcher?.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
			}));
		}

		// Ask to watch the provided paths
		return this.nonRecursiveWatcher.watch(this.nonRecursivePathsToWatch);
	}

	protected abstract createNonRecursiveWatcher(
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): AbstractNonRecursiveWatcherClient;

	//#endregion

	private onWatcherLogMessage(msg: ILogMessage): void {
		if (msg.type === 'error') {
			this._onDidWatchError.fire(msg.message);
		}

		this.logService[msg.type](msg.message);
	}

	protected toFilePath(resource: URI): string {
		return normalize(resource.fsPath);
	}
}
