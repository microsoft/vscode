/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { isLinux } from 'vs/base/common/platform';
import { URI as uri } from 'vs/base/common/uri';
import { FileChangeType, IFileChange, isParent } from 'vs/platform/files/common/files';

interface IWatchRequest {

	/**
	 * The path to watch.
	 */
	path: string;

	/**
	 * Whether to watch recursively or not.
	 */
	recursive: boolean;

	/**
	 * A set of glob patterns or paths to exclude from watching.
	 */
	excludes: string[];

	/**
	 * An optional set of glob patterns or paths to include for
	 * watching. If not provided, all paths are considered for
	 * events.
	 */
	includes?: string[];
}

export interface INonRecursiveWatchRequest extends IWatchRequest {

	/**
	 * The watcher will be non-recursive.
	 */
	recursive: false;
}

export interface IRecursiveWatchRequest extends IWatchRequest {

	/**
	 * The watcher will be recursive.
	 */
	recursive: true;

	/**
	 * @deprecated this only exists for WSL1 support and should never
	 * be used in any other case.
	 */
	pollingInterval?: number;
}

export function isRecursiveWatchRequest(request: IWatchRequest): request is IRecursiveWatchRequest {
	return request.recursive === true;
}

export type IUniversalWatchRequest = IRecursiveWatchRequest | INonRecursiveWatchRequest;

interface IWatcher {

	/**
	 * A normalized file change event from the raw events
	 * the watcher emits.
	 */
	readonly onDidChangeFile: Event<IDiskFileChange[]>;

	/**
	 * An event to indicate a message that should get logged.
	 */
	readonly onDidLogMessage: Event<ILogMessage>;

	/**
	 * An event to indicate an error occurred from the watcher
	 * that is unrecoverable. Listeners should restart the
	 * watcher if possible.
	 */
	readonly onDidError: Event<string>;

	/**
	 * Configures the watcher to watch according to the
	 * requests. Any existing watched path that is not
	 * in the array, will be removed from watching and
	 * any new path will be added to watching.
	 */
	watch(requests: IWatchRequest[]): Promise<void>;

	/**
	 * Enable verbose logging in the watcher.
	 */
	setVerboseLogging(enabled: boolean): Promise<void>;

	/**
	 * Stop all watchers.
	 */
	stop(): Promise<void>;
}

export interface IRecursiveWatcher extends IWatcher {
	watch(requests: IRecursiveWatchRequest[]): Promise<void>;
}

export interface IRecursiveWatcherOptions {

	/**
	 * If `true`, will enable polling for all watchers, otherwise
	 * will enable it for paths included in the string array.
	 *
	 * @deprecated this only exists for WSL1 support and should never
	 * be used in any other case.
	 */
	usePolling: boolean | string[];

	/**
	 * If polling is enabled (via `usePolling`), defines the duration
	 * in which the watcher will poll for changes.
	 *
	 * @deprecated this only exists for WSL1 support and should never
	 * be used in any other case.
	 */
	pollingInterval?: number;
}

export interface INonRecursiveWatcher extends IWatcher {
	watch(requests: INonRecursiveWatchRequest[]): Promise<void>;
}

export interface IUniversalWatcher extends IWatcher {
	watch(requests: IUniversalWatchRequest[]): Promise<void>;
}

export abstract class AbstractWatcherClient extends Disposable {

	private static readonly MAX_RESTARTS = 5;

	private watcher: IWatcher | undefined;
	private readonly watcherDisposables = this._register(new MutableDisposable());

	private requests: IWatchRequest[] | undefined = undefined;

	private restartCounter = 0;

	constructor(
		private readonly onFileChanges: (changes: IDiskFileChange[]) => void,
		private readonly onLogMessage: (msg: ILogMessage) => void,
		private verboseLogging: boolean,
		private options: {
			type: string;
			restartOnError: boolean;
		}
	) {
		super();
	}

	protected abstract createWatcher(disposables: DisposableStore): IWatcher;

	protected init(): void {

		// Associate disposables to the watcher
		const disposables = new DisposableStore();
		this.watcherDisposables.value = disposables;

		// Ask implementors to create the watcher
		this.watcher = this.createWatcher(disposables);
		this.watcher.setVerboseLogging(this.verboseLogging);

		// Wire in event handlers
		disposables.add(this.watcher.onDidChangeFile(changes => this.onFileChanges(changes)));
		disposables.add(this.watcher.onDidLogMessage(msg => this.onLogMessage(msg)));
		disposables.add(this.watcher.onDidError(error => this.onError(error)));
	}

	protected onError(error: string): void {

		// Restart on error (up to N times, if enabled)
		if (this.options.restartOnError) {
			if (this.restartCounter < AbstractWatcherClient.MAX_RESTARTS && this.requests) {
				this.error(`restarting watcher after error: ${error}`);
				this.restart(this.requests);
			} else {
				this.error(`gave up attempting to restart watcher after error: ${error}`);
			}
		}

		// Do not attempt to restart if not enabled
		else {
			this.error(error);
		}
	}

