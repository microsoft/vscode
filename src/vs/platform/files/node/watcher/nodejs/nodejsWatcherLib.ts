/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { watch } from 'fs';
import { ThrottledDelayer, ThrottledWorker } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { isEqualOrParent } from 'vs/base/common/extpath';
import { parse } from 'vs/base/common/glob';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { normalizeNFC } from 'vs/base/common/normalization';
import { basename, dirname, join } from 'vs/base/common/path';
import { isLinux, isMacintosh } from 'vs/base/common/platform';
import { realcase } from 'vs/base/node/extpath';
import { Promises } from 'vs/base/node/pfs';
import { FileChangeType } from 'vs/platform/files/common/files';
import { IDiskFileChange, ILogMessage, coalesceEvents, INonRecursiveWatchRequest } from 'vs/platform/files/common/watcher';

export class NodeJSFileWatcherLibrary extends Disposable {

	// A delay in reacting to file deletes to support
	// atomic save operations where a tool may chose
	// to delete a file before creating it again for
	// an update.
	private static readonly FILE_DELETE_HANDLER_DELAY = 100;

	// A delay for collecting file changes from node.js
	// before collecting them for coalescing and emitting
	// (same delay as Parcel is using)
	private static readonly FILE_CHANGES_HANDLER_DELAY = 50;

	// Reduce likelyhood of spam from file events via throttling.
	// These numbers are a bit more aggressive compared to the
	// recursive watcher because we can have many individual
	// node.js watchers per request.
	// (https://github.com/microsoft/vscode/issues/124723)
	private readonly throttledFileChangesWorker = new ThrottledWorker<IDiskFileChange>(
		{
			maxWorkChunkSize: 100,	// only process up to 100 changes at once before...
			throttleDelay: 200,	  	// ...resting for 200ms until we process events again...
			maxBufferedWork: 10000 	// ...but never buffering more than 10000 events in memory
		},
		events => this.onDidFilesChange(events)
	);

	private readonly fileChangesDelayer = this._register(new ThrottledDelayer<void>(NodeJSFileWatcherLibrary.FILE_CHANGES_HANDLER_DELAY));
	private fileChangesBuffer: IDiskFileChange[] = [];

	private readonly excludes = this.request.excludes.map(exclude => parse(exclude));
	private readonly includes = this.request.includes?.map(include => parse(include));

	private readonly cts = new CancellationTokenSource();

	readonly ready = this.watch();

	constructor(
		private request: INonRecursiveWatchRequest,
		private onDidFilesChange: (changes: IDiskFileChange[]) => void,
		private onLogMessage?: (msg: ILogMessage) => void,
		private verboseLogging?: boolean
	) {
		super();
	}

	private async watch(): Promise<void> {
		try {
			const realPath = await this.normalizePath(this.request);

			if (this.cts.token.isCancellationRequested) {
				return;
			}

			// Watch via node.js
			const stat = await Promises.stat(realPath);
			this._register(await this.doWatch(realPath, stat.isDirectory()));

		} catch (error) {
			if (error.code !== 'ENOENT') {
				this.error(error);
			} else {
				this.trace(error);
			}
		}
	}

	private async normalizePath(request: INonRecursiveWatchRequest): Promise<string> {
		let realPath = request.path;

		try {

			// First check for symbolic link
			realPath = await Promises.realpath(request.path);

			// Second check for casing difference
			// Note: this will be a no-op on Linux platforms
			if (request.path === realPath) {
				realPath = await realcase(request.path) ?? request.path;
			}

			// Correct watch path as needed
			if (request.path !== realPath) {
				this.warn(`correcting a path to watch that seems to be a symbolic link or wrong casing (original: ${request.path}, real: ${realPath})`);
			}
		} catch (error) {
			// ignore
		}

		return realPath;
	}

