/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as chokidar from 'vscode-chokidar';
import * as fs from 'fs';
import * as gracefulFs from 'graceful-fs';
gracefulFs.gracefulify(fs);
import * as paths from 'vs/base/common/paths';
import * as glob from 'vs/base/common/glob';
import { FileChangeType } from 'vs/platform/files/common/files';
import { ThrottledDelayer } from 'vs/base/common/async';
import { normalizeNFC } from 'vs/base/common/normalization';
import { realcaseSync } from 'vs/base/node/extfs';
import { isMacintosh } from 'vs/base/common/platform';
import * as watcherCommon from 'vs/workbench/services/files/node/watcher/common';
import { IWatcherRequest, IWatcherService, IWatcherOptions, IWatchError } from 'vs/workbench/services/files/node/watcher/unix/watcher';
import { Emitter, Event } from 'vs/base/common/event';

interface IWatcher {
	requests: ExtendedWatcherRequest[];
	stop(): any;
}

export interface IChockidarWatcherOptions {
	pollingInterval?: number;
}

interface ExtendedWatcherRequest extends IWatcherRequest {
	parsedPattern?: glob.ParsedPattern;
}

export class ChokidarWatcherService implements IWatcherService {

	private static readonly FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)
	private static readonly EVENT_SPAM_WARNING_THRESHOLD = 60 * 1000; // warn after certain time span of event spam

	private _watchers: { [watchPath: string]: IWatcher };
	private _watcherCount: number;

	private _pollingInterval?: number;
	private _verboseLogging: boolean;

	private spamCheckStartTime: number;
	private spamWarningLogged: boolean;
	private enospcErrorLogged: boolean;

	private _onWatchEvent = new Emitter<watcherCommon.IRawFileChange[] | IWatchError>();
	readonly onWatchEvent = this._onWatchEvent.event;

	public watch(options: IWatcherOptions & IChockidarWatcherOptions): Event<watcherCommon.IRawFileChange[] | IWatchError> {
		this._verboseLogging = options.verboseLogging;
		this._pollingInterval = options.pollingInterval;
		this._watchers = Object.create(null);
		this._watcherCount = 0;
		return this.onWatchEvent;
	}

	public setVerboseLogging(enabled: boolean): Promise<void> {
		this._verboseLogging = enabled;

		return Promise.resolve();
	}

	public setRoots(requests: IWatcherRequest[]): Promise<void> {
		const watchers = Object.create(null);
		const newRequests: string[] = [];

		const requestsByBasePath = normalizeRoots(requests);

		// evaluate new & remaining watchers
		for (let basePath in requestsByBasePath) {
			let watcher = this._watchers[basePath];
			if (watcher && isEqualRequests(watcher.requests, requestsByBasePath[basePath])) {
				watchers[basePath] = watcher;
				delete this._watchers[basePath];
			} else {
				newRequests.push(basePath);
			}
		}
		// stop all old watchers
		for (let path in this._watchers) {
			this._watchers[path].stop();
		}
		// start all new watchers
		for (let basePath of newRequests) {
			let requests = requestsByBasePath[basePath];
			watchers[basePath] = this._watch(basePath, requests);
		}

		this._watchers = watchers;
		return Promise.resolve();
	}

	// for test purposes
	public get wacherCount() {
		return this._watcherCount;
	}

	private _watch(basePath: string, requests: IWatcherRequest[]): IWatcher {
		if (this._verboseLogging) {
			console.log(`Start watching: ${basePath}]`);
		}

		const pollingInterval = this._pollingInterval || 1000;

		const watcherOpts: chokidar.IOptions = {
			ignoreInitial: true,
			ignorePermissionErrors: true,
			followSymlinks: true, // this is the default of chokidar and supports file events through symlinks
			interval: pollingInterval, // while not used in normal cases, if any error causes chokidar to fallback to polling, increase its intervals
			binaryInterval: pollingInterval,
			disableGlobbing: true // fix https://github.com/Microsoft/vscode/issues/4586
		};

		// if there's only one request, use the built-in ignore-filterering
		const isSingleFolder = requests.length === 1;
		if (isSingleFolder) {
			watcherOpts.ignored = requests[0].ignored;
		}

		// Chokidar fails when the basePath does not match case-identical to the path on disk
		// so we have to find the real casing of the path and do some path massaging to fix this
		// see https://github.com/paulmillr/chokidar/issues/418
		const realBasePath = isMacintosh ? (realcaseSync(basePath) || basePath) : basePath;
		const realBasePathLength = realBasePath.length;
		const realBasePathDiffers = (basePath !== realBasePath);

		if (realBasePathDiffers) {
			console.warn(`Watcher basePath does not match version on disk and was corrected (original: ${basePath}, real: ${realBasePath})`);
		}

		let chokidarWatcher: chokidar.FSWatcher | null = chokidar.watch(realBasePath, watcherOpts);
		this._watcherCount++;

		// Detect if for some reason the native watcher library fails to load
		if (isMacintosh && !chokidarWatcher.options.useFsEvents) {
			console.error('Watcher is not using native fsevents library and is falling back to unefficient polling.');
		}

		let undeliveredFileEvents: watcherCommon.IRawFileChange[] = [];
		let fileEventDelayer: ThrottledDelayer<undefined> | null = new ThrottledDelayer(ChokidarWatcherService.FS_EVENT_DELAY);

		const watcher: IWatcher = {
			requests,
			stop: () => {
				try {
					if (this._verboseLogging) {
						console.log(`Stop watching: ${basePath}]`);
					}
					if (chokidarWatcher) {
						chokidarWatcher.close();
						this._watcherCount--;
						chokidarWatcher = null;
					}
					if (fileEventDelayer) {
						fileEventDelayer.cancel();
						fileEventDelayer = null;
					}
				} catch (error) {
					console.error(error.toString());
				}
			}
		};

		chokidarWatcher.on('all', (type: string, path: string) => {
			if (isMacintosh) {
				// Mac: uses NFD unicode form on disk, but we want NFC
				// See also https://github.com/nodejs/node/issues/2165
				path = normalizeNFC(path);
			}

			if (path.indexOf(realBasePath) < 0) {
				return; // we really only care about absolute paths here in our basepath context here
			}

			// Make sure to convert the path back to its original basePath form if the realpath is different
			if (realBasePathDiffers) {
				path = basePath + path.substr(realBasePathLength);
			}

			let eventType: FileChangeType;
			switch (type) {
				case 'change':
					eventType = FileChangeType.UPDATED;
					break;
				case 'add':
				case 'addDir':
					eventType = FileChangeType.ADDED;
					break;
				case 'unlink':
				case 'unlinkDir':
					eventType = FileChangeType.DELETED;
					break;
				default:
					return;
			}

			// if there's more than one request we need to do
			// extra filtering due to potentially overlapping roots
			if (!isSingleFolder) {
				if (isIgnored(path, watcher.requests)) {
					return;
				}
			}

			let event = { type: eventType, path };

			// Logging
			if (this._verboseLogging) {
				console.log(`${eventType === FileChangeType.ADDED ? '[ADDED]' : eventType === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${path}`);
			}

			// Check for spam
			const now = Date.now();
			if (undeliveredFileEvents.length === 0) {
				this.spamWarningLogged = false;
				this.spamCheckStartTime = now;
			} else if (!this.spamWarningLogged && this.spamCheckStartTime + ChokidarWatcherService.EVENT_SPAM_WARNING_THRESHOLD < now) {
				this.spamWarningLogged = true;
				console.warn(`Watcher is busy catching up with ${undeliveredFileEvents.length} file changes in 60 seconds. Latest changed path is "${event.path}"`);
			}

			// Add to buffer
			undeliveredFileEvents.push(event);

			if (fileEventDelayer) {
				// Delay and send buffer
				fileEventDelayer.trigger(() => {
					const events = undeliveredFileEvents;
					undeliveredFileEvents = [];

					// Broadcast to clients normalized
					const res = watcherCommon.normalize(events);
					this._onWatchEvent.fire(res);

					// Logging
					if (this._verboseLogging) {
						res.forEach(r => {
							console.log(` >> normalized  ${r.type === FileChangeType.ADDED ? '[ADDED]' : r.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${r.path}`);
						});
					}

					return Promise.resolve();
				});
			}
		});

		chokidarWatcher.on('error', (error: Error) => {
			if (error) {

				// Specially handle ENOSPC errors that can happen when
				// the watcher consumes so many file descriptors that
				// we are running into a limit. We only want to warn
				// once in this case to avoid log spam.
				// See https://github.com/Microsoft/vscode/issues/7950
				if ((<any>error).code === 'ENOSPC') {
					if (!this.enospcErrorLogged) {
						this.enospcErrorLogged = true;
						this.stop();
						this._onWatchEvent.fire({ message: 'Inotify limit reached (ENOSPC)' });
					}
				} else {
					console.error(error.toString());
				}
			}
		});
		return watcher;
	}

	public stop(): Promise<void> {
		for (let path in this._watchers) {
			let watcher = this._watchers[path];
			watcher.stop();
		}
		this._watchers = Object.create(null);
		return Promise.resolve();
	}
}

