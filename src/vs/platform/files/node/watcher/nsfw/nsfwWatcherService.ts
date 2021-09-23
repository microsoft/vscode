/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nsfw from 'nsfw';
import { existsSync } from 'fs';
import { RunOnceScheduler, ThrottledDelayer } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter } from 'vs/base/common/event';
import { parse, ParsedPattern } from 'vs/base/common/glob';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { TernarySearchTree } from 'vs/base/common/map';
import { normalizeNFC } from 'vs/base/common/normalization';
import { dirname, join } from 'vs/base/common/path';
import { isMacintosh } from 'vs/base/common/platform';
import { realcaseSync, realpathSync } from 'vs/base/node/extpath';
import { FileChangeType } from 'vs/platform/files/common/files';
import { IWatcherService } from 'vs/platform/files/node/watcher/nsfw/watcher';
import { IDiskFileChange, ILogMessage, normalizeFileChanges, IWatchRequest } from 'vs/platform/files/node/watcher/watcher';
import { watchFolder } from 'vs/base/node/watcher';

interface IWatcher extends IDisposable {

	/**
	 * The NSFW instance is resolved when the watching has started.
	 */
	readonly instance: Promise<nsfw.NSFW>;

	/**
	 * The watch request associated to the watcher.
	 */
	request: IWatchRequest;

	/**
	 * Associated ignored patterns for the watcher that can be updated.
	 */
	ignored: ParsedPattern[];

	/**
	 * How often this watcher has been restarted in case of an unexpected
	 * shutdown.
	 */
	restarts: number;

	/**
	 * The cancellation token associated with the lifecycle of the watcher.
	 */
	token: CancellationToken;
}

export class NsfwWatcherService extends Disposable implements IWatcherService {

