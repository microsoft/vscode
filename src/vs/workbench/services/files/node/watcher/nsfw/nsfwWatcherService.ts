/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import * as path from 'path';
import * as watcher from 'vs/workbench/services/files/node/watcher/common';
import * as nsfw from 'nsfw';
import { IWatcherService, IWatcherRequest } from 'vs/workbench/services/files/node/watcher/nsfw/watcher';
import { TPromise, ProgressCallback, TValueCallback } from 'vs/base/common/winjs.base';
import { ThrottledDelayer } from 'vs/base/common/async';
import { FileChangeType } from 'vs/platform/files/common/files';

const nsfwActionToRawChangeType: { [key: number]: number } = [];
nsfwActionToRawChangeType[nsfw.actions.CREATED] = FileChangeType.ADDED;
nsfwActionToRawChangeType[nsfw.actions.MODIFIED] = FileChangeType.UPDATED;
nsfwActionToRawChangeType[nsfw.actions.DELETED] = FileChangeType.DELETED;

interface IWatcherObjet {
	start(): void;
	stop(): void;
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

	public watch(request: IWatcherRequest): TPromise<void> {
		if (this._verboseLogging) {
			console.log('request', request);
		}

		let undeliveredFileEvents: watcher.IRawFileChange[] = [];
		const fileEventDelayer = new ThrottledDelayer(NsfwWatcherService.FS_EVENT_DELAY);

		console.log('starting to watch ' + request.basePath);

		let readyPromiseCallback: TValueCallback<IWatcherObjet>;
		this._pathWatchers[request.basePath] = {
			ready: new TPromise<IWatcherObjet>(c => readyPromiseCallback = c),
			ignored: request.ignored
		};

		const promise = new TPromise<void>((c, e, p) => {
			nsfw(request.basePath, events => {
				console.log('received events for path: ' + request.basePath);
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
							console.log('adding event for path', absolutePath);
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
					console.log('sending events!', events);
					undeliveredFileEvents = [];

					// Broadcast to clients normalized
					const res = watcher.normalize(events);
					p(res);

					// Logging
					if (this._verboseLogging) {
						res.forEach(r => {
							console.log(' >> normalized', r.type === FileChangeType.ADDED ? '[ADDED]' : r.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]', r.path);
						});
					}

					return TPromise.as(null);
				});
			}).then(watcher => {
				console.log('watcher ready ' + request.basePath);
				this._pathWatchers[request.basePath].watcher = watcher;
				const startPromise = watcher.start();
				startPromise.then(() => readyPromiseCallback(watcher));
				return startPromise;
			});
		});

		return promise;
	}

	// TODO: This should probably be the only way to watch a folder
	public setRoots(roots: IWatcherRequest[]): TPromise<void> {
		const normalizedRoots = this._normalizeRoots(roots);

		// Start watching roots that are not currently being watched
		const rootsToStartWatching = normalizedRoots.filter(r => {
			return !(r.basePath in this._pathWatchers);
		});

		// Stop watching roots that don't exist in the new roots
		const rootsToStopWatching = Object.keys(this._pathWatchers).filter(r => {
			return normalizedRoots.every(normalizedRoot => normalizedRoot.basePath !== r);
		});

		// TODO: Support updating roots when only the ignored files change
		// This should be just a matter of updating the ignored part
		const rootsWithChangedOptions = Object.keys(this._pathWatchers).filter(r => {
			return normalizedRoots.some(normalizedRoot => {
				if (normalizedRoot.basePath !== r) {
					return false;
				}
				const ignored = this._pathWatchers[r].ignored;
				// TODO: Improve comments, refactor
				if (normalizedRoot.ignored.length !== ignored.length) {
					console.log('ignored changed on root: ' + r);
					this._pathWatchers[r].ignored = normalizedRoot.ignored;
					return true;
				}
				// Check deep equality
				for (let i = 0; i < ignored.length; i++) {
					if (normalizedRoot.ignored[i] !== ignored[i]) {
						console.log('ignored changed on root: ' + r);
						this._pathWatchers[r].ignored = normalizedRoot.ignored;
						return true;
					}
				}
				return false;
			});
		});

		// Logging
		if (this._verboseLogging) {
			console.log(`Set watch roots: start: [${rootsToStartWatching.map(r => r.basePath).join(',')}], stop: [${rootsToStopWatching.join(',')}], changed: [${rootsWithChangedOptions.join(', ')}]`);
		}

		const promises: TPromise<void>[] = [];

		// Stop watching some roots
		rootsToStopWatching.forEach(root => {
			this._pathWatchers[root].ready.then(watcher => watcher.stop());
			delete this._pathWatchers[root];
		});

		// Start watching some roots
		rootsToStartWatching.forEach(root => promises.push(this.watch(root)));

		// TODO: Don't watch sub-folders of folders
		return TPromise.join(promises).then(() => void 0);
	}

	/**
	 * Normalizes a set of root paths by removing any folders that are
	 * sub-folders of other roots.
	 */
	protected _normalizeRoots(roots: IWatcherRequest[]): IWatcherRequest[] {
		return roots.filter(r => roots.every(other => {
			return !(r.basePath.length > other.basePath.length && r.basePath.indexOf(other.basePath) === 0);
		}));
	}

	private _isPathIgnored(absolutePath: string, ignored: string[]): boolean {
		console.log('is "' + absolutePath + '" ignored? ' + (ignored && ignored.some(ignore => glob.match(ignore, absolutePath))));
		console.log('  ignored: ', ignored);
		return ignored && ignored.some(ignore => glob.match(ignore, absolutePath));
	}
}