function isIgnored(path: string, requests: ExtendedWatcherRequest[]): boolean {
	for (let request of requests) {
		if (request.basePath === path) {
			return false;
		}
		if (paths.isEqualOrParent(path, request.basePath)) {
			if (!request.parsedPattern) {
				if (request.ignored && request.ignored.length > 0) {
					let pattern = `{${request.ignored.join(',')}}`;
					request.parsedPattern = glob.parse(pattern);
				} else {
					request.parsedPattern = () => false;
				}
			}
			const relPath = path.substr(request.basePath.length + 1);
			if (!request.parsedPattern(relPath)) {
				return false;
			}
		}
	}
	return true;
}

/**
 * Normalizes a set of root paths by grouping by the most parent root path.
 * equests with Sub paths are skipped if they have the same ignored set as the parent.
 */
export function normalizeRoots(requests: IWatcherRequest[]): { [basePath: string]: IWatcherRequest[] } {
	requests = requests.sort((r1, r2) => r1.basePath.localeCompare(r2.basePath));
	let prevRequest: IWatcherRequest | null = null;
	let result: { [basePath: string]: IWatcherRequest[] } = Object.create(null);
	for (let request of requests) {
		let basePath = request.basePath;
		let ignored = (request.ignored || []).sort();
		if (prevRequest && (paths.isEqualOrParent(basePath, prevRequest.basePath))) {
			if (!isEqualIgnore(ignored, prevRequest.ignored)) {
				result[prevRequest.basePath].push({ basePath, ignored });
			}
		} else {
			prevRequest = { basePath, ignored };
			result[basePath] = [prevRequest];
		}
	}
	return result;
}

function isEqualRequests(r1: IWatcherRequest[], r2: IWatcherRequest[]) {
	if (r1.length !== r2.length) {
		return false;
	}
	for (let k = 0; k < r1.length; k++) {
		if (r1[k].basePath !== r2[k].basePath || !isEqualIgnore(r1[k].ignored, r2[k].ignored)) {
			return false;
		}
	}
	return true;
}

function isEqualIgnore(i1: string[], i2: string[]) {
	if (i1.length !== i2.length) {
		return false;
	}
	for (let k = 0; k < i1.length; k++) {
		if (i1[k] !== i2[k]) {
			return false;
		}
	}
	return true;
}
