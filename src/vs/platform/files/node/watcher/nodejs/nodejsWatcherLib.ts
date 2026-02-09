/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { watch, promises } from 'fs';
import { RunOnceWorker, ThrottledWorker } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isEqual, isEqualOrParent } from '../../../../../base/common/extpath.js';
import { Disposable, DisposableStore, IDisposable, thenRegisterOrDispose, toDisposable } from '../../../../../base/common/lifecycle.js';
import { normalizeNFC } from '../../../../../base/common/normalization.js';
import { basename, dirname, join } from '../../../../../base/common/path.js';
import { isLinux, isMacintosh } from '../../../../../base/common/platform.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Promises } from '../../../../../base/node/pfs.js';
import { FileChangeFilter, FileChangeType, IFileChange } from '../../../common/files.js';
import { ILogMessage, coalesceEvents, INonRecursiveWatchRequest, parseWatcherPatterns, IRecursiveWatcherWithSubscribe, isFiltered, isWatchRequestWithCorrelation } from '../../../common/watcher.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { ParsedPattern } from '../../../../../base/common/glob.js';

export class NodeJSFileWatcherLibrary extends Disposable {

	// A delay in reacting to file deletes to support
	// atomic save operations where a tool may chose
	// to delete a file before creating it again for
	// an update.
	private static readonly FILE_DELETE_HANDLER_DELAY = 100;

	// A delay for collecting file changes from node.js
	// before collecting them for coalescing and emitting
	// Same delay as used for the recursive watcher.
	private static readonly FILE_CHANGES_HANDLER_DELAY = 75;

	// Reduce likelyhood of spam from file events via throttling.
	// These numbers are a bit more aggressive compared to the
	// recursive watcher because we can have many individual
	// node.js watchers per request.
	// (https://github.com/microsoft/vscode/issues/124723)
	private readonly throttledFileChangesEmitter = this._register(new ThrottledWorker<IFileChange>(
		{
			maxWorkChunkSize: 100,	// only process up to 100 changes at once before...
			throttleDelay: 200,	  	// ...resting for 200ms until we process events again...
			maxBufferedWork: 10000 	// ...but never buffering more than 10000 events in memory
		},
		events => this.onDidFilesChange(events)
	));

	// Aggregate file changes over FILE_CHANGES_HANDLER_DELAY
	// to coalesce events and reduce spam.
	private readonly fileChangesAggregator = this._register(new RunOnceWorker<IFileChange>(events => this.handleFileChanges(events), NodeJSFileWatcherLibrary.FILE_CHANGES_HANDLER_DELAY));

	private readonly excludes: ParsedPattern[];
	private readonly includes: ParsedPattern[] | undefined;
	private readonly filter: FileChangeFilter | undefined;

	private readonly cts = new CancellationTokenSource();

	private readonly realPath = new Lazy(async () => {

		// This property is intentionally `Lazy` and not using `realcase()` as the counterpart
		// in the recursive watcher because of the amount of paths this watcher is dealing with.
		// We try as much as possible to avoid even needing `realpath()` if we can because even
		// that method does an `lstat()` per segment of the path.

		let result = this.request.path;

		try {
			result = await Promises.realpath(this.request.path);

			if (this.request.path !== result) {
				this.trace(`correcting a path to watch that seems to be a symbolic link (original: ${this.request.path}, real: ${result})`);
			}
		} catch (error) {
			// ignore
		}

		return result;
	});

	readonly ready: Promise<void>;

	private _isReusingRecursiveWatcher = false;
	get isReusingRecursiveWatcher(): boolean { return this._isReusingRecursiveWatcher; }

	private didFail = false;
	get failed(): boolean { return this.didFail; }

	constructor(
		private readonly request: INonRecursiveWatchRequest,
		private readonly recursiveWatcher: IRecursiveWatcherWithSubscribe | undefined,
		private readonly onDidFilesChange: (changes: IFileChange[]) => void,
		private readonly onDidWatchFail?: () => void,
		private readonly onLogMessage?: (msg: ILogMessage) => void,
		private verboseLogging?: boolean
	) {
		super();

		const ignoreCase = !isLinux;
		this.excludes = parseWatcherPatterns(this.request.path, this.request.excludes, ignoreCase);
		this.includes = this.request.includes ? parseWatcherPatterns(this.request.path, this.request.includes, ignoreCase) : undefined;
		this.filter = isWatchRequestWithCorrelation(this.request) ? this.request.filter : undefined; // filtering is only enabled when correlating because watchers are otherwise potentially reused

		this.ready = this.watch();
	}

