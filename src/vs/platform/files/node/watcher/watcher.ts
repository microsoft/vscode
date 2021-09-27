/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isLinux } from 'vs/base/common/platform';
import { URI as uri } from 'vs/base/common/uri';
import { FileChangeType, IFileChange, isParent } from 'vs/platform/files/common/files';

export interface IWatchRequest {

	/**
	 * The path to watch.
	 */
	path: string;

	/**
	 * A set of glob patterns or paths to exclude from watching.
	 */
	excludes: string[];
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
			// same name by changing previous event to DELETED
			// whenever new event with different case occurs
			if (existingEvent.path !== event.path && (newChangeType === FileChangeType.ADDED || newChangeType === FileChangeType.UPDATED)) {
				existingEvent.type = FileChangeType.DELETED;
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