	private static readonly FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)

	private static readonly MAX_RESTARTS = 5; // number of restarts we allow before giving up in case of unexpected shutdown

	private static readonly MAP_NSFW_ACTION_TO_FILE_CHANGE = new Map<number, number>(
		[
			[nsfw.actions.CREATED, FileChangeType.ADDED],
			[nsfw.actions.MODIFIED, FileChangeType.UPDATED],
			[nsfw.actions.DELETED, FileChangeType.DELETED],
		]
	);

	private readonly _onDidChangeFile = this._register(new Emitter<IDiskFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly _onDidLogMessage = this._register(new Emitter<ILogMessage>());
	readonly onDidLogMessage = this._onDidLogMessage.event;

	protected readonly watchers = new Map<string, IWatcher>();

	private verboseLogging = false;
	private enospcErrorLogged = false;

	constructor() {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Error handling on process
		process.on('uncaughtException', (error: Error | string) => this.onError(error));
		process.on('unhandledRejection', (error: Error | string) => this.onError(error));
	}

	async watch(requests: IWatchRequest[]): Promise<void> {

		// Figure out duplicates to remove from the requests
		const normalizedRequests = this.normalizeRequests(requests);

		// Gather paths that we should start watching
		const requestsToStartWatching = normalizedRequests.filter(request => {
			return !this.watchers.has(request.path);
		});

		// Gather paths that we should stop watching
		const pathsToStopWatching = Array.from(this.watchers.keys()).filter(watchedPath => {
			return !normalizedRequests.find(normalizedRequest => normalizedRequest.path === watchedPath);
		});

		// Logging
		this.debug(`Request to start watching: ${requestsToStartWatching.map(request => `${request.path} (excludes: ${request.excludes})`).join(',')}`);
		this.debug(`Request to stop watching: ${pathsToStopWatching.join(',')}`);

		// Stop watching as instructed
		for (const pathToStopWatching of pathsToStopWatching) {
			this.stopWatching(pathToStopWatching);
		}

		// Start watching as instructed
		for (const request of requestsToStartWatching) {
			this.startWatching(request);
		}

		// Update ignore rules for all watchers
		for (const request of normalizedRequests) {
			const watcher = this.watchers.get(request.path);
			if (watcher) {
				watcher.request = request;
				watcher.ignored = this.toExcludePatterns(request.excludes);
			}
		}
	}

	private toExcludePatterns(excludes: string[] | undefined): ParsedPattern[] {
		return Array.isArray(excludes) ? excludes.map(exclude => parse(exclude)) : [];
	}

	private startWatching(request: IWatchRequest, restarts = 0): void {
		const cts = new CancellationTokenSource();

		let undeliveredFileEvents: IDiskFileChange[] = [];
		const fileEventDelayer = new ThrottledDelayer<void>(NsfwWatcherService.FS_EVENT_DELAY);

		let nsfwPromiseResolve: (watcher: nsfw.NSFW) => void;
		const instance = new Promise<nsfw.NSFW>(resolve => nsfwPromiseResolve = resolve);

		// Remember as watcher instance
		const watcher: IWatcher = {
			request,
			instance,
			ignored: this.toExcludePatterns(request.excludes),
			restarts,
			token: cts.token,
			dispose: () => {
				cts.dispose(true);
				fileEventDelayer.dispose();
				instance.then(instance => instance.stop());
			}
		};
		this.watchers.set(request.path, watcher);

		// Path checks for symbolic links / wrong casing
		const { realBasePathDiffers, realBasePathLength } = this.checkRequest(request);

		const onFileEvent = (path: string, type: FileChangeType) => {
			if (!this.isPathIgnored(path, watcher.ignored)) {
				undeliveredFileEvents.push({ type, path });
			} else if (this.verboseLogging) {
				this.log(` >> ignored ${path}`);
			}
		};

		nsfw(request.path, events => {
			for (const event of events) {
				if (watcher.token.isCancellationRequested) {
					break; // return early when disposed
				}

				// Logging
				if (this.verboseLogging) {
					const logPath = event.action === nsfw.actions.RENAMED ? `${join(event.directory, event.oldFile || '')} -> ${event.newFile}` : join(event.directory, event.file || '');
					this.log(`${event.action === nsfw.actions.CREATED ? '[CREATED]' : event.action === nsfw.actions.DELETED ? '[DELETED]' : event.action === nsfw.actions.MODIFIED ? '[CHANGED]' : '[RENAMED]'} ${logPath}`);
				}

				// Rename: convert into DELETE & ADD
				if (event.action === nsfw.actions.RENAMED) {
					onFileEvent(join(event.directory, event.oldFile || ''), FileChangeType.DELETED); // Rename fires when a file's name changes within a single directory
					onFileEvent(join(event.newDirectory || event.directory, event.newFile || ''), FileChangeType.ADDED);
				}

				// Created, modified, deleted: taks as is
				else {
					onFileEvent(join(event.directory, event.file || ''), NsfwWatcherService.MAP_NSFW_ACTION_TO_FILE_CHANGE.get(event.action)!);
				}
			}

			// Send events delayed and normalized
			fileEventDelayer.trigger(async () => {
				if (watcher.token.isCancellationRequested) {
					return; // return early when disposed
				}

				// Remember as delivered
				const events = undeliveredFileEvents;
				undeliveredFileEvents = [];

				// Broadcast to clients normalized
				const normalizedEvents = normalizeFileChanges(this.normalizeEvents(events, request, realBasePathDiffers, realBasePathLength));
				this.emitEvents(normalizedEvents);
			});
		}, {
			errorCallback: error => {
				if (!watcher.token.isCancellationRequested) {
					this.onError(error, watcher); // error handling only if we are not disposed yet
				}
			}
		}).then(async nsfwWatcher => {

			// Begin watching unless disposed already
			if (!watcher.token.isCancellationRequested) {
				await nsfwWatcher.start();
			}

			return nsfwWatcher;
		}).then(nsfwWatcher => {
			this.debug(`Started watching: ${request.path}`);

			nsfwPromiseResolve(nsfwWatcher);
		});
	}

	private emitEvents(events: IDiskFileChange[]): void {

		// Send outside
		this._onDidChangeFile.fire(events);

		// Logging
		if (this.verboseLogging) {
			for (const event of events) {
				this.log(` >> normalized ${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.path}`);
			}
		}
	}

	private checkRequest(request: IWatchRequest): { realBasePathDiffers: boolean, realBasePathLength: number } {
		let realBasePathDiffers = false;
		let realBasePathLength = request.path.length;

		// macOS: nsfw will report paths in their dereferenced and real casing
		// form, so we need to detect this early on to be able to rewrite the
		// file events to the original requested form.
		// Note: Other platforms do not seem to have these path issues.
		if (isMacintosh) {
			try {

				// First check for symbolic link
				let realBasePath = realpathSync(request.path);

				// Second check for casing difference
				if (request.path === realBasePath) {
					realBasePath = (realcaseSync(request.path) || request.path);
				}

				if (request.path !== realBasePath) {
					realBasePathLength = realBasePath.length;
					realBasePathDiffers = true;

					this.warn(`correcting a path to watch that seems to be a symbolic link (original: ${request.path}, real: ${realBasePath})`);
				}
			} catch (error) {
				// ignore
			}
		}

		return { realBasePathDiffers, realBasePathLength };
	}

	private normalizeEvents(events: IDiskFileChange[], request: IWatchRequest, realBasePathDiffers: boolean, realBasePathLength: number): IDiskFileChange[] {
		if (isMacintosh) {
			for (const event of events) {

				// Mac uses NFD unicode form on disk, but we want NFC
				event.path = normalizeNFC(event.path);

				// Convert paths back to original form in case it differs
				if (realBasePathDiffers) {
					event.path = request.path + event.path.substr(realBasePathLength);
				}
			}
		}

		return events;
	}

	private onError(error: unknown, watcher?: IWatcher): void {
		const msg = toErrorMessage(error);

		// Specially handle ENOSPC errors that can happen when
		// the watcher consumes so many file descriptors that
		// we are running into a limit. We only want to warn
		// once in this case to avoid log spam.
		// See https://github.com/microsoft/vscode/issues/7950
		if (msg.indexOf('Inotify limit reached') !== -1) {
			if (!this.enospcErrorLogged) {
				this.enospcErrorLogged = true; // only log this error once to protect against log spam
				this.error('Inotify limit reached (ENOSPC)', watcher);
			}
		}

		// Specially handle this error that indicates the watcher
		// has stopped and we need to restart it.
		else if (msg.indexOf('Service shutdown unexpectedly') !== -1) {
			const handled = this.onUnexpectedShutdown(watcher);
			if (!handled) {
				this.error('Watcher service shutdown unexpectedly (ESHUTDOWN)', watcher);
			}
		}

		// Log any other error
		else {
			this.error(msg, watcher);
		}
	}

	private onUnexpectedShutdown(watcher?: IWatcher): boolean {
		if (!watcher || watcher.restarts >= NsfwWatcherService.MAX_RESTARTS) {
			return false; // we need a watcher that has not been restarted 5 times already
		}

		let handled = false;

		// Just try to restart watcher now if the path still exists
		if (existsSync(watcher.request.path)) {
			this.warn('Watcher service shutdown unexpectedly and will be restarted', watcher);
			this.restartWatching(watcher);

			handled = true;
		}

		// Otherwise try to monitor the path coming back before
		// restarting the watcher
		else {
			handled = this.onWatchedPathDeleted(watcher);
		}

		return handled;
	}

	private onWatchedPathDeleted(watcher: IWatcher): boolean {
		this.warn('Watcher service shutdown unexpectedly because watched path got deleted', watcher);

		// Send a manual event given we know the root got deleted
		this.emitEvents([{ path: watcher.request.path, type: FileChangeType.DELETED }]);

		const parentPath = dirname(watcher.request.path);
		if (existsSync(parentPath)) {
			const disposable = watchFolder(parentPath, (type, path) => {
				if (watcher.token.isCancellationRequested) {
					return; // return early when disposed
				}

				// Watcher path came back! Restart watching...
				if (path === watcher.request.path && (type === 'added' || type === 'changed')) {

					// Stop watching that parent folder
					disposable.dispose();

					// Send a manual event given we know the root got added again
					this.emitEvents([{ path: watcher.request.path, type: FileChangeType.ADDED }]);

					// Restart the file watching delayed
					const scheduler = new RunOnceScheduler(() => {
						if (watcher.token.isCancellationRequested) {
							return; // return early when disposed
						}

						this.warn('Watcher service restarts for watched path got created again', watcher);

						this.restartWatching(watcher);
						scheduler.dispose();
					}, 800);
					scheduler.schedule();
					watcher.token.onCancellationRequested(() => scheduler.dispose());
				}
			}, error => {
				// Ignore
			});

			// Make sure to stop watching when the watcher is disposed
			watcher.token.onCancellationRequested(() => disposable.dispose());

			return true; // handled
		}

		return false; // not handled
	}

	async stop(): Promise<void> {
		for (const [path] of this.watchers) {
			this.stopWatching(path);
		}

		this.watchers.clear();
	}

	private restartWatching(watcher: IWatcher): void {
		this.stopWatching(watcher.request.path);
		this.startWatching(watcher.request, watcher.restarts + 1);
	}

	private stopWatching(path: string): void {
		const watcher = this.watchers.get(path);
		if (watcher) {
			watcher.dispose();
			this.watchers.delete(path);
		}
	}

	protected normalizeRequests(requests: IWatchRequest[]): IWatchRequest[] {
		const requestTrie = TernarySearchTree.forPaths<IWatchRequest>();

		// Sort requests by path length to have shortest first
		// to have a way to prevent children to be watched if
		// parents exist.
		requests.sort((requestA, requestB) => requestA.path.length - requestB.path.length);

		// Only consider requests for watching that are not
		// a child of an existing request path to prevent
		// duplication.
		//
		// However, allow explicit requests to watch folders
		// that are symbolic links because the NSFW watcher
		// does not allow to recursively watch symbolic links.
		for (const request of requests) {
			if (requestTrie.findSubstr(request.path)) {
				try {
					const realpath = realpathSync(request.path);
					if (realpath === request.path) {
						this.warn(`ignoring a path for watching who's parent is already watched: ${request.path}`);

						continue; // path is not a symbolic link or similar
					}
				} catch (error) {
					continue; // invalid path - ignore from watching
				}
			}

			requestTrie.set(request.path, request);
		}

		return Array.from(requestTrie).map(([, request]) => request);
	}

	private isPathIgnored(absolutePath: string, ignored: ParsedPattern[]): boolean {
		return ignored.some(ignore => ignore(absolutePath));
	}

	async setVerboseLogging(enabled: boolean): Promise<void> {
		this.verboseLogging = enabled;
	}

	private log(message: string) {
		this._onDidLogMessage.fire({ type: 'trace', message: this.toMessage(message) });
	}

	private warn(message: string, watcher?: IWatcher) {
		this._onDidLogMessage.fire({ type: 'warn', message: this.toMessage(message, watcher) });
	}

	private error(message: string, watcher: IWatcher | undefined) {
		this._onDidLogMessage.fire({ type: 'error', message: this.toMessage(message, watcher) });
	}

	private debug(message: string): void {
		this._onDidLogMessage.fire({ type: 'debug', message: this.toMessage(message) });
	}

	private toMessage(message: string, watcher?: IWatcher): string {
		return watcher ? `[File Watcher (nsfw)] ${message} (path: ${watcher.request.path})` : `[File Watcher (nsfw)] ${message}`;
	}
}
