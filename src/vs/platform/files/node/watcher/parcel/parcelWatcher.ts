/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as parcelWatcher from '@parcel/watcher';
import { existsSync, statSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { DeferredPromise, RunOnceScheduler, ThrottledWorker } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter } from 'vs/base/common/event';
import { isEqualOrParent, randomPath } from 'vs/base/common/extpath';
import { GLOBSTAR, ParsedPattern, patternsEquals } from 'vs/base/common/glob';
import { Disposable } from 'vs/base/common/lifecycle';
import { TernarySearchTree } from 'vs/base/common/ternarySearchTree';
import { normalizeNFC } from 'vs/base/common/normalization';
import { dirname, isAbsolute, join, normalize, sep } from 'vs/base/common/path';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { rtrim } from 'vs/base/common/strings';
import { realcaseSync, realpathSync } from 'vs/base/node/extpath';
import { NodeJSFileWatcherLibrary } from 'vs/platform/files/node/watcher/nodejs/nodejsWatcherLib';
import { FileChangeType } from 'vs/platform/files/common/files';
import { IDiskFileChange, ILogMessage, coalesceEvents, IRecursiveWatchRequest, IRecursiveWatcher, parseWatcherPatterns } from 'vs/platform/files/common/watcher';

export interface IParcelWatcherInstance {

	/**
	 * Signals when the watcher is ready to watch.
	 */
	readonly ready: Promise<unknown>;

	/**
	 * The watch request associated to the watcher.
	 */
	readonly request: IRecursiveWatchRequest;

	/**
	 * How often this watcher has been restarted in case of an unexpected
	 * shutdown.
	 */
	readonly restarts: number;

	/**
	 * The cancellation token associated with the lifecycle of the watcher.
	 */
	readonly token: CancellationToken;

	/**
	 * Stops and disposes the watcher. This operation is async to await
	 * unsubscribe call in Parcel.
	 */
	stop(): Promise<void>;
}

export class ParcelWatcher extends Disposable implements IRecursiveWatcher {

	private static readonly MAP_PARCEL_WATCHER_ACTION_TO_FILE_CHANGE = new Map<parcelWatcher.EventType, number>(
		[
			['create', FileChangeType.ADDED],
			['update', FileChangeType.UPDATED],
			['delete', FileChangeType.DELETED]
		]
	);

	private static readonly GLOB_MARKERS = {
		Star: '*',
		GlobStar: '**',
		GlobStarPosix: '**/**',
		GlobStarWindows: '**\\**',
		GlobStarPathStartPosix: '**/',
		GlobStarPathEndPosix: '/**',
		StarPathEndPosix: '/*',
		GlobStarPathStartWindows: '**\\',
		GlobStarPathEndWindows: '\\**'
	};

	private static readonly PARCEL_WATCHER_BACKEND = isWindows ? 'windows' : isLinux ? 'inotify' : 'fs-events';

