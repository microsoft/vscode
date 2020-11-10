/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as gracefulFs from 'graceful-fs';
gracefulFs.gracefulify(fs);
import * as extpath from 'vs/base/common/extpath';
import * as glob from 'vs/base/common/glob';
import { FileChangeType } from 'vs/platform/files/common/files';
import { ThrottledDelayer } from 'vs/base/common/async';
import { normalizeNFC } from 'vs/base/common/normalization';
import { realcaseSync } from 'vs/base/node/extpath';
import { isMacintosh, isLinux } from 'vs/base/common/platform';
import { IDiskFileChange, normalizeFileChanges, ILogMessage } from 'vs/platform/files/node/watcher/watcher';
import { IWatcherRequest, IWatcherService, IWatcherOptions } from 'vs/platform/files/node/watcher/unix/watcher';
import { Emitter, Event } from 'vs/base/common/event';
import { equals } from 'vs/base/common/arrays';
import { Disposable } from 'vs/base/common/lifecycle';

process.noAsar = true; // disable ASAR support in watcher process

interface IWatcher {
	requests: ExtendedWatcherRequest[];
	stop(): Promise<void>;
}

interface ExtendedWatcherRequest extends IWatcherRequest {
	parsedPattern?: glob.ParsedPattern;
}

export class ChokidarWatcherService extends Disposable implements IWatcherService {

