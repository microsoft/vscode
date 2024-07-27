/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { insert } from 'vs/base/common/arrays';
import { ThrottledDelayer } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { removeTrailingPathSeparator } from 'vs/base/common/extpath';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { normalize } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IFileChange, IFileSystemProvider, IWatchOptions } from 'vs/platform/files/common/files';
import { AbstractNonRecursiveWatcherClient, AbstractUniversalWatcherClient, ILogMessage, INonRecursiveWatchRequest, IRecursiveWatcherOptions, isRecursiveWatchRequest, IUniversalWatchRequest, reviveFileChanges } from 'vs/platform/files/common/watcher';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';

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

	//#region File Watching (universal)

	private universalWatcher: AbstractUniversalWatcherClient | undefined;

	private readonly universalWatchRequests: IUniversalWatchRequest[] = [];
	private readonly universalWatchRequestDelayer = this._register(new ThrottledDelayer<void>(0));

	private watchUniversal(resource: URI, opts: IWatchOptions): IDisposable {

		// Add to list of paths to watch universally
		const request: IUniversalWatchRequest = {
			path: this.toWatchPath(resource),
			excludes: opts.excludes,
			includes: opts.includes,
			recursive: opts.recursive,
			filter: opts.filter,
			correlationId: opts.correlationId
		};
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

	private refreshUniversalWatchers(): void {

		// Buffer requests for universal watching to decide on right watcher
		// that supports potentially watching more than one path at once
		this.universalWatchRequestDelayer.trigger(() => {
			return this.doRefreshUniversalWatchers();
		}).catch(error => onUnexpectedError(error));
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

		// Adjust for polling
		const usePolling = this.options?.watcher?.recursive?.usePolling;
		if (usePolling === true) {
			for (const request of this.universalWatchRequests) {
				if (isRecursiveWatchRequest(request)) {
					request.pollingInterval = this.options?.watcher?.recursive?.pollingInterval ?? 5000;
				}
			}
		} else if (Array.isArray(usePolling)) {
			for (const request of this.universalWatchRequests) {
				if (isRecursiveWatchRequest(request)) {
					if (usePolling.includes(request.path)) {
						request.pollingInterval = this.options?.watcher?.recursive?.pollingInterval ?? 5000;
					}
				}
			}
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
	private readonly nonRecursiveWatchRequestDelayer = this._register(new ThrottledDelayer<void>(0));

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
