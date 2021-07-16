/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nsfw from 'nsfw';
import { ParsedPattern, parse } from 'vs/base/common/glob';
import { join } from 'vs/base/common/path';
import { isMacintosh } from 'vs/base/common/platform';
import { isEqualOrParent } from 'vs/base/common/extpath';
import { IDiskFileChange, normalizeFileChanges, ILogMessage } from 'vs/platform/files/node/watcher/watcher';
import { IWatcherService, IWatcherRequest } from 'vs/platform/files/node/watcher/nsfw/watcher';
import { ThrottledDelayer } from 'vs/base/common/async';
import { FileChangeType } from 'vs/platform/files/common/files';
import { normalizeNFC } from 'vs/base/common/normalization';
import { Emitter } from 'vs/base/common/event';
import { realcaseSync, realpathSync } from 'vs/base/node/extpath';
import { Disposable } from 'vs/base/common/lifecycle';

const nsfwActionToRawChangeType: { [key: number]: number } = [];
nsfwActionToRawChangeType[nsfw.actions.CREATED] = FileChangeType.ADDED;
nsfwActionToRawChangeType[nsfw.actions.MODIFIED] = FileChangeType.UPDATED;
nsfwActionToRawChangeType[nsfw.actions.DELETED] = FileChangeType.DELETED;

interface IWatcher {
	start(): void;
	stop(): void;
}

interface IPathWatcher {
	readonly ready: Promise<IWatcher>;
	watcher?: IWatcher;
	ignored: ParsedPattern[];
}

export class NsfwWatcherService extends Disposable implements IWatcherService {

