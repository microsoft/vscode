/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { watch } from 'fs';
import { ThrottledDelayer } from 'vs/base/common/async';
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
import { IDiskFileChange, ILogMessage, coalesceEvents, IWatchRequest, INonRecursiveWatcher } from 'vs/platform/files/common/watcher';

export class NodeJSFileWatcher extends Disposable implements INonRecursiveWatcher {

	// A delay in reacting to file deletes to support
	// atomic save operations where a tool may chose
	// to delete a file before creating it again for
	// an update.
	private static readonly FILE_DELETE_HANDLER_DELAY = 25;

	// A delay for collecting file changes from node.js
	// before collecting them for coalescing and emitting
	// (same delay as Parcel is using)
	private static readonly FILE_CHANGES_HANDLER_DELAY = 50;

	private readonly fileChangesDelayer = this._register(new ThrottledDelayer<void>(NodeJSFileWatcher.FILE_CHANGES_HANDLER_DELAY));
	private fileChangesBuffer: IDiskFileChange[] = [];

	private readonly excludes = this.request.excludes.map(exclude => parse(exclude));

	private readonly cts = new CancellationTokenSource();

	readonly ready = this.watch();

	constructor(
		private request: IWatchRequest,
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

			this.trace(`Request to start watching: ${realPath} (excludes: ${this.request.excludes}))}`);

			// Watch via node.js
			const stat = await Promises.stat(realPath);
			this._register(await this.doWatch(realPath, stat.isDirectory()));

		} catch (error) {
			if (error.code !== 'ENOENT') {
				this.error(error);
			}
		}
	}

	private async normalizePath(request: IWatchRequest): Promise<string> {
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
		if (isMacintosh && isEqualOrParent(path, '/Volumes/')) {
			this.error(`Refusing to watch ${path} for changes using fs.watch() for possibly being a network share where watching is unreliable and unstable.`);

			return Disposable.None;
		}

		const cts = new CancellationTokenSource(this.cts.token);

		let disposables = new DisposableStore();

		try {

			// Creating watcher can fail with an exception
			const watcher = watch(path);
			disposables.add(toDisposable(() => {
				watcher.removeAllListeners();
				watcher.close();
			}));

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
			});

			watcher.on('change', (type, raw) => {
				if (cts.token.isCancellationRequested) {
					return; // ignore if already disposed
				}

				this.trace(`["${type}"] ${raw} (fs.watch() raw event)`);

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

				// File
				if (!isDirectory) {
					if (type === 'rename' || changedFileName !== basename(path)) {

						// The file was either deleted or renamed. Many tools apply changes to files in an
						// atomic way ("Atomic Save") by first renaming the file to a temporary name and then
						// renaming it back to the original name. Our watcher will detect this as a rename
						// and then stops to work on Mac and Linux because the watcher is applied to the
						// inode and not the name. The fix is to detect this case and trying to watch the file
						// again after a certain delay.
						// In addition, we send out a delete event if after a timeout we detect that the file
						// does indeed not exist anymore.

						const timeoutHandle = setTimeout(async () => {
							const fileExists = await Promises.exists(path);

							if (cts.token.isCancellationRequested) {
								return; // ignore if disposed by now
							}

							// File still exists, so emit as change event and reapply the watcher
							if (fileExists) {
								this.onFileChange({ path: this.request.path, type: FileChangeType.UPDATED });

								disposables.add(await this.doWatch(path, false));
							}

							// File seems to be really gone, so emit a deleted event
							else {
								this.onFileChange({ path: this.request.path, type: FileChangeType.DELETED });
							}
						}, NodeJSFileWatcher.FILE_DELETE_HANDLER_DELAY);

						// Very important to dispose the watcher which now points to a stale inode
						// and wire in a new disposable that tracks our timeout that is installed
						disposables.clear();
						disposables.add(toDisposable(() => clearTimeout(timeoutHandle)));
					} else {
						this.onFileChange({ path: this.request.path, type: FileChangeType.UPDATED });
					}
				}

				// Folder
				else {

					// Children add/delete
					if (type === 'rename') {

						// Cancel any previous stats for this file if existing
						mapPathToStatDisposable.get(changedFileName)?.dispose();

						// Wait a bit and try see if the file still exists on disk
						// to decide on the resulting event
						const timeoutHandle = setTimeout(async () => {
							mapPathToStatDisposable.delete(changedFileName);

							// fs.watch() does not really help us figuring out
							// if the root folder got deleted. As such we have
							// to check if our watched path still exists and
							// handle that accordingly.
							//
							// We do not re-attach the watcher after timeout
							// though as we do for file watches because for
							// file watching specifically we want to handle
							// the atomic-write cases.
							if (!await Promises.exists(path)) {
								this.onFileChange({ path: this.request.path, type: FileChangeType.DELETED });
							}

							else {

								// In order to properly detect renames on a case-insensitive
								// file system, we need to use `existsChildStrictCase` helper
								// because otherwise we would wrongly assume a file exists
								// when it was renamed in the old form.
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
							}
						}, NodeJSFileWatcher.FILE_DELETE_HANDLER_DELAY);

						mapPathToStatDisposable.set(changedFileName, toDisposable(() => clearTimeout(timeoutHandle)));
					}

					// Other events
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

	private onFileChange(event: IDiskFileChange): void {
		if (this.cts.token.isCancellationRequested) {
			return;
		}

		// Logging
		if (this.verboseLogging) {
			this.trace(`${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.path}`);
		}

		// Add to buffer unless ignored
		if (this.excludes.some(exclude => exclude(event.path))) {
			if (this.verboseLogging) {
				this.trace(` >> ignored ${event.path}`);
			}
		} else {
			this.fileChangesBuffer.push(event);
		}

		// Handle emit through delayer to accommodate for bulk changes and thus reduce spam
		this.fileChangesDelayer.trigger(async () => {
			const fileChanges = this.fileChangesBuffer;
			this.fileChangesBuffer = [];

			// Coalesce events: merge events of same kind
			const coalescedFileChanges = coalesceEvents(fileChanges);

			// Logging
			if (this.verboseLogging) {
				for (const event of coalescedFileChanges) {
					this.trace(`>> normalized ${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.path}`);
				}
			}

			// Broadcast to clients
			if (coalescedFileChanges.length > 0) {
				this.onDidFilesChange(coalescedFileChanges);
			}
		}).catch(() => {
			// ignore (we are likely disposed and cancelled)
		});
	}

	private async existsChildStrictCase(path: string): Promise<boolean> {
		if (isLinux) {
			return await Promises.exists(path);
		}

		try {
			const children = await Promises.readdir(dirname(path));
			return children.some(child => child === basename(path));
		} catch {
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
		this.cts.dispose(true);

		super.dispose();
	}
}

/**
 * Watch the provided `path` for changes and return
 * the data in chunks of `Uint8Array` for further use.
 */
export async function watchFileContents(path: string, onData: (chunk: Uint8Array) => void, token: CancellationToken, bufferSize = 512): Promise<void> {
	const handle = await Promises.open(path, 'r');
	const buffer = Buffer.allocUnsafe(bufferSize);

	const cts = new CancellationTokenSource(token);

	let error: Error | undefined = undefined;
	let isReading = false;

	const request: IWatchRequest = { path, excludes: [] };
	const watcher = new NodeJSFileWatcher(request, changes => {
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
