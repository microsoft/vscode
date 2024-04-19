/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as parcelWatcher from '@parcel/watcher';
import { existsSync, statSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { URI } from 'vs/base/common/uri';
import { DeferredPromise, RunOnceScheduler, RunOnceWorker, ThrottledWorker } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import { randomPath, isEqual, isEqualOrParent } from 'vs/base/common/extpath';
import { GLOBSTAR, patternsEquals } from 'vs/base/common/glob';
import { BaseWatcher } from 'vs/platform/files/node/watcher/baseWatcher';
import { TernarySearchTree } from 'vs/base/common/ternarySearchTree';
import { normalizeNFC } from 'vs/base/common/normalization';
import { dirname, normalize } from 'vs/base/common/path';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { realcaseSync, realpathSync } from 'vs/base/node/extpath';
import { NodeJSFileWatcherLibrary } from 'vs/platform/files/node/watcher/nodejs/nodejsWatcherLib';
import { FileChangeType, IFileChange } from 'vs/platform/files/common/files';
import { coalesceEvents, IRecursiveWatchRequest, parseWatcherPatterns, IRecursiveWatcherWithSubscribe, isFiltered } from 'vs/platform/files/common/watcher';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';

export class ParcelWatcherInstance extends Disposable {

	private readonly _onDidStop = this._register(new Emitter<{ joinRestart?: Promise<void> }>());
	readonly onDidStop = this._onDidStop.event;

	private readonly _onDidFail = this._register(new Emitter<void>());
	readonly onDidFail = this._onDidFail.event;

	private didFail = false;
	get failed(): boolean { return this.didFail; }

	private didStop = false;
	get stopped(): boolean { return this.didStop; }

	private readonly includes = this.request.includes ? parseWatcherPatterns(this.request.path, this.request.includes) : undefined;
	private readonly excludes = this.request.excludes ? parseWatcherPatterns(this.request.path, this.request.excludes) : undefined;

	private readonly subscriptions = new Map<string, Set<(change: IFileChange) => void>>();

	constructor(
		/**
		 * Signals when the watcher is ready to watch.
		 */
		readonly ready: Promise<unknown>,
		readonly request: IRecursiveWatchRequest,
		/**
		 * How often this watcher has been restarted in case of an unexpected
		 * shutdown.
		 */
		readonly restarts: number,
		/**
		 * The cancellation token associated with the lifecycle of the watcher.
		 */
		readonly token: CancellationToken,
		/**
		 * An event aggregator to coalesce events and reduce duplicates.
		 */
		readonly worker: RunOnceWorker<IFileChange>,
		private readonly stopFn: () => Promise<void>
	) {
		super();

		this._register(toDisposable(() => this.subscriptions.clear()));
	}

	subscribe(path: string, callback: (change: IFileChange) => void): IDisposable {
		path = URI.file(path).fsPath; // make sure to store the path in `fsPath` form to match it with events later

		let subscriptions = this.subscriptions.get(path);
		if (!subscriptions) {
			subscriptions = new Set();
			this.subscriptions.set(path, subscriptions);
		}

		subscriptions.add(callback);

		return toDisposable(() => {
			const subscriptions = this.subscriptions.get(path);
			if (subscriptions) {
				subscriptions.delete(callback);

				if (subscriptions.size === 0) {
					this.subscriptions.delete(path);
				}
			}
		});
	}

	get subscriptionsCount(): number {
		return this.subscriptions.size;
	}

	notifyFileChange(path: string, change: IFileChange): void {
		const subscriptions = this.subscriptions.get(path);
		if (subscriptions) {
			for (const subscription of subscriptions) {
				subscription(change);
			}
		}
	}

	notifyWatchFailed(): void {
		this.didFail = true;

		this._onDidFail.fire();
	}

	include(path: string): boolean {
		if (!this.includes || this.includes.length === 0) {
			return true; // no specific includes defined, include all
		}

		return this.includes.some(include => include(path));
	}

	exclude(path: string): boolean {
		return Boolean(this.excludes?.some(exclude => exclude(path)));
	}

	async stop(joinRestart: Promise<void> | undefined): Promise<void> {
		this.didStop = true;

		try {
			await this.stopFn();
		} finally {
			this._onDidStop.fire({ joinRestart });
			this.dispose();
		}
	}
}

export class ParcelWatcher extends BaseWatcher implements IRecursiveWatcherWithSubscribe {

	private static readonly MAP_PARCEL_WATCHER_ACTION_TO_FILE_CHANGE = new Map<parcelWatcher.EventType, number>(
		[
			['create', FileChangeType.ADDED],
			['update', FileChangeType.UPDATED],
			['delete', FileChangeType.DELETED]
		]
	);

	private static readonly PARCEL_WATCHER_BACKEND = isWindows ? 'windows' : isLinux ? 'inotify' : 'fs-events';

	private readonly _onDidError = this._register(new Emitter<string>());
	readonly onDidError = this._onDidError.event;

	readonly watchers = new Set<ParcelWatcherInstance>();

	// A delay for collecting file changes from Parcel
	// before collecting them for coalescing and emitting.
	// Parcel internally uses 50ms as delay, so we use 75ms,
	// to schedule sufficiently after Parcel.
	//
	// Note: since Parcel 2.0.7, the very first event is
	// emitted without delay if no events occured over a
	// duration of 500ms. But we always want to aggregate
	// events to apply our coleasing logic.
	//
	private static readonly FILE_CHANGES_HANDLER_DELAY = 75;

	// Reduce likelyhood of spam from file events via throttling.
	// (https://github.com/microsoft/vscode/issues/124723)
	private readonly throttledFileChangesEmitter = this._register(new ThrottledWorker<IFileChange>(
		{
			maxWorkChunkSize: 500,	// only process up to 500 changes at once before...
			throttleDelay: 200,	  	// ...resting for 200ms until we process events again...
			maxBufferedWork: 30000 	// ...but never buffering more than 30000 events in memory
		},
		events => this._onDidChangeFile.fire(events)
	));

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

	protected override async doWatch(requests: IRecursiveWatchRequest[]): Promise<void> {

		// Figure out duplicates to remove from the requests
		requests = this.removeDuplicateRequests(requests);

		// Figure out which watchers to start and which to stop
		const requestsToStart: IRecursiveWatchRequest[] = [];
		const watchersToStop = new Set(Array.from(this.watchers));
		for (const request of requests) {
			const watcher = this.findWatcher(request);
			if (watcher && patternsEquals(watcher.request.excludes, request.excludes) && patternsEquals(watcher.request.includes, request.includes) && watcher.request.pollingInterval === request.pollingInterval) {
				watchersToStop.delete(watcher); // keep watcher
			} else {
				requestsToStart.push(request); // start watching
			}
		}

		// Logging
		if (requestsToStart.length) {
			this.trace(`Request to start watching: ${requestsToStart.map(request => this.requestToString(request)).join(',')}`);
		}

		if (watchersToStop.size) {
			this.trace(`Request to stop watching: ${Array.from(watchersToStop).map(watcher => this.requestToString(watcher.request)).join(',')}`);
		}

		// Stop watching as instructed
		for (const watcher of watchersToStop) {
			await this.stopWatching(watcher);
		}

		// Start watching as instructed
		for (const request of requestsToStart) {
			if (request.pollingInterval) {
				this.startPolling(request, request.pollingInterval);
			} else {
				this.startWatching(request);
			}
		}
	}

	private findWatcher(request: IRecursiveWatchRequest): ParcelWatcherInstance | undefined {
		for (const watcher of this.watchers) {

			// Requests or watchers with correlation always match on that
			if (this.isCorrelated(request) || this.isCorrelated(watcher.request)) {
				if (watcher.request.correlationId === request.correlationId) {
					return watcher;
				}
			}

			// Non-correlated requests or watchers match on path
			else {
				if (isEqual(watcher.request.path, request.path, !isLinux /* ignorecase */)) {
					return watcher;
				}
			}
		}

		return undefined;
	}

	private startPolling(request: IRecursiveWatchRequest, pollingInterval: number, restarts = 0): void {
		const cts = new CancellationTokenSource();

		const instance = new DeferredPromise<void>();

		const snapshotFile = randomPath(tmpdir(), 'vscode-watcher-snapshot');

		// Remember as watcher instance
		const watcher: ParcelWatcherInstance = new ParcelWatcherInstance(
			instance.p,
			request,
			restarts,
			cts.token,
			new RunOnceWorker<IFileChange>(events => this.handleParcelEvents(events, watcher), ParcelWatcher.FILE_CHANGES_HANDLER_DELAY),
			async () => {
				cts.dispose(true);

				watcher.worker.flush();
				watcher.worker.dispose();

				pollingWatcher.dispose();
				unlinkSync(snapshotFile);
			}
		);
		this.watchers.add(watcher);

		// Path checks for symbolic links / wrong casing
		const { realPath, realPathDiffers, realPathLength } = this.normalizePath(request);

		this.trace(`Started watching: '${realPath}' with polling interval '${pollingInterval}'`);

		let counter = 0;

		const pollingWatcher = new RunOnceScheduler(async () => {
			counter++;

			if (cts.token.isCancellationRequested) {
				return;
			}

			// We already ran before, check for events since
			if (counter > 1) {
				const parcelEvents = await parcelWatcher.getEventsSince(realPath, snapshotFile, { ignore: request.excludes, backend: ParcelWatcher.PARCEL_WATCHER_BACKEND });

				if (cts.token.isCancellationRequested) {
					return;
				}

				// Handle & emit events
				this.onParcelEvents(parcelEvents, watcher, realPathDiffers, realPathLength);
			}

			// Store a snapshot of files to the snapshot file
			await parcelWatcher.writeSnapshot(realPath, snapshotFile, { ignore: request.excludes, backend: ParcelWatcher.PARCEL_WATCHER_BACKEND });

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
		const watcher: ParcelWatcherInstance = new ParcelWatcherInstance(
			instance.p,
			request,
			restarts,
			cts.token,
			new RunOnceWorker<IFileChange>(events => this.handleParcelEvents(events, watcher), ParcelWatcher.FILE_CHANGES_HANDLER_DELAY),
			async () => {
				cts.dispose(true);

				watcher.worker.flush();
				watcher.worker.dispose();

				const watcherInstance = await instance.p;
				await watcherInstance?.unsubscribe();
			}
		);
		this.watchers.add(watcher);

		// Path checks for symbolic links / wrong casing
		const { realPath, realPathDiffers, realPathLength } = this.normalizePath(request);

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
			this.onParcelEvents(parcelEvents, watcher, realPathDiffers, realPathLength);
		}, {
			backend: ParcelWatcher.PARCEL_WATCHER_BACKEND,
			ignore: watcher.request.excludes
		}).then(parcelWatcher => {
			this.trace(`Started watching: '${realPath}' with backend '${ParcelWatcher.PARCEL_WATCHER_BACKEND}'`);

			instance.complete(parcelWatcher);
		}).catch(error => {
			this.onUnexpectedError(error, watcher);

			instance.complete(undefined);

			watcher.notifyWatchFailed();
			this._onDidWatchFail.fire(request);
		});
	}

	private onParcelEvents(parcelEvents: parcelWatcher.Event[], watcher: ParcelWatcherInstance, realPathDiffers: boolean, realPathLength: number): void {
		if (parcelEvents.length === 0) {
			return;
		}

		// Normalize events: handle NFC normalization and symlinks
		// It is important to do this before checking for includes
		// to check on the original path.
		this.normalizeEvents(parcelEvents, watcher.request, realPathDiffers, realPathLength);

		// Check for includes
		const includedEvents = this.handleIncludes(watcher, parcelEvents);

		// Add to event aggregator for later processing
		for (const includedEvent of includedEvents) {
			watcher.worker.work(includedEvent);
		}
	}

	private handleIncludes(watcher: ParcelWatcherInstance, parcelEvents: parcelWatcher.Event[]): IFileChange[] {
		const events: IFileChange[] = [];

		for (const { path, type: parcelEventType } of parcelEvents) {
			const type = ParcelWatcher.MAP_PARCEL_WATCHER_ACTION_TO_FILE_CHANGE.get(parcelEventType)!;
			if (this.verboseLogging) {
				this.traceWithCorrelation(`${type === FileChangeType.ADDED ? '[ADDED]' : type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${path}`, watcher.request);
			}

			// Apply include filter if any
			if (!watcher.include(path)) {
				if (this.verboseLogging) {
					this.traceWithCorrelation(` >> ignored (not included) ${path}`, watcher.request);
				}
			} else {
				events.push({ type, resource: URI.file(path), cId: watcher.request.correlationId });
			}
		}

		return events;
	}

	private handleParcelEvents(parcelEvents: IFileChange[], watcher: ParcelWatcherInstance): void {

		// Coalesce events: merge events of same kind
		const coalescedEvents = coalesceEvents(parcelEvents);

		// Filter events: check for specific events we want to exclude
		const { events: filteredEvents, rootDeleted } = this.filterEvents(coalescedEvents, watcher);

		// Broadcast to clients
		this.emitEvents(filteredEvents, watcher);

		// Handle root path deletes
		if (rootDeleted) {
			this.onWatchedPathDeleted(watcher);
		}
	}

	private emitEvents(events: IFileChange[], watcher: ParcelWatcherInstance): void {
		if (events.length === 0) {
			return;
		}

		// Broadcast to clients via throttler
		const worked = this.throttledFileChangesEmitter.work(events);

		// Logging
		if (!worked) {
			this.warn(`started ignoring events due to too many file change events at once (incoming: ${events.length}, most recent change: ${events[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
		} else {
			if (this.throttledFileChangesEmitter.pending > 0) {
				this.trace(`started throttling events due to large amount of file change events at once (pending: ${this.throttledFileChangesEmitter.pending}, most recent change: ${events[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`, watcher);
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

	private normalizeEvents(events: parcelWatcher.Event[], request: IRecursiveWatchRequest, realPathDiffers: boolean, realPathLength: number): void {
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
		}
	}

	private filterEvents(events: IFileChange[], watcher: ParcelWatcherInstance): { events: IFileChange[]; rootDeleted?: boolean } {
		const filteredEvents: IFileChange[] = [];
		let rootDeleted = false;

		const filter = this.isCorrelated(watcher.request) ? watcher.request.filter : undefined; // TODO@bpasero filtering for now is only enabled when correlating because watchers are otherwise potentially reused
		for (const event of events) {

			// Emit to instance subscriptions if any before filtering
			if (watcher.subscriptionsCount > 0) {
				watcher.notifyFileChange(event.resource.fsPath, event);
			}

			// Filtering
			rootDeleted = event.type === FileChangeType.DELETED && isEqual(event.resource.fsPath, watcher.request.path, !isLinux);
			if (
				isFiltered(event, filter) ||
				// Explicitly exclude changes to root if we have any
				// to avoid VS Code closing all opened editors which
				// can happen e.g. in case of network connectivity
				// issues
				// (https://github.com/microsoft/vscode/issues/136673)
				//
				// Update 2024: with the new correlated events, we
				// really do not want to skip over file events any
				// more, so we only ignore this event for non-correlated
				// watch requests.
				(rootDeleted && !this.isCorrelated(watcher.request))
			) {
				if (this.verboseLogging) {
					this.traceWithCorrelation(` >> ignored (filtered) ${event.resource.fsPath}`, watcher.request);
				}

				continue;
			}

			// Logging
			this.traceEvent(event, watcher.request);

			filteredEvents.push(event);
		}

		return { events: filteredEvents, rootDeleted };
	}

	private onWatchedPathDeleted(watcher: ParcelWatcherInstance): void {
		this.warn('Watcher shutdown because watched path got deleted', watcher);

		let legacyMonitored = false;
		if (!this.isCorrelated(watcher.request)) {
			// Do monitoring of the request path parent unless this request
			// can be handled via suspend/resume in the super class
			legacyMonitored = this.legacyMonitorRequest(watcher);
		}

		if (!legacyMonitored) {
			watcher.notifyWatchFailed();
			this._onDidWatchFail.fire(watcher.request);
		}
	}

	private legacyMonitorRequest(watcher: ParcelWatcherInstance): boolean {
		const parentPath = dirname(watcher.request.path);
		if (existsSync(parentPath)) {
			this.trace('Trying to watch on the parent path to restart the watcher...', watcher);

			const nodeWatcher = new NodeJSFileWatcherLibrary({ path: parentPath, excludes: [], recursive: false, correlationId: watcher.request.correlationId }, undefined, changes => {
				if (watcher.token.isCancellationRequested) {
					return; // return early when disposed
				}

				// Watcher path came back! Restart watching...
				for (const { resource, type } of changes) {
					if (isEqual(resource.fsPath, watcher.request.path, !isLinux) && (type === FileChangeType.ADDED || type === FileChangeType.UPDATED)) {
						if (this.isPathValid(watcher.request.path)) {
							this.warn('Watcher restarts because watched path got created again', watcher);

							// Stop watching that parent folder
							nodeWatcher.dispose();

							// Restart the file watching
							this.restartWatching(watcher);

							break;
						}
					}
				}
			}, undefined, msg => this._onDidLogMessage.fire(msg), this.verboseLogging);

			// Make sure to stop watching when the watcher is disposed
			watcher.token.onCancellationRequested(() => nodeWatcher.dispose());

			return true;
		}

		return false;
	}

	private onUnexpectedError(error: unknown, watcher?: ParcelWatcherInstance): void {
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

	override async stop(): Promise<void> {
		await super.stop();

		for (const watcher of this.watchers) {
			await this.stopWatching(watcher);
		}
	}

	protected restartWatching(watcher: ParcelWatcherInstance, delay = 800): void {

		// Restart watcher delayed to accomodate for
		// changes on disk that have triggered the
		// need for a restart in the first place.
		const scheduler = new RunOnceScheduler(async () => {
			if (watcher.token.isCancellationRequested) {
				return; // return early when disposed
			}

			const restartPromise = new DeferredPromise<void>();
			try {

				// Await the watcher having stopped, as this is
				// needed to properly re-watch the same path
				await this.stopWatching(watcher, restartPromise.p);

				// Start watcher again counting the restarts
				if (watcher.request.pollingInterval) {
					this.startPolling(watcher.request, watcher.request.pollingInterval, watcher.restarts + 1);
				} else {
					this.startWatching(watcher.request, watcher.restarts + 1);
				}
			} finally {
				restartPromise.complete();
			}
		}, delay);

		scheduler.schedule();
		watcher.token.onCancellationRequested(() => scheduler.dispose());
	}

	private async stopWatching(watcher: ParcelWatcherInstance, joinRestart?: Promise<void>): Promise<void> {
		this.trace(`stopping file watcher`, watcher);

		this.watchers.delete(watcher);

		try {
			await watcher.stop(joinRestart);
		} catch (error) {
			this.error(`Unexpected error stopping watcher: ${toErrorMessage(error)}`, watcher);
		}
	}

	protected removeDuplicateRequests(requests: IRecursiveWatchRequest[], validatePaths = true): IRecursiveWatchRequest[] {

		// Sort requests by path length to have shortest first
		// to have a way to prevent children to be watched if
		// parents exist.
		requests.sort((requestA, requestB) => requestA.path.length - requestB.path.length);

		// Ignore requests for the same paths that have the same correlation
		const mapCorrelationtoRequests = new Map<number | undefined /* correlation */, Map<string, IRecursiveWatchRequest>>();
		for (const request of requests) {
			if (request.excludes.includes(GLOBSTAR)) {
				continue; // path is ignored entirely (via `**` glob exclude)
			}

			const path = isLinux ? request.path : request.path.toLowerCase(); // adjust for case sensitivity

			let requestsForCorrelation = mapCorrelationtoRequests.get(request.correlationId);
			if (!requestsForCorrelation) {
				requestsForCorrelation = new Map<string, IRecursiveWatchRequest>();
				mapCorrelationtoRequests.set(request.correlationId, requestsForCorrelation);
			}

			if (requestsForCorrelation.has(path)) {
				this.trace(`ignoring a request for watching who's path is already watched: ${this.requestToString(request)}`);
			}

			requestsForCorrelation.set(path, request);
		}

		const normalizedRequests: IRecursiveWatchRequest[] = [];

		for (const requestsForCorrelation of mapCorrelationtoRequests.values()) {

			// Only consider requests for watching that are not
			// a child of an existing request path to prevent
			// duplication. In addition, drop any request where
			// everything is excluded (via `**` glob).
			//
			// However, allow explicit requests to watch folders
			// that are symbolic links because the Parcel watcher
			// does not allow to recursively watch symbolic links.

			const requestTrie = TernarySearchTree.forPaths<IRecursiveWatchRequest>(!isLinux);

			for (const request of requestsForCorrelation.values()) {

				// Check for overlapping requests
				if (requestTrie.findSubstr(request.path)) {
					try {
						const realpath = realpathSync(request.path);
						if (realpath === request.path) {
							this.trace(`ignoring a request for watching who's parent is already watched: ${this.requestToString(request)}`);

							continue;
						}
					} catch (error) {
						this.trace(`ignoring a request for watching who's realpath failed to resolve: ${this.requestToString(request)} (error: ${error})`);

						this._onDidWatchFail.fire(request);

						continue;
					}
				}

				// Check for invalid paths
				if (validatePaths && !this.isPathValid(request.path)) {
					this._onDidWatchFail.fire(request);

					continue;
				}

				requestTrie.set(request.path, request);
			}

			normalizedRequests.push(...Array.from(requestTrie).map(([, request]) => request));
		}

		return normalizedRequests;
	}

	private isPathValid(path: string): boolean {
		try {
			const stat = statSync(path);
			if (!stat.isDirectory()) {
				this.trace(`ignoring a path for watching that is a file and not a folder: ${path}`);

				return false;
			}
		} catch (error) {
			this.trace(`ignoring a path for watching who's stat info failed to resolve: ${path} (error: ${error})`);

			return false;
		}

		return true;
	}

	subscribe(path: string, callback: (error: true | null, change?: IFileChange) => void): IDisposable | undefined {
		for (const watcher of this.watchers) {
			if (watcher.failed) {
				continue; // watcher has already failed
			}

			if (!isEqualOrParent(path, watcher.request.path, !isLinux)) {
				continue; // watcher does not consider this path
			}

			if (
				watcher.exclude(path) ||
				!watcher.include(path)
			) {
				continue; // parcel instance does not consider this path
			}

			const disposables = new DisposableStore();

			disposables.add(Event.once(watcher.onDidStop)(async e => {
				await e.joinRestart; // if we are restarting, await that so that we can possibly reuse this watcher again
				if (disposables.isDisposed) {
					return;
				}

				callback(true /* error */);
			}));
			disposables.add(Event.once(watcher.onDidFail)(() => callback(true /* error */)));
			disposables.add(watcher.subscribe(path, change => callback(null, change)));

			return disposables;
		}

		return undefined;
	}

	protected trace(message: string, watcher?: ParcelWatcherInstance): void {
		if (this.verboseLogging) {
			this._onDidLogMessage.fire({ type: 'trace', message: this.toMessage(message, watcher) });
		}
	}

	protected warn(message: string, watcher?: ParcelWatcherInstance) {
		this._onDidLogMessage.fire({ type: 'warn', message: this.toMessage(message, watcher) });
	}

	private error(message: string, watcher?: ParcelWatcherInstance) {
		this._onDidLogMessage.fire({ type: 'error', message: this.toMessage(message, watcher) });
	}

	private toMessage(message: string, watcher?: ParcelWatcherInstance): string {
		return watcher ? `[File Watcher (parcel)] ${message} (path: ${watcher.request.path})` : `[File Watcher (parcel)] ${message}`;
	}

	protected get recursiveWatcher() { return this; }
}