	private async watch(): Promise<void> {
		try {
			const stat = await promises.stat(this.request.path);

			if (this.cts.token.isCancellationRequested) {
				return;
			}

			this._register(await this.doWatch(stat.isDirectory()));
		} catch (error) {
			if (error.code !== 'ENOENT') {
				this.error(error);
			} else {
				this.trace(`ignoring a path for watching who's stat info failed to resolve: ${this.request.path} (error: ${error})`);
			}

			this.notifyWatchFailed();
		}
	}

	private notifyWatchFailed(): void {
		this.didFail = true;

		this.onDidWatchFail?.();
	}

	private async doWatch(isDirectory: boolean): Promise<IDisposable> {
		const disposables = new DisposableStore();

		if (this.doWatchWithExistingWatcher(isDirectory, disposables)) {
			this.trace(`reusing an existing recursive watcher for ${this.request.path}`);
			this._isReusingRecursiveWatcher = true;
		} else {
			this._isReusingRecursiveWatcher = false;
			await this.doWatchWithNodeJS(isDirectory, disposables);
		}

		return disposables;
	}

	private doWatchWithExistingWatcher(isDirectory: boolean, disposables: DisposableStore): boolean {
		if (isDirectory) {
			// Recursive watcher re-use is currently not enabled for when
			// folders are watched. this is because the dispatching in the
			// recursive watcher for non-recurive requests is optimized for
			// file changes  where we really only match on the exact path
			// and not child paths.
			return false;
		}

		const resource = URI.file(this.request.path);
		const subscription = this.recursiveWatcher?.subscribe(this.request.path, async (error, change) => {
			if (disposables.isDisposed) {
				return; // return early if already disposed
			}

			if (error) {
				await thenRegisterOrDispose(this.doWatch(isDirectory), disposables);
			} else if (change) {
				if (typeof change.cId === 'number' || typeof this.request.correlationId === 'number') {
					// Re-emit this change with the correlation id of the request
					// so that the client can correlate the event with the request
					// properly. Without correlation, we do not have to do that
					// because the event will appear on the global listener already.
					this.onFileChange({ resource, type: change.type, cId: this.request.correlationId }, true /* skip excludes/includes (file is explicitly watched) */);
				}
			}
		});

		if (subscription) {
			disposables.add(subscription);

			return true;
		}

		return false;
	}