	private static readonly FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)
	private static readonly EVENT_SPAM_WARNING_THRESHOLD = 60 * 1000; // warn after certain time span of event spam

	private readonly _onDidChangeFile = this._register(new Emitter<IDiskFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly _onDidLogMessage = this._register(new Emitter<ILogMessage>());
	readonly onDidLogMessage: Event<ILogMessage> = this._onDidLogMessage.event;

	private watchers = new Map<string, IWatcher>();

	private _watcherCount = 0;
	get wacherCount() { return this._watcherCount; }

	private pollingInterval?: number;
	private usePolling?: boolean;
	private verboseLogging: boolean | undefined;

	private spamCheckStartTime: number | undefined;
	private spamWarningLogged: boolean | undefined;
	private enospcErrorLogged: boolean | undefined;

	async init(options: IWatcherOptions): Promise<void> {
		this.pollingInterval = options.pollingInterval;
		this.usePolling = options.usePolling;
		this.watchers.clear();
		this._watcherCount = 0;
		this.verboseLogging = options.verboseLogging;
	}

	async setVerboseLogging(enabled: boolean): Promise<void> {
		this.verboseLogging = enabled;
	}

	async setRoots(requests: IWatcherRequest[]): Promise<void> {
		const watchers = new Map<string, IWatcher>();
		const newRequests: string[] = [];

		const requestsByBasePath = normalizeRoots(requests);

		// evaluate new & remaining watchers
		for (const basePath in requestsByBasePath) {
			const watcher = this.watchers.get(basePath);
			if (watcher && isEqualRequests(watcher.requests, requestsByBasePath[basePath])) {
				watchers.set(basePath, watcher);
				this.watchers.delete(basePath);
			} else {
				newRequests.push(basePath);
			}
		}

		// stop all old watchers
		for (const [, watcher] of this.watchers) {
			await watcher.stop();
		}

		// start all new watchers
		for (const basePath of newRequests) {
			const requests = requestsByBasePath[basePath];
			watchers.set(basePath, this.watch(basePath, requests));
		}

		this.watchers = watchers;
	}

	private watch(basePath: string, requests: IWatcherRequest[]): IWatcher {
		const pollingInterval = this.pollingInterval || 5000;
		const usePolling = this.usePolling;

		const watcherOpts: chokidar.WatchOptions = {
			ignoreInitial: true,
			ignorePermissionErrors: true,
			followSymlinks: true, // this is the default of chokidar and supports file events through symlinks
			interval: pollingInterval, // while not used in normal cases, if any error causes chokidar to fallback to polling, increase its intervals
			binaryInterval: pollingInterval,
			usePolling: usePolling,
			disableGlobbing: true // fix https://github.com/microsoft/vscode/issues/4586
		};

		const excludes: string[] = [];

		const isSingleFolder = requests.length === 1;
		if (isSingleFolder) {
			excludes.push(...requests[0].excludes); // if there's only one request, use the built-in ignore-filterering
		}

		if ((isMacintosh || isLinux) && (basePath.length === 0 || basePath === '/')) {
			excludes.push('/dev/**');
			if (isLinux) {
				excludes.push('/proc/**', '/sys/**');
			}
		}

		excludes.push('**/*.asar'); // Ensure we never recurse into ASAR archives

		watcherOpts.ignored = excludes;

		// Chokidar fails when the basePath does not match case-identical to the path on disk
		// so we have to find the real casing of the path and do some path massaging to fix this
		// see https://github.com/paulmillr/chokidar/issues/418
		const realBasePath = isMacintosh ? (realcaseSync(basePath) || basePath) : basePath;
		const realBasePathLength = realBasePath.length;
		const realBasePathDiffers = (basePath !== realBasePath);

		if (realBasePathDiffers) {
			this.warn(`Watcher basePath does not match version on disk and was corrected (original: ${basePath}, real: ${realBasePath})`);
		}

		if (this.verboseLogging) {
			this.log(`Start watching with chokidar: ${realBasePath}, excludes: ${excludes.join(',')}, usePolling: ${usePolling ? 'true, interval ' + pollingInterval : 'false'}`);
		}

		let chokidarWatcher: chokidar.FSWatcher | null = chokidar.watch(realBasePath, watcherOpts);
		this._watcherCount++;

		// Detect if for some reason the native watcher library fails to load
		if (isMacintosh && chokidarWatcher.options && !chokidarWatcher.options.useFsEvents) {
			this.warn('Watcher is not using native fsevents library and is falling back to unefficient polling.');
		}

		let undeliveredFileEvents: IDiskFileChange[] = [];
		let fileEventDelayer: ThrottledDelayer<undefined> | null = new ThrottledDelayer(ChokidarWatcherService.FS_EVENT_DELAY);

		const watcher: IWatcher = {
			requests,
			stop: async () => {
				try {
					if (this.verboseLogging) {
						this.log(`Stop watching: ${basePath}]`);
					}
					if (chokidarWatcher) {
						await chokidarWatcher.close();
						this._watcherCount--;
						chokidarWatcher = null;
					}
					if (fileEventDelayer) {
						fileEventDelayer.cancel();
						fileEventDelayer = null;
					}
				} catch (error) {
					this.warn('Error while stopping watcher: ' + error.toString());
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

			const event = { type: eventType, path };

			// Logging
			if (this.verboseLogging) {
				this.log(`${eventType === FileChangeType.ADDED ? '[ADDED]' : eventType === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${path}`);
			}

			// Check for spam
			const now = Date.now();
			if (undeliveredFileEvents.length === 0) {
				this.spamWarningLogged = false;
				this.spamCheckStartTime = now;
			} else if (!this.spamWarningLogged && typeof this.spamCheckStartTime === 'number' && this.spamCheckStartTime + ChokidarWatcherService.EVENT_SPAM_WARNING_THRESHOLD < now) {
				this.spamWarningLogged = true;
				this.warn(`Watcher is busy catching up with ${undeliveredFileEvents.length} file changes in 60 seconds. Latest changed path is "${event.path}"`);
			}

			// Add to buffer
			undeliveredFileEvents.push(event);

			if (fileEventDelayer) {

				// Delay and send buffer
				fileEventDelayer.trigger(async () => {
					const events = undeliveredFileEvents;
					undeliveredFileEvents = [];

					// Broadcast to clients normalized
					const res = normalizeFileChanges(events);
					this._onDidChangeFile.fire(res);

					// Logging
					if (this.verboseLogging) {
						res.forEach(r => {
							this.log(` >> normalized  ${r.type === FileChangeType.ADDED ? '[ADDED]' : r.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${r.path}`);
						});
					}

					return undefined;
				});
			}
		});

		chokidarWatcher.on('error', (error: NodeJS.ErrnoException) => {
			if (error) {

				// Specially handle ENOSPC errors that can happen when
				// the watcher consumes so many file descriptors that
				// we are running into a limit. We only want to warn
				// once in this case to avoid log spam.
				// See https://github.com/microsoft/vscode/issues/7950
				if (error.code === 'ENOSPC') {
					if (!this.enospcErrorLogged) {
						this.enospcErrorLogged = true;
						this.stop();
						this.error('Inotify limit reached (ENOSPC)');
					}
				} else {
					this.warn(error.toString());
				}
			}
		});
		return watcher;
	}

	async stop(): Promise<void> {
		for (const [, watcher] of this.watchers) {
			await watcher.stop();
		}

		this.watchers.clear();
	}

	private log(message: string) {
		this._onDidLogMessage.fire({ type: 'trace', message: `[File Watcher (chokidar)] ` + message });
	}

	private warn(message: string) {
		this._onDidLogMessage.fire({ type: 'warn', message: `[File Watcher (chokidar)] ` + message });
	}

	private error(message: string) {
		this._onDidLogMessage.fire({ type: 'error', message: `[File Watcher (chokidar)] ` + message });
	}
}

function isIgnored(path: string, requests: ExtendedWatcherRequest[]): boolean {
	for (const request of requests) {
		if (request.path === path) {
			return false;
		}

		if (extpath.isEqualOrParent(path, request.path)) {
			if (!request.parsedPattern) {
				if (request.excludes && request.excludes.length > 0) {
					const pattern = `{${request.excludes.join(',')}}`;
					request.parsedPattern = glob.parse(pattern);
				} else {
					request.parsedPattern = () => false;
				}
			}

			const relPath = path.substr(request.path.length + 1);
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
	requests = requests.sort((r1, r2) => r1.path.localeCompare(r2.path));

	let prevRequest: IWatcherRequest | null = null;
	const result: { [basePath: string]: IWatcherRequest[] } = Object.create(null);
	for (const request of requests) {
		const basePath = request.path;
		const ignored = (request.excludes || []).sort();
		if (prevRequest && (extpath.isEqualOrParent(basePath, prevRequest.path))) {
			if (!isEqualIgnore(ignored, prevRequest.excludes)) {
				result[prevRequest.path].push({ path: basePath, excludes: ignored });
			}
		} else {
			prevRequest = { path: basePath, excludes: ignored };
			result[basePath] = [prevRequest];
		}
	}

	return result;
}

function isEqualRequests(r1: readonly IWatcherRequest[], r2: readonly IWatcherRequest[]) {
	return equals(r1, r2, (a, b) => a.path === b.path && isEqualIgnore(a.excludes, b.excludes));
}

function isEqualIgnore(i1: readonly string[], i2: readonly string[]) {
	return equals(i1, i2);
}