	private readonly _onDidChangeFile = this._register(new Emitter<IDiskFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly _onDidLogMessage = this._register(new Emitter<ILogMessage>());
	readonly onDidLogMessage = this._onDidLogMessage.event;

	private readonly _onDidError = this._register(new Emitter<string>());
	readonly onDidError = this._onDidError.event;

	protected readonly watchers = new Map<string, IParcelWatcherInstance>();

	// Reduce likelyhood of spam from file events via throttling.
	// (https://github.com/microsoft/vscode/issues/124723)
	private readonly throttledFileChangesWorker = new ThrottledWorker<IDiskFileChange>(
		{
			maxWorkChunkSize: 500,	// only process up to 500 changes at once before...
			throttleDelay: 200,	  	// ...resting for 200ms until we process events again...
			maxBufferedWork: 30000 	// ...but never buffering more than 30000 events in memory
		},
		events => this._onDidChangeFile.fire(events)
	);

	private verboseLogging = false;
	private enospcErrorLogged = false;

	constructor() {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Error handling on process
		process.on('uncaughtException', error => this.onUnexpectedError(error));
		process.on('unhandledRejection', error => this.onUnexpectedError(error));
	}

	async watch(requests: IRecursiveWatchRequest[]): Promise<void> {

		// Figure out duplicates to remove from the requests
		const normalizedRequests = this.normalizeRequests(requests);

		// Gather paths that we should start watching
		const requestsToStartWatching = normalizedRequests.filter(request => {
			const watcher = this.watchers.get(request.path);
			if (!watcher) {
				return true; // not yet watching that path
			}

			// Re-watch path if excludes/includes have changed or polling interval
			return !patternsEquals(watcher.request.excludes, request.excludes) || !patternsEquals(watcher.request.includes, request.includes) || watcher.request.pollingInterval !== request.pollingInterval;
		});

		// Gather paths that we should stop watching
		const pathsToStopWatching = Array.from(this.watchers.values()).filter(({ request }) => {
			return !normalizedRequests.find(normalizedRequest => {
				return normalizedRequest.path === request.path &&
					patternsEquals(normalizedRequest.excludes, request.excludes) &&
					patternsEquals(normalizedRequest.includes, request.includes) &&
					normalizedRequest.pollingInterval === request.pollingInterval;

			});
		}).map(({ request }) => request.path);

		// Logging

		if (requestsToStartWatching.length) {
			this.trace(`Request to start watching: ${requestsToStartWatching.map(request => `${request.path} (excludes: ${request.excludes.length > 0 ? request.excludes : '<none>'}, includes: ${request.includes && request.includes.length > 0 ? JSON.stringify(request.includes) : '<all>'})`).join(',')}`);
		}

		if (pathsToStopWatching.length) {
			this.trace(`Request to stop watching: ${pathsToStopWatching.join(',')}`);
		}

		// Stop watching as instructed
		for (const pathToStopWatching of pathsToStopWatching) {
			await this.stopWatching(pathToStopWatching);
		}

		// Start watching as instructed
		for (const request of requestsToStartWatching) {
			if (request.pollingInterval) {
				this.startPolling(request, request.pollingInterval);
			} else {
				this.startWatching(request);
			}
		}
	}

	protected toExcludePaths(path: string, excludes: string[] | undefined): string[] | undefined {
		if (!Array.isArray(excludes)) {
			return undefined;
		}

		const excludePaths = new Set<string>();

		// Parcel watcher currently does not support glob patterns
		// for native exclusions. As long as that is the case, try
		// to convert exclude patterns into absolute paths that the
		// watcher supports natively to reduce the overhead at the
		// level of the file watcher as much as possible.
		// Refs: https://github.com/parcel-bundler/watcher/issues/64
		for (const exclude of excludes) {
			const isGlob = exclude.includes(ParcelWatcher.GLOB_MARKERS.Star);

			// Glob pattern: check for typical patterns and convert
			let normalizedExclude: string | undefined = undefined;
			if (isGlob) {

				// Examples: **, **/**, **\**
				if (
					exclude === ParcelWatcher.GLOB_MARKERS.GlobStar ||
					exclude === ParcelWatcher.GLOB_MARKERS.GlobStarPosix ||
					exclude === ParcelWatcher.GLOB_MARKERS.GlobStarWindows
				) {
					normalizedExclude = path;
				}

				// Examples:
				// - **/node_modules/**
				// - **/.git/objects/**
				// - **/build-folder
				// - output/**
				else {
					const startsWithGlobStar = exclude.startsWith(ParcelWatcher.GLOB_MARKERS.GlobStarPathStartPosix) || exclude.startsWith(ParcelWatcher.GLOB_MARKERS.GlobStarPathStartWindows);
					const endsWithGlobStar = exclude.endsWith(ParcelWatcher.GLOB_MARKERS.GlobStarPathEndPosix) || exclude.endsWith(ParcelWatcher.GLOB_MARKERS.GlobStarPathEndWindows);
					if (startsWithGlobStar || endsWithGlobStar) {
						if (startsWithGlobStar && endsWithGlobStar) {
							normalizedExclude = exclude.substring(ParcelWatcher.GLOB_MARKERS.GlobStarPathStartPosix.length, exclude.length - ParcelWatcher.GLOB_MARKERS.GlobStarPathEndPosix.length);
						} else if (startsWithGlobStar) {
							normalizedExclude = exclude.substring(ParcelWatcher.GLOB_MARKERS.GlobStarPathStartPosix.length);
						} else {
							normalizedExclude = exclude.substring(0, exclude.length - ParcelWatcher.GLOB_MARKERS.GlobStarPathEndPosix.length);
						}
					}

					// Support even more glob patterns on Linux where we know
					// that each folder requires a file handle to watch.
					// Examples:
					// - node_modules/* (full form: **/node_modules/*/**)
					if (isLinux && normalizedExclude) {
						const endsWithStar = normalizedExclude?.endsWith(ParcelWatcher.GLOB_MARKERS.StarPathEndPosix);
						if (endsWithStar) {
							normalizedExclude = normalizedExclude.substring(0, normalizedExclude.length - ParcelWatcher.GLOB_MARKERS.StarPathEndPosix.length);
						}
					}
				}
			}

			// Not a glob pattern, take as is
			else {
				normalizedExclude = exclude;
			}

			if (!normalizedExclude || normalizedExclude.includes(ParcelWatcher.GLOB_MARKERS.Star)) {
				continue; // skip for parcel (will be applied later by our glob matching)
			}

			// Absolute path: normalize to watched path and
			// exclude if not a parent of it otherwise.
			if (isAbsolute(normalizedExclude)) {
				if (!isEqualOrParent(normalizedExclude, path, !isLinux)) {
					continue; // exclude points to path outside of watched folder, ignore
				}

				// convert to relative path to ensure we
				// get the correct path casing going forward
				normalizedExclude = normalizedExclude.substr(path.length);
			}

			// Finally take as relative path joined to watched path
			excludePaths.add(rtrim(join(path, normalizedExclude), sep));
		}

		if (excludePaths.size > 0) {
			return Array.from(excludePaths);
		}

		return undefined;
	}

	private startPolling(request: IRecursiveWatchRequest, pollingInterval: number, restarts = 0): void {
		const cts = new CancellationTokenSource();

		const instance = new DeferredPromise<void>();

		const snapshotFile = randomPath(tmpdir(), 'vscode-watcher-snapshot');

		// Remember as watcher instance
		const watcher: IParcelWatcherInstance = {
			request,
			ready: instance.p,
			restarts,
			token: cts.token,
			stop: async () => {
				cts.dispose(true);
				pollingWatcher.dispose();
				unlinkSync(snapshotFile);
			}
		};
		this.watchers.set(request.path, watcher);

		// Path checks for symbolic links / wrong casing
		const { realPath, realPathDiffers, realPathLength } = this.normalizePath(request);

		// Warm up exclude/include patterns for usage
		const excludePatterns = parseWatcherPatterns(request.path, request.excludes);
		const includePatterns = request.includes ? parseWatcherPatterns(request.path, request.includes) : undefined;

		const ignore = this.toExcludePaths(realPath, watcher.request.excludes);

		this.trace(`Started watching: '${realPath}' with polling interval '${pollingInterval}' and native excludes '${ignore?.join(', ')}'`);

		let counter = 0;

		const pollingWatcher = new RunOnceScheduler(async () => {
			counter++;

			if (cts.token.isCancellationRequested) {
				return;
			}

			// We already ran before, check for events since
			if (counter > 1) {
				const parcelEvents = await parcelWatcher.getEventsSince(realPath, snapshotFile, { ignore, backend: ParcelWatcher.PARCEL_WATCHER_BACKEND });

				if (cts.token.isCancellationRequested) {
					return;
				}

				// Handle & emit events
				this.onParcelEvents(parcelEvents, watcher, excludePatterns, includePatterns, realPathDiffers, realPathLength);
			}

			// Store a snapshot of files to the snapshot file
			await parcelWatcher.writeSnapshot(realPath, snapshotFile, { ignore, backend: ParcelWatcher.PARCEL_WATCHER_BACKEND });

			// Signal we are ready now when the first snapshot was written
			if (counter === 1) {
				instance.complete();
			}

			if (cts.token.isCancellationRequested) {
				return;
			}

			// Schedule again at the next interval
			pollingWatcher.schedule();
		}, pollingInterval);
		pollingWatcher.schedule(0);
	}

	private startWatching(request: IRecursiveWatchRequest, restarts = 0): void {
		const cts = new CancellationTokenSource();

		const instance = new DeferredPromise<parcelWatcher.AsyncSubscription | undefined>();

		// Remember as watcher instance
		const watcher: IParcelWatcherInstance = {
			request,
			ready: instance.p,
			restarts,
			token: cts.token,
			stop: async () => {
				cts.dispose(true);

				const watcherInstance = await instance.p;
				await watcherInstance?.unsubscribe();
			}
		};
		this.watchers.set(request.path, watcher);

		// Path checks for symbolic links / wrong casing
		const { realPath, realPathDiffers, realPathLength } = this.normalizePath(request);

		// Warm up exclude/include patterns for usage
		const excludePatterns = parseWatcherPatterns(request.path, request.excludes);
		const includePatterns = request.includes ? parseWatcherPatterns(request.path, request.includes) : undefined;

		const ignore = this.toExcludePaths(realPath, watcher.request.excludes);
		parcelWatcher.subscribe(realPath, (error, parcelEvents) => {
			if (watcher.token.isCancellationRequested) {
				return; // return early when disposed
			}

			// In any case of an error, treat this like a unhandled exception
			// that might require the watcher to restart. We do not really know
			// the state of parcel at this point and as such will try to restart
			// up to our maximum of restarts.
			if (error) {
				this.onUnexpectedError(error, watcher);
			}

			// Handle & emit events
			this.onParcelEvents(parcelEvents, watcher, excludePatterns, includePatterns, realPathDiffers, realPathLength);
		}, {
			backend: ParcelWatcher.PARCEL_WATCHER_BACKEND,
			ignore
		}).then(parcelWatcher => {
			this.trace(`Started watching: '${realPath}' with backend '${ParcelWatcher.PARCEL_WATCHER_BACKEND}' and native excludes '${ignore?.join(', ')}'`);

			instance.complete(parcelWatcher);
		}).catch(error => {
			this.onUnexpectedError(error, watcher);

			instance.complete(undefined);
		});
	}

	private onParcelEvents(parcelEvents: parcelWatcher.Event[], watcher: IParcelWatcherInstance, excludes: ParsedPattern[], includes: ParsedPattern[] | undefined, realPathDiffers: boolean, realPathLength: number): void {
		if (parcelEvents.length === 0) {
			return;
		}

		// Normalize events: handle NFC normalization and symlinks
		// It is important to do this before checking for includes
		// and excludes to check on the original path.
		const { events: normalizedEvents, rootDeleted } = this.normalizeEvents(parcelEvents, watcher.request, realPathDiffers, realPathLength);

		// Check for excludes
		const includedEvents = this.handleExcludeIncludes(normalizedEvents, excludes, includes);

		// Coalesce events: merge events of same kind
		const coalescedEvents = coalesceEvents(includedEvents);

		// Filter events: check for specific events we want to exclude
		const filteredEvents = this.filterEvents(coalescedEvents, watcher.request, rootDeleted);

		// Broadcast to clients
		this.emitEvents(filteredEvents);

		// Handle root path delete if confirmed from coalesced events
		if (rootDeleted && coalescedEvents.some(event => event.path === watcher.request.path && event.type === FileChangeType.DELETED)) {
			this.onWatchedPathDeleted(watcher);
		}
	}

	private handleExcludeIncludes(parcelEvents: parcelWatcher.Event[], excludes: ParsedPattern[], includes: ParsedPattern[] | undefined): IDiskFileChange[] {
		const events: IDiskFileChange[] = [];

		for (const { path, type: parcelEventType } of parcelEvents) {
			const type = ParcelWatcher.MAP_PARCEL_WATCHER_ACTION_TO_FILE_CHANGE.get(parcelEventType)!;
			if (this.verboseLogging) {
				this.trace(`${type === FileChangeType.ADDED ? '[ADDED]' : type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${path}`);
			}

			// Add to buffer unless excluded or not included (not if explicitly disabled)
			if (excludes.some(exclude => exclude(path))) {
				if (this.verboseLogging) {
					this.trace(` >> ignored (excluded) ${path}`);
				}
			} else if (includes && includes.length > 0 && !includes.some(include => include(path))) {
				if (this.verboseLogging) {
					this.trace(` >> ignored (not included) ${path}`);
				}
			} else {
				events.push({ type, path });
			}
		}

		return events;
	}

	private emitEvents(events: IDiskFileChange[]): void {
		if (events.length === 0) {
			return;
		}

		// Logging
		if (this.verboseLogging) {
			for (const event of events) {
				this.trace(` >> normalized ${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.path}`);
			}
		}

		// Broadcast to clients via throttler
		const worked = this.throttledFileChangesWorker.work(events);

		// Logging
		if (!worked) {
			this.warn(`started ignoring events due to too many file change events at once (incoming: ${events.length}, most recent change: ${events[0].path}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
		} else {
			if (this.throttledFileChangesWorker.pending > 0) {
				this.trace(`started throttling events due to large amount of file change events at once (pending: ${this.throttledFileChangesWorker.pending}, most recent change: ${events[0].path}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
			}
		}
	}

	private normalizePath(request: IRecursiveWatchRequest): { realPath: string; realPathDiffers: boolean; realPathLength: number } {
		let realPath = request.path;
		let realPathDiffers = false;
		let realPathLength = request.path.length;

		try {

			// First check for symbolic link
			realPath = realpathSync(request.path);

			// Second check for casing difference
			// Note: this will be a no-op on Linux platforms
			if (request.path === realPath) {
				realPath = realcaseSync(request.path) ?? request.path;
			}

			// Correct watch path as needed
			if (request.path !== realPath) {
				realPathLength = realPath.length;
				realPathDiffers = true;

				this.trace(`correcting a path to watch that seems to be a symbolic link or wrong casing (original: ${request.path}, real: ${realPath})`);
			}
		} catch (error) {
			// ignore
		}

		return { realPath, realPathDiffers, realPathLength };
	}

	private normalizeEvents(events: parcelWatcher.Event[], request: IRecursiveWatchRequest, realPathDiffers: boolean, realPathLength: number): { events: parcelWatcher.Event[]; rootDeleted: boolean } {
		let rootDeleted = false;

		for (const event of events) {

			// Mac uses NFD unicode form on disk, but we want NFC
			if (isMacintosh) {
				event.path = normalizeNFC(event.path);
			}

			// Workaround for https://github.com/parcel-bundler/watcher/issues/68
			// where watching root drive letter adds extra backslashes.
			if (isWindows) {
				if (request.path.length <= 3) { // for ex. c:, C:\
					event.path = normalize(event.path);
				}
			}

			// Convert paths back to original form in case it differs
			if (realPathDiffers) {
				event.path = request.path + event.path.substr(realPathLength);
			}

			// Check for root deleted
			if (event.path === request.path && event.type === 'delete') {
				rootDeleted = true;
			}
		}

		return { events, rootDeleted };
	}

	private filterEvents(events: IDiskFileChange[], request: IRecursiveWatchRequest, rootDeleted: boolean): IDiskFileChange[] {
		if (!rootDeleted) {
			return events;
		}

		return events.filter(event => {
			if (event.path === request.path && event.type === FileChangeType.DELETED) {
				// Explicitly exclude changes to root if we have any
				// to avoid VS Code closing all opened editors which
				// can happen e.g. in case of network connectivity
				// issues
				// (https://github.com/microsoft/vscode/issues/136673)
				return false;
			}

			return true;
		});
	}

	private onWatchedPathDeleted(watcher: IParcelWatcherInstance): void {
		this.warn('Watcher shutdown because watched path got deleted', watcher);

		const parentPath = dirname(watcher.request.path);
		if (existsSync(parentPath)) {
			const nodeWatcher = new NodeJSFileWatcherLibrary({ path: parentPath, excludes: [], recursive: false }, changes => {
				if (watcher.token.isCancellationRequested) {
					return; // return early when disposed
				}

				// Watcher path came back! Restart watching...
				for (const { path, type } of changes) {
					if (path === watcher.request.path && (type === FileChangeType.ADDED || type === FileChangeType.UPDATED)) {
						this.warn('Watcher restarts because watched path got created again', watcher);

						// Stop watching that parent folder
						nodeWatcher.dispose();

						// Restart the file watching
						this.restartWatching(watcher);

						break;
					}
				}
			}, msg => this._onDidLogMessage.fire(msg), this.verboseLogging);

			// Make sure to stop watching when the watcher is disposed
			watcher.token.onCancellationRequested(() => nodeWatcher.dispose());
		}
	}

	private onUnexpectedError(error: unknown, watcher?: IParcelWatcherInstance): void {
		const msg = toErrorMessage(error);

		// Specially handle ENOSPC errors that can happen when
		// the watcher consumes so many file descriptors that
		// we are running into a limit. We only want to warn
		// once in this case to avoid log spam.
		// See https://github.com/microsoft/vscode/issues/7950
		if (msg.indexOf('No space left on device') !== -1) {
			if (!this.enospcErrorLogged) {
				this.error('Inotify limit reached (ENOSPC)', watcher);

				this.enospcErrorLogged = true;
			}
		}

		// Any other error is unexpected and we should try to
		// restart the watcher as a result to get into healthy
		// state again if possible and if not attempted too much
		else {
			this.error(`Unexpected error: ${msg} (EUNKNOWN)`, watcher);

			this._onDidError.fire(msg);
		}
	}

	async stop(): Promise<void> {
		for (const [path] of this.watchers) {
			await this.stopWatching(path);
		}

		this.watchers.clear();
	}

	protected restartWatching(watcher: IParcelWatcherInstance, delay = 800): void {

		// Restart watcher delayed to accomodate for
		// changes on disk that have triggered the
		// need for a restart in the first place.
		const scheduler = new RunOnceScheduler(async () => {
			if (watcher.token.isCancellationRequested) {
				return; // return early when disposed
			}

			// Await the watcher having stopped, as this is
			// needed to properly re-watch the same path
			await this.stopWatching(watcher.request.path);

			// Start watcher again counting the restarts
			if (watcher.request.pollingInterval) {
				this.startPolling(watcher.request, watcher.request.pollingInterval, watcher.restarts + 1);
			} else {
				this.startWatching(watcher.request, watcher.restarts + 1);
			}
		}, delay);

		scheduler.schedule();
		watcher.token.onCancellationRequested(() => scheduler.dispose());
	}

	private async stopWatching(path: string): Promise<void> {
		const watcher = this.watchers.get(path);
		if (watcher) {
			this.trace(`stopping file watcher on ${watcher.request.path}`);

			this.watchers.delete(path);

			try {
				await watcher.stop();
			} catch (error) {
				this.error(`Unexpected error stopping watcher: ${toErrorMessage(error)}`, watcher);
			}
		}
	}

	protected normalizeRequests(requests: IRecursiveWatchRequest[], validatePaths = true): IRecursiveWatchRequest[] {
		const requestTrie = TernarySearchTree.forPaths<IRecursiveWatchRequest>(!isLinux);

		// Sort requests by path length to have shortest first
		// to have a way to prevent children to be watched if
		// parents exist.
		requests.sort((requestA, requestB) => requestA.path.length - requestB.path.length);

		// Only consider requests for watching that are not
		// a child of an existing request path to prevent
		// duplication. In addition, drop any request where
		// everything is excluded (via `**` glob).
		//
		// However, allow explicit requests to watch folders
		// that are symbolic links because the Parcel watcher
		// does not allow to recursively watch symbolic links.
		for (const request of requests) {
			if (request.excludes.includes(GLOBSTAR)) {
				continue; // path is ignored entirely (via `**` glob exclude)
			}

			// Check for overlapping requests
			if (requestTrie.findSubstr(request.path)) {
				try {
					const realpath = realpathSync(request.path);
					if (realpath === request.path) {
						this.trace(`ignoring a path for watching who's parent is already watched: ${request.path}`);

						continue;
					}
				} catch (error) {
					this.trace(`ignoring a path for watching who's realpath failed to resolve: ${request.path} (error: ${error})`);

					continue;
				}
			}

			// Check for invalid paths
			if (validatePaths) {
				try {
					const stat = statSync(request.path);
					if (!stat.isDirectory()) {
						this.trace(`ignoring a path for watching that is a file and not a folder: ${request.path}`);

						continue;
					}
				} catch (error) {
					this.trace(`ignoring a path for watching who's stat info failed to resolve: ${request.path} (error: ${error})`);

					continue;
				}
			}

			requestTrie.set(request.path, request);
		}

		return Array.from(requestTrie).map(([, request]) => request);
	}

	async setVerboseLogging(enabled: boolean): Promise<void> {
		this.verboseLogging = enabled;
	}

	private trace(message: string) {
		if (this.verboseLogging) {
			this._onDidLogMessage.fire({ type: 'trace', message: this.toMessage(message) });
		}
	}

	private warn(message: string, watcher?: IParcelWatcherInstance) {
		this._onDidLogMessage.fire({ type: 'warn', message: this.toMessage(message, watcher) });
	}

	private error(message: string, watcher: IParcelWatcherInstance | undefined) {
		this._onDidLogMessage.fire({ type: 'error', message: this.toMessage(message, watcher) });
	}

	private toMessage(message: string, watcher?: IParcelWatcherInstance): string {
		return watcher ? `[File Watcher (parcel)] ${message} (path: ${watcher.request.path})` : `[File Watcher (parcel)] ${message}`;
	}
}