	private async doWatchWithNodeJS(isDirectory: boolean, disposables: DisposableStore): Promise<void> {
		const realPath = await this.realPath.value;

		if (this.cts.token.isCancellationRequested) {
			return;
		}

		// macOS: watching samba shares can crash VSCode so we do
		// a simple check for the file path pointing to /Volumes
		// (https://github.com/microsoft/vscode/issues/106879)
		// TODO@electron this needs a revisit when the crash is
		// fixed or mitigated upstream.
		if (isMacintosh && isEqualOrParent(realPath, '/Volumes/', true)) {
			this.error(`Refusing to watch ${realPath} for changes using fs.watch() for possibly being a network share where watching is unreliable and unstable.`);

			return;
		}

		const cts = new CancellationTokenSource(this.cts.token);
		disposables.add(toDisposable(() => cts.dispose(true)));

		const watcherDisposables = new DisposableStore(); // we need a separate disposable store because we re-create the watcher from within in some cases
		disposables.add(watcherDisposables);

		try {
			const requestResource = URI.file(this.request.path);
			const pathBasename = basename(realPath);

			// Creating watcher can fail with an exception
			const watcher = watch(realPath);
			watcherDisposables.add(toDisposable(() => {
				watcher.removeAllListeners();
				watcher.close();
			}));

			this.trace(`Started watching: '${realPath}'`);

			// Folder: resolve children to emit proper events
			const folderChildren = new Set<string>();
			if (isDirectory) {
				try {
					for (const child of await Promises.readdir(realPath)) {
						folderChildren.add(child);
					}
				} catch (error) {
					this.error(error);
				}
			}

			if (cts.token.isCancellationRequested) {
				return;
			}

			const mapPathToStatDisposable = new Map<string, IDisposable>();
			watcherDisposables.add(toDisposable(() => {
				for (const [, disposable] of mapPathToStatDisposable) {
					disposable.dispose();
				}
				mapPathToStatDisposable.clear();
			}));

			watcher.on('error', (code: number, signal: string) => {
				if (cts.token.isCancellationRequested) {
					return;
				}

				this.error(`Failed to watch ${realPath} for changes using fs.watch() (${code}, ${signal})`);

				this.notifyWatchFailed();
			});

			watcher.on('change', (type, raw) => {
				if (cts.token.isCancellationRequested) {
					return; // ignore if already disposed
				}

				if (this.verboseLogging) {
					this.traceWithCorrelation(`[raw] ["${type}"] ${raw}`);
				}

				// Normalize file name
				let changedFileName = '';
				if (raw) { // https://github.com/microsoft/vscode/issues/38191
					changedFileName = raw.toString();
					if (isMacintosh) {
						// Mac: uses NFD unicode form on disk, but we want NFC
						// See also https://github.com/nodejs/node/issues/2165
						changedFileName = normalizeNFC(changedFileName);
					}
				}

				if (!changedFileName || (type !== 'change' && type !== 'rename')) {
					return; // ignore unexpected events
				}

				// Folder
				if (isDirectory) {

					// Folder child added/deleted
					if (type === 'rename') {

						// Cancel any previous stats for this file if existing
						mapPathToStatDisposable.get(changedFileName)?.dispose();

						// Wait a bit and try see if the file still exists on disk
						// to decide on the resulting event
						const timeoutHandle = setTimeout(async () => {
							mapPathToStatDisposable.delete(changedFileName);

							// Depending on the OS the watcher runs on, there
							// is different behaviour for when the watched
							// folder path is being deleted:
							//
							// -   macOS: not reported but events continue to
							//            work even when the folder is brought
							//            back, though it seems every change
							//            to a file is reported as "rename"
							// -   Linux: "rename" event is reported with the
							//            name of the folder and events stop
							//            working
							// - Windows: an EPERM error is thrown that we
							//            handle from the `on('error')` event
							//
							// We do not re-attach the watcher after timeout
							// though as we do for file watches because for
							// file watching specifically we want to handle
							// the atomic-write cases where the file is being
							// deleted and recreated with different contents.
							if (isEqual(changedFileName, pathBasename, !isLinux) && !await Promises.exists(realPath)) {
								this.onWatchedPathDeleted(requestResource);

								return;
							}

							if (cts.token.isCancellationRequested) {
								return;
							}

							// In order to properly detect renames on a case-insensitive
							// file system, we need to use `existsChildStrictCase` helper
							// because otherwise we would wrongly assume a file exists
							// when it was renamed to same name but different case.
							const fileExists = await this.existsChildStrictCase(join(realPath, changedFileName));

							if (cts.token.isCancellationRequested) {
								return; // ignore if disposed by now
							}

							// Figure out the correct event type:
							// File Exists: either 'added' or 'updated' if known before
							// File Does not Exist: always 'deleted'
							let type: FileChangeType;
							if (fileExists) {
								if (folderChildren.has(changedFileName)) {
									type = FileChangeType.UPDATED;
								} else {
									type = FileChangeType.ADDED;
									folderChildren.add(changedFileName);
								}
							} else {
								folderChildren.delete(changedFileName);
								type = FileChangeType.DELETED;
							}

							this.onFileChange({ resource: joinPath(requestResource, changedFileName), type, cId: this.request.correlationId });
						}, NodeJSFileWatcherLibrary.FILE_DELETE_HANDLER_DELAY);

						mapPathToStatDisposable.set(changedFileName, toDisposable(() => clearTimeout(timeoutHandle)));
					}

					// Folder child changed
					else {

						// Figure out the correct event type: if this is the
						// first time we see this child, it can only be added
						let type: FileChangeType;
						if (folderChildren.has(changedFileName)) {
							type = FileChangeType.UPDATED;
						} else {
							type = FileChangeType.ADDED;
							folderChildren.add(changedFileName);
						}

						this.onFileChange({ resource: joinPath(requestResource, changedFileName), type, cId: this.request.correlationId });
					}
				}

				// File
				else {

					// File added/deleted
					if (type === 'rename' || !isEqual(changedFileName, pathBasename, !isLinux)) {

						// Depending on the OS the watcher runs on, there
						// is different behaviour for when the watched
						// file path is being deleted:
						//
						// -   macOS: "rename" event is reported and events
						//            stop working
						// -   Linux: "rename" event is reported and events
						//            stop working
						// - Windows: "rename" event is reported and events
						//            continue to work when file is restored
						//
						// As opposed to folder watching, we re-attach the
						// watcher after brief timeout to support "atomic save"
						// operations where a tool may decide to delete a file
						// and then create it with the updated contents.
						//
						// Different to folder watching, we emit a delete event
						// though we never detect when the file is brought back
						// because the watcher is disposed then.

						const timeoutHandle = setTimeout(async () => {
							const fileExists = await Promises.exists(realPath);

							if (cts.token.isCancellationRequested) {
								return; // ignore if disposed by now
							}

							// File still exists, so emit as change event and reapply the watcher
							if (fileExists) {
								this.onFileChange({ resource: requestResource, type: FileChangeType.UPDATED, cId: this.request.correlationId }, true /* skip excludes/includes (file is explicitly watched) */);

								watcherDisposables.add(await this.doWatch(false));
							}

							// File seems to be really gone, so emit a deleted and failed event
							else {
								this.onWatchedPathDeleted(requestResource);
							}
						}, NodeJSFileWatcherLibrary.FILE_DELETE_HANDLER_DELAY);

						// Very important to dispose the watcher which now points to a stale inode
						// and wire in a new disposable that tracks our timeout that is installed
						watcherDisposables.clear();
						watcherDisposables.add(toDisposable(() => clearTimeout(timeoutHandle)));
					}

					// File changed
					else {
						this.onFileChange({ resource: requestResource, type: FileChangeType.UPDATED, cId: this.request.correlationId }, true /* skip excludes/includes (file is explicitly watched) */);
					}
				}
			});
		} catch (error) {
			if (cts.token.isCancellationRequested) {
				return;
			}

			this.error(`Failed to watch ${realPath} for changes using fs.watch() (${error.toString()})`);

			this.notifyWatchFailed();
		}
	}

