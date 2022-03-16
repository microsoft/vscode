/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { SaveSource } from 'vs/workbench/common/editor';

export const IWorkingCopyHistoryService = createDecorator<IWorkingCopyHistoryService>('workingCopyHistoryService');

export interface IWorkingCopyHistoryEvent {

	/**
	 * The entry this event is about.
	 */
	readonly entry: IWorkingCopyHistoryEntry;
}

export interface IWorkingCopyHistoryEntry {

	/**
	 * Unique identifier of this entry for the working copy.
	 */
	readonly id: string;

	/**
	 * The associated working copy of this entry.
	 */
	readonly workingCopy: {
		readonly resource: URI;
		readonly name: string;
	};

	/**
	 * The location on disk of this history entry.
	 */
	readonly location: URI;

	/**
	 * The time when this history entry was created.
	 */
	readonly timestamp: {

		/**
		 * The raw time value as timestamp.
		 */
		readonly value: number;

		/**
		 * Preferred label for how the time should be displayed.
		 */
		readonly label: string;
	};

	/**
	 * Associated source with the history entry.
	 */
	readonly source: SaveSource;
}

export interface IWorkingCopyHistoryEntryDescriptor {

	/**
	 * The associated resource of this history entry.
	 */
	readonly resource: URI;

	/**
	 * Optional associated timestamp to use for the
	 * history entry. If not provided, the current
	 * time will be used.
	 */
	readonly timestamp?: number;

	/**
	 * Optional source why the entry was added.
	 */
	readonly source?: SaveSource;
}

export interface IWorkingCopyHistoryService {

	readonly _serviceBrand: undefined;

	/**
	 * An event when entries are added to the history.
	 */
	onDidAddEntry: Event<IWorkingCopyHistoryEvent>;

	/**
	 * An event when entries are removed from the history.
	 */
	onDidRemoveEntry: Event<IWorkingCopyHistoryEvent>;

	/**
	 * Adds a new entry to the history for the given working copy
	 * with an optional associated descriptor.
	 */
	addEntry(descriptor: IWorkingCopyHistoryEntryDescriptor, token: CancellationToken): Promise<IWorkingCopyHistoryEntry | undefined>;

	/**
	 * Removes an entry from the local history if found.
	 */
	removeEntry(entry: IWorkingCopyHistoryEntry, token: CancellationToken): Promise<boolean>;

	/**
	 * Gets all history entries for the provided resource.
	 */
	getEntries(resource: URI, token: CancellationToken): Promise<readonly IWorkingCopyHistoryEntry[]>;
}
