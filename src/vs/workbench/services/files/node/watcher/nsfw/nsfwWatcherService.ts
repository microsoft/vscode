/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import * as paths from 'vs/base/common/paths';
import * as path from 'path';
import * as platform from 'vs/base/common/platform';
import * as watcher from 'vs/workbench/services/files/node/watcher/common';
import * as nsfw from 'vscode-nsfw';
import { IWatcherService, IWatcherRequest, IWatcherOptions, IWatchError } from 'vs/workbench/services/files/node/watcher/nsfw/watcher';
import { ThrottledDelayer } from 'vs/base/common/async';
import { FileChangeType } from 'vs/platform/files/common/files';
import { normalizeNFC } from 'vs/base/common/normalization';
import { Event, Emitter } from 'vs/base/common/event';
import { realcaseSync, realpathSync } from 'vs/base/node/extfs';

const nsfwActionToRawChangeType: { [key: number]: number } = [];
nsfwActionToRawChangeType[nsfw.actions.CREATED] = FileChangeType.ADDED;
nsfwActionToRawChangeType[nsfw.actions.MODIFIED] = FileChangeType.UPDATED;
nsfwActionToRawChangeType[nsfw.actions.DELETED] = FileChangeType.DELETED;

interface IWatcherObjet {
	start(): any;
	stop(): any;
}

interface IPathWatcher {
	ready: Promise<IWatcherObjet>;
	watcher?: IWatcherObjet;
	ignored: glob.ParsedPattern[];
}