	private onWatchedPathDeleted(resource: URI): void {
		this.warn('Watcher shutdown because watched path got deleted');

		// Emit events and flush in case the watcher gets disposed
		this.onFileChange({ resource, type: FileChangeType.DELETED, cId: this.request.correlationId }, true /* skip excludes/includes (file is explicitly watched) */);
		this.fileChangesAggregator.flush();

		this.notifyWatchFailed();
	}

	private onFileChange(event: IFileChange, skipIncludeExcludeChecks = false): void {
		if (this.cts.token.isCancellationRequested) {
			return;
		}

		// Logging
		if (this.verboseLogging) {
			this.traceWithCorrelation(`${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.resource.fsPath}`);
		}

		// Add to aggregator unless excluded or not included (not if explicitly disabled)
		if (!skipIncludeExcludeChecks && this.excludes.some(exclude => exclude(event.resource.fsPath))) {
			if (this.verboseLogging) {
				this.traceWithCorrelation(` >> ignored (excluded) ${event.resource.fsPath}`);
			}
		} else if (!skipIncludeExcludeChecks && this.includes && this.includes.length > 0 && !this.includes.some(include => include(event.resource.fsPath))) {
			if (this.verboseLogging) {
				this.traceWithCorrelation(` >> ignored (not included) ${event.resource.fsPath}`);
			}
		} else {
			this.fileChangesAggregator.work(event);
		}
	}

