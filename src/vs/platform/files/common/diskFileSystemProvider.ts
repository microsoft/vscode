/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { insert } from '../../../base/common/arrays.js';
import { ThrottledDelayer } from '../../../base/common/async.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { removeTrailingPathSeparator } from '../../../base/common/extpath.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { normalize } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { IFileChange, IFileSystemProvider, IWatchOptions } from './files.js';
import { AbstractNonRecursiveWatcherClient, AbstractUniversalWatcherClient, ILogMessage, INonRecursiveWatchRequest, IRecursiveWatcherOptions, isRecursiveWatchRequest, IUniversalWatchRequest, reviveFileChanges } from './watcher.js';
import { ILogService, LogLevel } from '../../log/common/log.js';

export interface IDiskFileSystemProviderOptions {
	watcher?: {

		/**
		 * Extra options for the recursive file watching.
		 */
		recursive?: IRecursiveWatcherOptions;

		/**
		 * Forces all file watch requests to run through a
		 * single universal file watcher, both recursive
		 * and non-recursively.
		 *
		 * Enabling this option might cause some overhead,
		 * specifically the universal file watcher will run
		 * in a separate process given its complexity. Only
		 * enable it when you understand the consequences.
		 */
		forceUniversal?: boolean;
	};
}

export abstract class AbstractDiskFileSystemProvider extends Disposable implements
	Pick<IFileSystemProvider, 'watch'>,
	Pick<IFileSystemProvider, 'onDidChangeFile'>,
	Pick<IFileSystemProvider, 'onDidWatchError'> {

	constructor(
		protected readonly logService: ILogService,
		private readonly options?: IDiskFileSystemProviderOptions
	) {
		super();
	}

	protected readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	protected readonly _onDidWatchError = this._register(new Emitter<string>());
	readonly onDidWatchError = this._onDidWatchError.event;

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		if (opts.recursive || this.options?.watcher?.forceUniversal) {
			return this.watchUniversal(resource, opts);
		}

		return this.watchNonRecursive(resource, opts);
	}

	private getRefreshWatchersDelay(count: number): number {
		if (count > 200) {
			// If there are many requests to refresh, start to throttle
			// the refresh to reduce pressure. We see potentially thousands
			// of requests coming in on startup repeatedly so we take it easy.
			return 500;
		}

		// By default, use a short delay to keep watchers updating fast but still
		// with a delay so that we can efficiently deduplicate requests or reuse
		// existing watchers.
		return 0;
	}

	//#region File Watching (universal)

	private universalWatcher: AbstractUniversalWatcherClient | undefined;

	private readonly universalWatchRequests: IUniversalWatchRequest[] = [];
	private readonly universalWatchRequestDelayer = this._register(new ThrottledDelayer<void>(this.getRefreshWatchersDelay(this.universalWatchRequests.length)));

	private watchUniversal(resource: URI, opts: IWatchOptions): IDisposable {
		const request = this.toWatchRequest(resource, opts);
		const remove = insert(this.universalWatchRequests, request);

		// Trigger update
		this.refreshUniversalWatchers();

		return toDisposable(() => {

			// Remove from list of paths to watch universally
			remove();

			// Trigger update
			this.refreshUniversalWatchers();
		});
	}

	private toWatchRequest(resource: URI, opts: IWatchOptions): IUniversalWatchRequest {
		const request: IUniversalWatchRequest = {
			path: this.toWatchPath(resource),
			excludes: opts.excludes,
			includes: opts.includes,
			recursive: opts.recursive,
			filter: opts.filter,
			correlationId: opts.correlationId
		};

		if (isRecursiveWatchRequest(request)) {

			// Adjust for polling
			const usePolling = this.options?.watcher?.recursive?.usePolling;
			if (usePolling === true) {
				request.pollingInterval = this.options?.watcher?.recursive?.pollingInterval ?? 5000;
			} else if (Array.isArray(usePolling)) {
				if (usePolling.includes(request.path)) {
					request.pollingInterval = this.options?.watcher?.recursive?.pollingInterval ?? 5000;
				}
			}
		}

		return request;
	}

	private refreshUniversalWatchers(): void {
		this.universalWatchRequestDelayer.trigger(() => {
			return this.doRefreshUniversalWatchers();
		}, this.getRefreshWatchersDelay(this.universalWatchRequests.length)).catch(error => onUnexpectedError(error));
	}

	private doRefreshUniversalWatchers(): Promise<void> {

		// Create watcher if this is the first time
		if (!this.universalWatcher) {
			this.universalWatcher = this._register(this.createUniversalWatcher(
				changes => this._onDidChangeFile.fire(reviveFileChanges(changes)),
				msg => this.onWatcherLogMessage(msg),
				this.logService.getLevel() === LogLevel.Trace
			));

			// Apply log levels dynamically
			this._register(this.logService.onDidChangeLogLevel(() => {
				this.universalWatcher?.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
			}));
		}

		// Ask to watch the provided paths
		return this.universalWatcher.watch(this.universalWatchRequests);
	}

	protected abstract createUniversalWatcher(
		onChange: (changes: IFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): AbstractUniversalWatcherClient;

	//#endregion

	//#region File Watching (non-recursive)

	private nonRecursiveWatcher: AbstractNonRecursiveWatcherClient | undefined;

	private readonly nonRecursiveWatchRequests: INonRecursiveWatchRequest[] = [];
	private readonly nonRecursiveWatchRequestDelayer = this._register(new ThrottledDelayer<void>(this.getRefreshWatchersDelay(this.nonRecursiveWatchRequests.length)));

	private watchNonRecursive(resource: URI, opts: IWatchOptions): IDisposable {

		// Add to list of paths to watch non-recursively
		const request: INonRecursiveWatchRequest = {
			path: this.toWatchPath(resource),
			excludes: opts.excludes,
			includes: opts.includes,
			recursive: false,
			filter: opts.filter,
			correlationId: opts.correlationId
		};
		const remove = insert(this.nonRecursiveWatchRequests, request);

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
		this.nonRecursiveWatchRequestDelayer.trigger(() => {
			return this.doRefreshNonRecursiveWatchers();
		}, this.getRefreshWatchersDelay(this.nonRecursiveWatchRequests.length)).catch(error => onUnexpectedError(error));
	}

	private doRefreshNonRecursiveWatchers(): Promise<void> {

		// Create watcher if this is the first time
		if (!this.nonRecursiveWatcher) {
			this.nonRecursiveWatcher = this._register(this.createNonRecursiveWatcher(
				changes => this._onDidChangeFile.fire(reviveFileChanges(changes)),
				msg => this.onWatcherLogMessage(msg),
				this.logService.getLevel() === LogLevel.Trace
			));

			// Apply log levels dynamically
			this._register(this.logService.onDidChangeLogLevel(() => {
				this.nonRecursiveWatcher?.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
			}));
		}

		// Ask to watch the provided paths
		return this.nonRecursiveWatcher.watch(this.nonRecursiveWatchRequests);
	}

	protected abstract createNonRecursiveWatcher(
		onChange: (changes: IFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): AbstractNonRecursiveWatcherClient;

	//#endregion

	private onWatcherLogMessage(msg: ILogMessage): void {
		if (msg.type === 'error') {
			this._onDidWatchError.fire(msg.message);
		}

		this.logWatcherMessage(msg);
	}

	protected logWatcherMessage(msg: ILogMessage): void {
		this.logService[msg.type](msg.message);
	}

	protected toFilePath(resource: URI): string {
		return normalize(resource.fsPath);
	}

	private toWatchPath(resource: URI): string {
		const filePath = this.toFilePath(resource);

		// Ensure to have any trailing path separators removed, otherwise
		// we may believe the path is not "real" and will convert every
		// event back to this form, which is not warranted.
		// See also https://github.com/microsoft/vscode/issues/210517
		return removeTrailingPathSeparator(filePath);
	}
}