export class NsfwWatcherService implements IWatcherService {
	private static readonly FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)

	private _pathWatchers: { [watchPath: string]: IPathWatcher } = {};
	private _verboseLogging: boolean;
	private enospcErrorLogged: boolean;

	private _onWatchEvent = new Emitter<watcher.IRawFileChange[] | IWatchError>();
	readonly onWatchEvent = this._onWatchEvent.event;

	watch(options: IWatcherOptions): Event<watcher.IRawFileChange[] | IWatchError> {
		this._verboseLogging = options.verboseLogging;
		return this.onWatchEvent;
	}

	private _watch(request: IWatcherRequest): void {
		let undeliveredFileEvents: watcher.IRawFileChange[] = [];
		const fileEventDelayer = new ThrottledDelayer<void>(NsfwWatcherService.FS_EVENT_DELAY);

		let readyPromiseResolve: (watcher: IWatcherObjet) => void;
		this._pathWatchers[request.basePath] = {
			ready: new Promise<IWatcherObjet>(resolve => readyPromiseResolve = resolve),
			ignored: Array.isArray(request.ignored) ? request.ignored.map(ignored => glob.parse(ignored)) : []
		};

		process.on('uncaughtException', (e: Error | string) => {

			// Specially handle ENOSPC errors that can happen when
			// the watcher consumes so many file descriptors that
			// we are running into a limit. We only want to warn
			// once in this case to avoid log spam.
			// See https://github.com/Microsoft/vscode/issues/7950
			if (e === 'Inotify limit reached' && !this.enospcErrorLogged) {
				this.enospcErrorLogged = true;
				this._onWatchEvent.fire({ message: 'Inotify limit reached (ENOSPC)' });
			}
		});

		// NSFW does not report file changes in the path provided on macOS if
		// - the path uses wrong casing
		// - the path is a symbolic link
		// We have to detect this case and massage the events to correct this.
		let realBasePathDiffers = false;
		let realBasePathLength = request.basePath.length;
		if (platform.isMacintosh) {
			try {

				// First check for symbolic link
				let realBasePath = realpathSync(request.basePath);

				// Second check for casing difference
				if (request.basePath === realBasePath) {
					realBasePath = (realcaseSync(request.basePath) || request.basePath);
				}

				if (request.basePath !== realBasePath) {
					realBasePathLength = realBasePath.length;
					realBasePathDiffers = true;

					console.warn(`Watcher basePath does not match version on disk and will be corrected (original: ${request.basePath}, real: ${realBasePath})`);
				}
			} catch (error) {
				// ignore
			}
		}

		nsfw(request.basePath, events => {
			for (const e of events) {
				// Logging
				if (this._verboseLogging) {
					const logPath = e.action === nsfw.actions.RENAMED ? path.join(e.directory, e.oldFile || '') + ' -> ' + e.newFile : path.join(e.directory, e.file || '');
					console.log(`${e.action === nsfw.actions.CREATED ? '[CREATED]' : e.action === nsfw.actions.DELETED ? '[DELETED]' : e.action === nsfw.actions.MODIFIED ? '[CHANGED]' : '[RENAMED]'} ${logPath}`);
				}

				// Convert nsfw event to IRawFileChange and add to queue
				let absolutePath: string;
				if (e.action === nsfw.actions.RENAMED) {
					// Rename fires when a file's name changes within a single directory
					absolutePath = path.join(e.directory, e.oldFile || '');
					if (!this._isPathIgnored(absolutePath, this._pathWatchers[request.basePath].ignored)) {
						undeliveredFileEvents.push({ type: FileChangeType.DELETED, path: absolutePath });
					} else if (this._verboseLogging) {
						console.log(' >> ignored', absolutePath);
					}
					absolutePath = path.join(e.directory, e.newFile || '');
					if (!this._isPathIgnored(absolutePath, this._pathWatchers[request.basePath].ignored)) {
						undeliveredFileEvents.push({ type: FileChangeType.ADDED, path: absolutePath });
					} else if (this._verboseLogging) {
						console.log(' >> ignored', absolutePath);
					}
				} else {
					absolutePath = path.join(e.directory, e.file || '');
					if (!this._isPathIgnored(absolutePath, this._pathWatchers[request.basePath].ignored)) {
						undeliveredFileEvents.push({
							type: nsfwActionToRawChangeType[e.action],
							path: absolutePath
						});
					} else if (this._verboseLogging) {
						console.log(' >> ignored', absolutePath);
					}
				}
			}

			// Delay and send buffer
			fileEventDelayer.trigger(() => {
				const events = undeliveredFileEvents;
				undeliveredFileEvents = [];

				if (platform.isMacintosh) {
					events.forEach(e => {

						// Mac uses NFD unicode form on disk, but we want NFC
						e.path = normalizeNFC(e.path);

						// Convert paths back to original form in case it differs
						if (realBasePathDiffers) {
							e.path = request.basePath + e.path.substr(realBasePathLength);
						}
					});
				}

				// Broadcast to clients normalized
				const res = watcher.normalize(events);
				this._onWatchEvent.fire(res);

				// Logging
				if (this._verboseLogging) {
					res.forEach(r => {
						console.log(` >> normalized ${r.type === FileChangeType.ADDED ? '[ADDED]' : r.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${r.path}`);
					});
				}

				return Promise.resolve(undefined);
			});
		}).then(watcher => {
			this._pathWatchers[request.basePath].watcher = watcher;
			const startPromise = watcher.start();
			startPromise.then(() => readyPromiseResolve(watcher));
			return startPromise;
		});
	}

	public setRoots(roots: IWatcherRequest[]): Promise<void> {
		const promises: Promise<void>[] = [];
		const normalizedRoots = this._normalizeRoots(roots);

		// Gather roots that are not currently being watched
		const rootsToStartWatching = normalizedRoots.filter(r => {
			return !(r.basePath in this._pathWatchers);
		});

		// Gather current roots that don't exist in the new roots array
		const rootsToStopWatching = Object.keys(this._pathWatchers).filter(r => {
			return normalizedRoots.every(normalizedRoot => normalizedRoot.basePath !== r);
		});

		// Logging
		if (this._verboseLogging) {
			console.log(`Start watching: [${rootsToStartWatching.map(r => r.basePath).join(',')}]\nStop watching: [${rootsToStopWatching.join(',')}]`);
		}

		// Stop watching some roots
		rootsToStopWatching.forEach(root => {
			this._pathWatchers[root].ready.then(watcher => watcher.stop());
			delete this._pathWatchers[root];
		});

		// Start watching some roots
		rootsToStartWatching.forEach(root => this._watch(root));

		// Refresh ignored arrays in case they changed
		roots.forEach(root => {
			if (root.basePath in this._pathWatchers) {
				this._pathWatchers[root.basePath].ignored = Array.isArray(root.ignored) ? root.ignored.map(ignored => glob.parse(ignored)) : [];
			}
		});

		return Promise.all(promises).then(() => undefined);
	}

	public setVerboseLogging(enabled: boolean): Promise<void> {
		this._verboseLogging = enabled;
		return Promise.resolve(undefined);
	}

	public stop(): Promise<void> {
		for (let path in this._pathWatchers) {
			let watcher = this._pathWatchers[path];
			watcher.ready.then(watcher => watcher.stop());
			delete this._pathWatchers[path];
		}
		this._pathWatchers = Object.create(null);
		return Promise.resolve();
	}

	/**
	 * Normalizes a set of root paths by removing any root paths that are
	 * sub-paths of other roots.
	 */
	protected _normalizeRoots(roots: IWatcherRequest[]): IWatcherRequest[] {
		return roots.filter(r => roots.every(other => {
			return !(r.basePath.length > other.basePath.length && paths.isEqualOrParent(r.basePath, other.basePath));
		}));
	}

	private _isPathIgnored(absolutePath: string, ignored: glob.ParsedPattern[]): boolean {
		return ignored && ignored.some(i => i(absolutePath));
	}
}