	private handleFileChanges(fileChanges: IFileChange[]): void {

		// Coalesce events: merge events of same kind
		const coalescedFileChanges = coalesceEvents(fileChanges);

		// Filter events: based on request filter property
		const filteredEvents: IFileChange[] = [];
		for (const event of coalescedFileChanges) {
			if (isFiltered(event, this.filter)) {
				if (this.verboseLogging) {
					this.traceWithCorrelation(` >> ignored (filtered) ${event.resource.fsPath}`);
				}

				continue;
			}

			filteredEvents.push(event);
		}

		if (filteredEvents.length === 0) {
			return;
		}

		// Logging
		if (this.verboseLogging) {
			for (const event of filteredEvents) {
				this.traceWithCorrelation(` >> normalized ${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.resource.fsPath}`);
			}
		}

		// Broadcast to clients via throttled emitter
		const worked = this.throttledFileChangesEmitter.work(filteredEvents);

		// Logging
		if (!worked) {
			this.warn(`started ignoring events due to too many file change events at once (incoming: ${filteredEvents.length}, most recent change: ${filteredEvents[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
		} else {
			if (this.throttledFileChangesEmitter.pending > 0) {
				this.trace(`started throttling events due to large amount of file change events at once (pending: ${this.throttledFileChangesEmitter.pending}, most recent change: ${filteredEvents[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
			}
		}
	}

	private async existsChildStrictCase(path: string): Promise<boolean> {
		if (isLinux) {
			return Promises.exists(path);
		}

		try {
			const pathBasename = basename(path);
			const children = await Promises.readdir(dirname(path));

			return children.some(child => child === pathBasename);
		} catch (error) {
			this.trace(error);

			return false;
		}
	}

	setVerboseLogging(verboseLogging: boolean): void {
		this.verboseLogging = verboseLogging;
	}

	private error(error: string): void {
		if (!this.cts.token.isCancellationRequested) {
			this.onLogMessage?.({ type: 'error', message: `[File Watcher (node.js)] ${error}` });
		}
	}

	private warn(message: string): void {
		if (!this.cts.token.isCancellationRequested) {
			this.onLogMessage?.({ type: 'warn', message: `[File Watcher (node.js)] ${message}` });
		}
	}

	private trace(message: string): void {
		if (!this.cts.token.isCancellationRequested && this.verboseLogging) {
			this.onLogMessage?.({ type: 'trace', message: `[File Watcher (node.js)] ${message}` });
		}
	}

	private traceWithCorrelation(message: string): void {
		if (!this.cts.token.isCancellationRequested && this.verboseLogging) {
			this.trace(`${message}${typeof this.request.correlationId === 'number' ? ` <${this.request.correlationId}> ` : ``}`);
		}
	}

	override dispose(): void {
		this.cts.dispose(true);

		super.dispose();
	}
}

/**
 * Watch the provided `path` for changes and return
 * the data in chunks of `Uint8Array` for further use.
 */
export async function watchFileContents(path: string, onData: (chunk: Uint8Array) => void, onReady: () => void, token: CancellationToken, bufferSize = 512): Promise<void> {
	const handle = await Promises.open(path, 'r');
	const buffer = Buffer.allocUnsafe(bufferSize);

	const cts = new CancellationTokenSource(token);

	let error: Error | undefined = undefined;
	let isReading = false;

	const request: INonRecursiveWatchRequest = { path, excludes: [], recursive: false };
	const watcher = new NodeJSFileWatcherLibrary(request, undefined, changes => {
		(async () => {
			for (const { type } of changes) {
				if (type === FileChangeType.UPDATED) {

					if (isReading) {
						return; // return early if we are already reading the output
					}

					isReading = true;

					try {
						// Consume the new contents of the file until finished
						// everytime there is a change event signalling a change
						while (!cts.token.isCancellationRequested) {
							const { bytesRead } = await Promises.read(handle, buffer, 0, bufferSize, null);
							if (!bytesRead || cts.token.isCancellationRequested) {
								break;
							}

							onData(buffer.slice(0, bytesRead));
						}
					} catch (err) {
						error = new Error(err);
						cts.dispose(true);
					} finally {
						isReading = false;
					}
				}
			}
		})();
	});

	await watcher.ready;
	onReady();

	return new Promise<void>((resolve, reject) => {
		cts.token.onCancellationRequested(async () => {
			watcher.dispose();

			try {
				await Promises.close(handle);
			} catch (err) {
				error = new Error(err);
			}

			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
}
