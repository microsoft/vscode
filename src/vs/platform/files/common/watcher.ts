/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { isLinux } from 'vs/base/common/platform';
import { URI as uri } from 'vs/base/common/uri';
import { FileChangeType, IFileChange, isParent } from 'vs/platform/files/common/files';

export interface IWatcherService {

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
	 * An event to indicate an error occured from the watcher
	 * that is unrecoverable. Listeners should restart the
	 * service if possible.
	 */
	readonly onDidError: Event<string>;

	/**
	 * Configures the watcher service to watch according
	 * to the requests. Any existing watched path that
	 * is not in the array, will be removed from watching
	 * and any new path will be added to watching.
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

export abstract class AbstractWatcherService extends Disposable {

	private static readonly MAX_RESTARTS = 5;

	private service: IWatcherService | undefined;
	private readonly serviceDisposables = this._register(new MutableDisposable());

	private requests: IWatchRequest[] | undefined = undefined;

	private restartCounter = 0;

	constructor(
		private readonly onFileChanges: (changes: IDiskFileChange[]) => void,
		private readonly onLogMessage: (msg: ILogMessage) => void,
		private verboseLogging: boolean
	) {
		super();
	}

	protected abstract createService(disposables: DisposableStore): IWatcherService;

	protected init(): void {

		// Associate disposables to the service
		const disposables = new DisposableStore();
		this.serviceDisposables.value = disposables;

		// Ask implementors to create the service
		this.service = this.createService(disposables);
		this.service.setVerboseLogging(this.verboseLogging);

		// Wire in event handlers
		disposables.add(this.service.onDidChangeFile(e => this.onFileChanges(e)));
		disposables.add(this.service.onDidLogMessage(e => this.onLogMessage(e)));
		disposables.add(this.service.onDidError(e => this.onError(e)));
	}

	protected onError(error: string): void {

		// Restart up to N times
		if (this.restartCounter < AbstractWatcherService.MAX_RESTARTS && this.requests) {
			this.error(`restarting watcher after error: ${error}`);
			this.restart(this.requests);
		}

		// Otherwise log that we have given up to restart
		else {
			this.error(`gave up attempting to restart watcher after error: ${error}`);
		}
	}

	private restart(requests: IWatchRequest[]): void {
		this.restartCounter++;

		this.init();
		this.watch(requests);
	}

	async watch(requests: IWatchRequest[]): Promise<void> {
		this.requests = requests;

		await this.service?.watch(requests);
	}

	async setVerboseLogging(verboseLogging: boolean): Promise<void> {
		this.verboseLogging = verboseLogging;

		await this.service?.setVerboseLogging(verboseLogging);
	}

	private error(message: string) {
		this.onLogMessage({ type: 'error', message: `[File Watcher (parcel)] ${message}` });
	}

	override dispose(): void {

		// Render the serve invalid from here
		this.service = undefined;

		return super.dispose();
	}
}

/**
 * Base class of any watcher service we support.
 *
 * TODO@bpasero delete and replace with `AbstractWatcherService`
 */
export abstract class WatcherService extends Disposable {

	/**
	 * Asks to watch the provided folders.
	 */
	abstract watch(requests: IWatchRequest[]): Promise<void>;

	/**
	 * Enable verbose logging from the watcher.
	 */
	abstract setVerboseLogging(verboseLogging: boolean): Promise<void>;
}

export interface IWatchRequest {

	/**
	 * The path to watch.
	 */
	path: string;

	/**
	 * A set of glob patterns or paths to exclude from watching.
	 */
	excludes: string[];

	/**
	 * @deprecated TODO@bpasero TODO@aeschli remove me once WSL1
	 * support ends.
	 */
	pollingInterval?: number;
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

export function normalizeFileChanges(changes: IDiskFileChange[]): IDiskFileChange[] {

	// Build deltas
	const normalizer = new EventNormalizer();
	for (const event of changes) {
		normalizer.processEvent(event);
	}

	return normalizer.normalize();
}

class EventNormalizer {

	private readonly normalized = new Set<IDiskFileChange>();
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

			// macOS/Windows: track renames to different case but
			// same name by changing current event to DELETED
			// this encodes some underlying knowledge about the
			// file watcher being used by assuming we first get
			// an event for the CREATE and then an event that we
			// consider as DELETE if same name / different case.
			if (existingEvent.path !== event.path && event.type === FileChangeType.DELETED) {
				keepEvent = true;
			}

			// Ignore CREATE followed by DELETE in one go
			else if (currentChangeType === FileChangeType.ADDED && newChangeType === FileChangeType.DELETED) {
				this.mapPathToChange.delete(this.toKey(event));
				this.normalized.delete(existingEvent);
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
			this.normalized.add(event);
			this.mapPathToChange.set(this.toKey(event), event);
		}
	}

	normalize(): IDiskFileChange[] {
		const addOrChangeEvents: IDiskFileChange[] = [];
		const deletedPaths: string[] = [];

		// This algorithm will remove all DELETE events up to the root folder
		// that got deleted if any. This ensures that we are not producing
		// DELETE events for each file inside a folder that gets deleted.
		//
		// 1.) split ADD/CHANGE and DELETED events
		// 2.) sort short deleted paths to the top
		// 3.) for each DELETE, check if there is a deleted parent and ignore the event in that case
		return Array.from(this.normalized).filter(e => {
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