	private async doWatch(path: string, isDirectory: boolean): Promise<IDisposable> {

		// macOS: watching samba shares can crash VSCode so we do
		// a simple check for the file path pointing to /Volumes
		// (https://github.com/microsoft/vscode/issues/106879)
		// TODO@electron this needs a revisit when the crash is
		// fixed or mitigated upstream.
		if (isMacintosh && isEqualOrParent(path, '/Volumes/', true)) {
			this.error(`Refusing to watch ${path} for changes using fs.watch() for possibly being a network share where watching is unreliable and unstable.`);

			return Disposable.None;
		}

		const cts = new CancellationTokenSource(this.cts.token);

		let disposables = new DisposableStore();

		try {
			const pathBasename = basename(path);

			// Creating watcher can fail with an exception
			const watcher = watch(path);
			disposables.add(toDisposable(() => {
				watcher.removeAllListeners();
				watcher.close();
			}));

			this.trace(`Started watching: '${path}'`);

			// Folder: resolve children to emit proper events
			const folderChildren = new Set<string>();
			if (isDirectory) {
				try {
					for (const child of await Promises.readdir(path)) {
						folderChildren.add(child);
					}
				} catch (error) {
					this.error(error);
				}
			}

			const mapPathToStatDisposable = new Map<string, IDisposable>();
			disposables.add(toDisposable(() => {
				for (const [, disposable] of mapPathToStatDisposable) {
					disposable.dispose();
				}
				mapPathToStatDisposable.clear();
			}));

			watcher.on('error', (code: number, signal: string) => {
				this.error(`Failed to watch ${path} for changes using fs.watch() (${code}, ${signal})`);

				// The watcher is no longer functional reliably
				// so we go ahead and dispose it
				this.dispose();
			});

			watcher.on('change', (type, raw) => {
				if (cts.token.isCancellationRequested) {
					return; // ignore if already disposed
				}

				this.trace(`[raw] ["${type}"] ${raw}`);

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
							//
							// Same as with recursive watching, we do not
							// emit a delete event in this case.
							if (changedFileName === pathBasename && !await Promises.exists(path)) {
								this.warn('Watcher shutdown because watched path got deleted');

								// The watcher is no longer functional reliably
								// so we go ahead and dispose it
								this.dispose();

								return;
							}

							// In order to properly detect renames on a case-insensitive
							// file system, we need to use `existsChildStrictCase` helper
							// because otherwise we would wrongly assume a file exists
							// when it was renamed to same name but different case.
							const fileExists = await this.existsChildStrictCase(join(path, changedFileName));

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

							this.onFileChange({ path: join(this.request.path, changedFileName), type });
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

						this.onFileChange({ path: join(this.request.path, changedFileName), type });
					}
				}

				// File
				else {

					// File added/deleted
					if (type === 'rename' || changedFileName !== pathBasename) {

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
							const fileExists = await Promises.exists(path);

							if (cts.token.isCancellationRequested) {
								return; // ignore if disposed by now
							}

							// File still exists, so emit as change event and reapply the watcher
							if (fileExists) {
								this.onFileChange({ path: this.request.path, type: FileChangeType.UPDATED }, true /* skip excludes/includes (file is explicitly watched) */);

								disposables.add(await this.doWatch(path, false));
							}

							// File seems to be really gone, so emit a deleted event and dispose
							else {
								const eventPromise = this.onFileChange({ path: this.request.path, type: FileChangeType.DELETED }, true /* skip excludes/includes (file is explicitly watched) */);

								// Important to await the event delivery
								// before disposing the watcher, otherwise
								// we will loose this event.
								await eventPromise;
								this.dispose();
							}
						}, NodeJSFileWatcherLibrary.FILE_DELETE_HANDLER_DELAY);

						// Very important to dispose the watcher which now points to a stale inode
						// and wire in a new disposable that tracks our timeout that is installed
						disposables.clear();
						disposables.add(toDisposable(() => clearTimeout(timeoutHandle)));
					}

					// File changed
					else {
						this.onFileChange({ path: this.request.path, type: FileChangeType.UPDATED }, true /* skip excludes/includes (file is explicitly watched) */);
					}
				}
			});
		} catch (error) {
			if (await Promises.exists(path) && !cts.token.isCancellationRequested) {
				this.error(`Failed to watch ${path} for changes using fs.watch() (${error.toString()})`);
			}
		}

		return toDisposable(() => {
			cts.dispose(true);
			disposables.dispose();
		});
	}

	private async onFileChange(event: IDiskFileChange, skipIncludeExcludeChecks = false): Promise<void> {
		if (this.cts.token.isCancellationRequested) {
			return;
		}

		// Logging
		if (this.verboseLogging) {
			this.trace(`${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.path}`);
		}

		// Add to buffer unless excluded or not included (not if explicitly disabled)
		if (!skipIncludeExcludeChecks && this.excludes.some(exclude => exclude(event.path))) {
			if (this.verboseLogging) {
				this.trace(` >> ignored (excluded) ${event.path}`);
			}
		} else if (!skipIncludeExcludeChecks && this.includes && this.includes.length > 0 && !this.includes.some(include => include(event.path))) {
			if (this.verboseLogging) {
				this.trace(` >> ignored (not included) ${event.path}`);
			}
		} else {
			this.fileChangesBuffer.push(event);
		}

		// Handle emit through delayer to accommodate for bulk changes and thus reduce spam
		try {
			await this.fileChangesDelayer.trigger(async () => {
				const fileChanges = this.fileChangesBuffer;
				this.fileChangesBuffer = [];

				// Coalesce events: merge events of same kind
				const coalescedFileChanges = coalesceEvents(fileChanges);

				if (coalescedFileChanges.length > 0) {

					// Logging
					if (this.verboseLogging) {
						for (const event of coalescedFileChanges) {
							this.trace(`>> normalized ${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.path}`);
						}
					}

					// Broadcast to clients via throttler
					const worked = this.throttledFileChangesWorker.work(coalescedFileChanges);

					// Logging
					if (!worked) {
						this.warn(`started ignoring events due to too many file change events at once (incoming: ${coalescedFileChanges.length}, most recent change: ${coalescedFileChanges[0].path}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
					} else {
						if (this.throttledFileChangesWorker.pending > 0) {
							this.trace(`started throttling events due to large amount of file change events at once (pending: ${this.throttledFileChangesWorker.pending}, most recent change: ${coalescedFileChanges[0].path}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
						}
					}
				}
			});
		} catch (error) {
			// ignore (we are likely disposed and cancelled)
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

	override dispose(): void {
		this.trace(`stopping file watcher on ${this.request.path}`);

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
	const watcher = new NodeJSFileWatcherLibrary(request, changes => {
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
