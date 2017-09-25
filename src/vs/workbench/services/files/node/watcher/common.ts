/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import uri from 'vs/base/common/uri';
import { FileChangeType, FileChangesEvent, isParent } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';

export interface IRawFileChange {
	type: FileChangeType;
	path: string;
}

export function toFileChangesEvent(changes: IRawFileChange[]): FileChangesEvent {

	// map to file changes event that talks about URIs
	return new FileChangesEvent(changes.map((c) => {
		return {
			type: c.type,
			resource: uri.file(c.path)
		};
	}));
}

/**
 * Given events that occurred, applies some rules to normalize the events
 */
export function normalize(changes: IRawFileChange[]): IRawFileChange[] {

	// Build deltas
	let normalizer = new EventNormalizer();
	for (let i = 0; i < changes.length; i++) {
		let event = changes[i];
		normalizer.processEvent(event);
	}

	return normalizer.normalize();
}

class EventNormalizer {
	private normalized: IRawFileChange[];
	private mapPathToChange: { [path: string]: IRawFileChange };

	constructor() {
		this.normalized = [];
		this.mapPathToChange = Object.create(null);
	}

	public processEvent(event: IRawFileChange): void {

		// Event path already exists
		let existingEvent = this.mapPathToChange[event.path];
		if (existingEvent) {
			let currentChangeType = existingEvent.type;
			let newChangeType = event.type;

			// ignore CREATE followed by DELETE in one go
			if (currentChangeType === FileChangeType.ADDED && newChangeType === FileChangeType.DELETED) {
				delete this.mapPathToChange[event.path];
				this.normalized.splice(this.normalized.indexOf(existingEvent), 1);
			}

			// flatten DELETE followed by CREATE into CHANGE
			else if (currentChangeType === FileChangeType.DELETED && newChangeType === FileChangeType.ADDED) {
				existingEvent.type = FileChangeType.UPDATED;
			}

			// Do nothing. Keep the created event
			else if (currentChangeType === FileChangeType.ADDED && newChangeType === FileChangeType.UPDATED) {
			}

			// Otherwise apply change type
			else {
				existingEvent.type = newChangeType;
			}
		}

		// Otherwise Store
		else {
			this.normalized.push(event);
			this.mapPathToChange[event.path] = event;
		}
	}

	public normalize(): IRawFileChange[] {
		let addedChangeEvents: IRawFileChange[] = [];
		let deletedPaths: string[] = [];

		// This algorithm will remove all DELETE events up to the root folder
		// that got deleted if any. This ensures that we are not producing
		// DELETE events for each file inside a folder that gets deleted.
		//
		// 1.) split ADD/CHANGE and DELETED events
		// 2.) sort short deleted paths to the top
		// 3.) for each DELETE, check if there is a deleted parent and ignore the event in that case
		return this.normalized.filter(e => {
			if (e.type !== 2) {
				addedChangeEvents.push(e);
				return false; // remove ADD / CHANGE
			}

			return true; // keep DELETE
		}).sort((e1, e2) => {
			return e1.path.length - e2.path.length; // shortest path first
		}).filter(e => {
			if (deletedPaths.some(d => isParent(e.path, d, !isLinux /* ignorecase */))) {
				return false; // DELETE is ignored if parent is deleted already
			}

			// otherwise mark as deleted
			deletedPaths.push(e.path);

			return true;
		}).concat(addedChangeEvents);
	}
}