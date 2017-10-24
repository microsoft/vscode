/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import * as paths from 'vs/base/common/paths';
import * as path from 'path';
import * as platform from 'vs/base/common/platform';
import * as watcher from 'vs/workbench/services/files/node/watcher/common';
import * as nsfw from 'nsfw';
import { IWatcherService, IWatcherRequest } from 'vs/workbench/services/files/node/watcher/nsfw/watcher';
import { TPromise, ProgressCallback, TValueCallback } from 'vs/base/common/winjs.base';
import { ThrottledDelayer } from 'vs/base/common/async';
import { FileChangeType } from 'vs/platform/files/common/files';
import { normalizeNFC } from 'vs/base/common/strings';

const nsfwActionToRawChangeType: { [key: number]: number } = [];
nsfwActionToRawChangeType[nsfw.actions.CREATED] = FileChangeType.ADDED;
nsfwActionToRawChangeType[nsfw.actions.MODIFIED] = FileChangeType.UPDATED;
nsfwActionToRawChangeType[nsfw.actions.DELETED] = FileChangeType.DELETED;

interface IWatcherObjet {
	start(): any;
	stop(): any;
}

interface IPathWatcher {
	ready: TPromise<IWatcherObjet>;
	watcher?: IWatcherObjet;
	ignored: string[];
}

export class NsfwWatcherService implements IWatcherService {
	private static FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)

	private _pathWatchers: { [watchPath: string]: IPathWatcher } = {};
	private _watcherPromise: TPromise<void>;
	private _progressCallback: ProgressCallback;
	private _verboseLogging: boolean;


	public initialize(verboseLogging: boolean): TPromise<void> {
		this._verboseLogging = verboseLogging;
		this._watcherPromise = new TPromise<void>((c, e, p) => {
			this._progressCallback = p;
		});
		return this._watcherPromise;
	}

	private _watch(request: IWatcherRequest): void {
		let undeliveredFileEvents: watcher.IRawFileChange[] = [];
		const fileEventDelayer = new ThrottledDelayer(NsfwWatcherService.FS_EVENT_DELAY);

		let readyPromiseCallback: TValueCallback<IWatcherObjet>;
		this._pathWatchers[request.basePath] = {
			ready: new TPromise<IWatcherObjet>(c => readyPromiseCallback = c),
			ignored: request.ignored
		};

		nsfw(request.basePath, events => {
			for (let i = 0; i < events.length; i++) {
				const e = events[i];

				// Logging
				if (this._verboseLogging) {
					const logPath = e.action === nsfw.actions.RENAMED ? path.join(e.directory, e.oldFile) + ' -> ' + e.newFile : path.join(e.directory, e.file);
					console.log(e.action === nsfw.actions.CREATED ? '[CREATED]' : e.action === nsfw.actions.DELETED ? '[DELETED]' : e.action === nsfw.actions.MODIFIED ? '[CHANGED]' : '[RENAMED]', logPath);
				}

				// Convert nsfw event to IRawFileChange and add to queue
				let absolutePath: string;
				if (e.action === nsfw.actions.RENAMED) {
					// Rename fires when a file's name changes within a single directory
					absolutePath = path.join(e.directory, e.oldFile);
					if (!this._isPathIgnored(absolutePath, this._pathWatchers[request.basePath].ignored)) {
						undeliveredFileEvents.push({ type: FileChangeType.DELETED, path: absolutePath });
					}
					absolutePath = path.join(e.directory, e.newFile);
					if (!this._isPathIgnored(absolutePath, this._pathWatchers[request.basePath].ignored)) {
						undeliveredFileEvents.push({ type: FileChangeType.ADDED, path: absolutePath });
					}
				} else {
					absolutePath = path.join(e.directory, e.file);
					if (!this._isPathIgnored(absolutePath, this._pathWatchers[request.basePath].ignored)) {
						undeliveredFileEvents.push({
							type: nsfwActionToRawChangeType[e.action],
							path: absolutePath
						});
					}
				}
			}

			// Delay and send buffer
			fileEventDelayer.trigger(() => {
				const events = undeliveredFileEvents;
				undeliveredFileEvents = [];

				// Mac uses NFD unicode form on disk, but we want NFC
				if (platform.isMacintosh) {
					events.forEach(e => e.path = normalizeNFC(e.path));
				}

				// Broadcast to clients normalized
				const res = watcher.normalize(events);
				this._progressCallback(res);

				// Logging
				if (this._verboseLogging) {
					res.forEach(r => {
						console.log(' >> normalized', r.type === FileChangeType.ADDED ? '[ADDED]' : r.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]', r.path);
					});
				}

				return TPromise.as(null);
			});
		}).then(watcher => {
			this._pathWatchers[request.basePath].watcher = watcher;
			const startPromise = watcher.start();
			startPromise.then(() => readyPromiseCallback(watcher));
			return startPromise;
		});
	}

	public setRoots(roots: IWatcherRequest[]): TPromise<void> {
		const promises: TPromise<void>[] = [];
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
				this._pathWatchers[root.basePath].ignored = root.ignored;
			}
		});

		return TPromise.join(promises).then(() => void 0);
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

	private _isPathIgnored(absolutePath: string, ignored: string[]): boolean {
		return ignored && ignored.some(ignore => glob.match(ignore, absolutePath));
	}
}