	private restart(requests: IUniversalWatchRequest[]): void {
		this.restartCounter++;

		this.init();
		this.watch(requests);
	}

	async watch(requests: IUniversalWatchRequest[]): Promise<void> {
		this.requests = requests;

		await this.watcher?.watch(requests);
	}

	async setVerboseLogging(verboseLogging: boolean): Promise<void> {
		this.verboseLogging = verboseLogging;

		await this.watcher?.setVerboseLogging(verboseLogging);
	}

	private error(message: string) {
		this.onLogMessage({ type: 'error', message: `[File Watcher (${this.options.type})] ${message}` });
	}

	override dispose(): void {

		// Render the watcher invalid from here
		this.watcher = undefined;

		return super.dispose();
	}
}

export abstract class AbstractNonRecursiveWatcherClient extends AbstractWatcherClient {

	constructor(
		onFileChanges: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	) {
		super(onFileChanges, onLogMessage, verboseLogging, { type: 'node.js', restartOnError: false });
	}

	protected abstract override createWatcher(disposables: DisposableStore): INonRecursiveWatcher;
}

export abstract class AbstractUniversalWatcherClient extends AbstractWatcherClient {

	constructor(
		onFileChanges: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	) {
		super(onFileChanges, onLogMessage, verboseLogging, { type: 'universal', restartOnError: true });
	}

	protected abstract override createWatcher(disposables: DisposableStore): IUniversalWatcher;
}

export interface IDiskFileChange {
	type: FileChangeType;
	path: string;
}

export interface ILogMessage {
	type: 'trace' | 'warn' | 'error' | 'info' | 'debug';
	message: string;
}

export function toFileChanges(changes: IDiskFileChange[]): IFileChange[] {
	return changes.map(change => ({
		type: change.type,
		resource: uri.file(change.path)
	}));
}

export function coalesceEvents(changes: IDiskFileChange[]): IDiskFileChange[] {

	// Build deltas
	const coalescer = new EventCoalescer();
	for (const event of changes) {
		coalescer.processEvent(event);
	}

	return coalescer.coalesce();
}

class EventCoalescer {

	private readonly coalesced = new Set<IDiskFileChange>();
	private readonly mapPathToChange = new Map<string, IDiskFileChange>();

	private toKey(event: IDiskFileChange): string {
		if (isLinux) {
			return event.path;
		}

		return event.path.toLowerCase(); // normalise to file system case sensitivity
	}

	processEvent(event: IDiskFileChange): void {
		const existingEvent = this.mapPathToChange.get(this.toKey(event));

		let keepEvent = false;

		// Event path already exists
		if (existingEvent) {
			const currentChangeType = existingEvent.type;
			const newChangeType = event.type;

			// macOS/Windows: track renames to different case
			// by keeping both CREATE and DELETE events
			if (existingEvent.path !== event.path && (event.type === FileChangeType.DELETED || event.type === FileChangeType.ADDED)) {
				keepEvent = true;
			}

			// Ignore CREATE followed by DELETE in one go
			else if (currentChangeType === FileChangeType.ADDED && newChangeType === FileChangeType.DELETED) {
				this.mapPathToChange.delete(this.toKey(event));
				this.coalesced.delete(existingEvent);
			}

			// Flatten DELETE followed by CREATE into CHANGE
			else if (currentChangeType === FileChangeType.DELETED && newChangeType === FileChangeType.ADDED) {
				existingEvent.type = FileChangeType.UPDATED;
			}

			// Do nothing. Keep the created event
			else if (currentChangeType === FileChangeType.ADDED && newChangeType === FileChangeType.UPDATED) { }

			// Otherwise apply change type
			else {
				existingEvent.type = newChangeType;
			}
		}

		// Otherwise keep
		else {
			keepEvent = true;
		}

		if (keepEvent) {
			this.coalesced.add(event);
			this.mapPathToChange.set(this.toKey(event), event);
		}
	}

	coalesce(): IDiskFileChange[] {
		const addOrChangeEvents: IDiskFileChange[] = [];
		const deletedPaths: string[] = [];

		// This algorithm will remove all DELETE events up to the root folder
		// that got deleted if any. This ensures that we are not producing
		// DELETE events for each file inside a folder that gets deleted.
		//
		// 1.) split ADD/CHANGE and DELETED events
		// 2.) sort short deleted paths to the top
		// 3.) for each DELETE, check if there is a deleted parent and ignore the event in that case
		return Array.from(this.coalesced).filter(e => {
			if (e.type !== FileChangeType.DELETED) {
				addOrChangeEvents.push(e);

				return false; // remove ADD / CHANGE
			}

			return true; // keep DELETE
		}).sort((e1, e2) => {
			return e1.path.length - e2.path.length; // shortest path first
		}).filter(e => {
			if (deletedPaths.some(deletedPath => isParent(e.path, deletedPath, !isLinux /* ignorecase */))) {
				return false; // DELETE is ignored if parent is deleted already
			}

			// otherwise mark as deleted
			deletedPaths.push(e.path);

			return true;
		}).concat(addOrChangeEvents);
	}
}