	private static readonly FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)

	private readonly _onDidChangeFile = this._register(new Emitter<IDiskFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly _onDidLogMessage = this._register(new Emitter<ILogMessage>());
	readonly onDidLogMessage = this._onDidLogMessage.event;

	private pathWatchers: { [watchPath: string]: IPathWatcher } = {};
	private verboseLogging: boolean | undefined;
	private enospcErrorLogged: boolean | undefined;

	constructor() {
		super();

		process.on('uncaughtException', (e: Error | string) => {
			// Specially handle ENOSPC errors that can happen when
			// the watcher consumes so many file descriptors that
			// we are running into a limit. We only want to warn
			// once in this case to avoid log spam.
			// See https://github.com/microsoft/vscode/issues/7950
			if (e === 'Inotify limit reached' && !this.enospcErrorLogged) {
				this.enospcErrorLogged = true;
				this.error('Inotify limit reached (ENOSPC)');
			}
		});
	}

	async setRoots(roots: IWatcherRequest[]): Promise<void> {
		const normalizedRoots = this.normalizeRoots(roots);

		// Gather roots that are not currently being watched
		const rootsToStartWatching = normalizedRoots.filter(root => {
			return !(root.path in this.pathWatchers);
		});

		// Gather current roots that don't exist in the new roots array
		const rootsToStopWatching = Object.keys(this.pathWatchers).filter(root => {
			return normalizedRoots.every(normalizedRoot => normalizedRoot.path !== root);
		});

		// Logging
		this.debug(`Start watching: ${rootsToStartWatching.map(root => `${root.path} (excludes: ${root.excludes})`).join(',')}`);
		this.debug(`Stop watching: ${rootsToStopWatching.join(',')}`);

		// Stop watching some roots
		for (const root of rootsToStopWatching) {
			this.pathWatchers[root].ready.then(watcher => watcher.stop());
			delete this.pathWatchers[root];
		}

		// Start watching some roots
		for (const root of rootsToStartWatching) {
			this.doWatch(root);
		}

		// Refresh ignored arrays in case they changed
		for (const root of roots) {
			if (root.path in this.pathWatchers) {
				this.pathWatchers[root.path].ignored = Array.isArray(root.excludes) ? root.excludes.map(ignored => parse(ignored)) : [];
			}
		}
	}

	private doWatch(request: IWatcherRequest): void {
		let readyPromiseResolve: (watcher: IWatcher) => void;
		this.pathWatchers[request.path] = {
			ready: new Promise<IWatcher>(resolve => readyPromiseResolve = resolve),
			ignored: Array.isArray(request.excludes) ? request.excludes.map(ignored => parse(ignored)) : []
		};

		// NSFW does not report file changes in the path provided on macOS if
		// - the path uses wrong casing
		// - the path is a symbolic link
		// We have to detect this case and massage the events to correct this.
		let realBasePathDiffers = false;
		let realBasePathLength = request.path.length;
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

					this.warn(`Watcher basePath does not match version on disk and will be corrected (original: ${request.path}, real: ${realBasePath})`);
				}
			} catch (error) {
				// ignore
			}
		}

		this.debug(`Start watching with nsfw: ${request.path}`);

		let undeliveredFileEvents: IDiskFileChange[] = [];
		const fileEventDelayer = new ThrottledDelayer<void>(NsfwWatcherService.FS_EVENT_DELAY);

		nsfw(request.path, events => {
			for (const e of events) {

				// Logging
				if (this.verboseLogging) {
					const logPath = e.action === nsfw.actions.RENAMED ? join(e.directory, e.oldFile || '') + ' -> ' + e.newFile : join(e.directory, e.file || '');
					this.log(`${e.action === nsfw.actions.CREATED ? '[CREATED]' : e.action === nsfw.actions.DELETED ? '[DELETED]' : e.action === nsfw.actions.MODIFIED ? '[CHANGED]' : '[RENAMED]'} ${logPath}`);
				}

				// Convert nsfw event to `IRawFileChange` and add to queue
				let absolutePath: string;
				if (e.action === nsfw.actions.RENAMED) {
					absolutePath = join(e.directory, e.oldFile || ''); // Rename fires when a file's name changes within a single directory

					if (!this.isPathIgnored(absolutePath, this.pathWatchers[request.path].ignored)) {
						undeliveredFileEvents.push({ type: FileChangeType.DELETED, path: absolutePath });
					} else if (this.verboseLogging) {
						this.log(` >> ignored ${absolutePath}`);
					}

					absolutePath = join(e.newDirectory || e.directory, e.newFile || '');

					if (!this.isPathIgnored(absolutePath, this.pathWatchers[request.path].ignored)) {
						undeliveredFileEvents.push({ type: FileChangeType.ADDED, path: absolutePath });
					} else if (this.verboseLogging) {
						this.log(` >> ignored ${absolutePath}`);
					}
				} else {
					absolutePath = join(e.directory, e.file || '');

					if (!this.isPathIgnored(absolutePath, this.pathWatchers[request.path].ignored)) {
						undeliveredFileEvents.push({
							type: nsfwActionToRawChangeType[e.action],
							path: absolutePath
						});
					} else if (this.verboseLogging) {
						this.log(` >> ignored ${absolutePath}`);
					}
				}
			}

			// Delay and send buffer
			fileEventDelayer.trigger(async () => {
				const events = undeliveredFileEvents;
				undeliveredFileEvents = [];

				if (isMacintosh) {
					for (const e of events) {

						// Mac uses NFD unicode form on disk, but we want NFC
						e.path = normalizeNFC(e.path);

						// Convert paths back to original form in case it differs
						if (realBasePathDiffers) {
							e.path = request.path + e.path.substr(realBasePathLength);
						}
					}
				}

				// Broadcast to clients normalized
				const normalizedEvents = normalizeFileChanges(events);
				this._onDidChangeFile.fire(normalizedEvents);

				// Logging
				if (this.verboseLogging) {
					for (const e of normalizedEvents) {
						this.log(` >> normalized ${e.type === FileChangeType.ADDED ? '[ADDED]' : e.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${e.path}`);
					}
				}
			});
		}).then(watcher => {
			this.pathWatchers[request.path].watcher = watcher;
			const startPromise = watcher.start();
			startPromise.then(() => readyPromiseResolve(watcher));

			return startPromise;
		});
	}

	async setVerboseLogging(enabled: boolean): Promise<void> {
		this.verboseLogging = enabled;
	}

	async stop(): Promise<void> {
		for (let path in this.pathWatchers) {
			let watcher = this.pathWatchers[path];
			watcher.ready.then(watcher => watcher.stop());

			delete this.pathWatchers[path];
		}

		this.pathWatchers = Object.create(null);
	}

	protected normalizeRoots(roots: IWatcherRequest[]): IWatcherRequest[] {
		// Normalizes a set of root paths by removing any root paths that are
		// sub-paths of other roots.
		return roots.filter(root => roots.every(otherRoot => {
			return !(root.path.length > otherRoot.path.length && isEqualOrParent(root.path, otherRoot.path));
		}));
	}

	private isPathIgnored(absolutePath: string, ignored: ParsedPattern[]): boolean {
		return ignored && ignored.some(ignore => ignore(absolutePath));
	}

	private log(message: string) {
		this._onDidLogMessage.fire({ type: 'trace', message: `[File Watcher (nsfw)] ` + message });
	}

	private warn(message: string) {
		this._onDidLogMessage.fire({ type: 'warn', message: `[File Watcher (nsfw)] ` + message });
	}

	private error(message: string) {
		this._onDidLogMessage.fire({ type: 'error', message: `[File Watcher (nsfw)] ` + message });
	}

	private debug(message: string) {
		this._onDidLogMessage.fire({ type: 'debug', message: `[File Watcher (nsfw)] ` + message });
	}
}
