/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { SaveSource } from '../../../common/editor.js';

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
	timestamp: number;

	/**
	 * Associated source with the history entry.
	 */
	source: SaveSource;

	/**
	 * Optional additional metadata associated with the
	 * source that can help to describe the source.
	 */
	sourceDescription: string | undefined;
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
	 * An event when an entry is added to the history.
	 */
	readonly onDidAddEntry: Event<IWorkingCopyHistoryEvent>;

	/**
	 * An event when an entry is changed in the history.
	 */
	readonly onDidChangeEntry: Event<IWorkingCopyHistoryEvent>;

	/**
	 * An event when an entry is replaced in the history.
	 */
	readonly onDidReplaceEntry: Event<IWorkingCopyHistoryEvent>;

	/**
	 * An event when an entry is removed from the history.
	 */
	readonly onDidRemoveEntry: Event<IWorkingCopyHistoryEvent>;

	/**
	 * An event when entries are moved in history.
	 */
	readonly onDidMoveEntries: Event<void>;

	/**
	 * An event when all entries are removed from the history.
	 */
	readonly onDidRemoveEntries: Event<void>;

	/**
	 * Adds a new entry to the history for the given working copy
	 * with an optional associated descriptor.
	 */
	addEntry(descriptor: IWorkingCopyHistoryEntryDescriptor, token: CancellationToken): Promise<IWorkingCopyHistoryEntry | undefined>;

	/**
	 * Updates an entry in the local history if found.
	 */
	updateEntry(entry: IWorkingCopyHistoryEntry, properties: { source: SaveSource }, token: CancellationToken): Promise<void>;

	/**
	 * Removes an entry from the local history if found.
	 */
	removeEntry(entry: IWorkingCopyHistoryEntry, token: CancellationToken): Promise<boolean>;

	/**
	 * Moves entries that either match the `source` or are a child
	 * of `source` to the `target`.
	 *
	 * @returns a list of resources for entries that have moved.
	 */
	moveEntries(source: URI, target: URI): Promise<URI[]>;

	/**
	 * Gets all history entries for the provided resource.
	 */
	getEntries(resource: URI, token: CancellationToken): Promise<readonly IWorkingCopyHistoryEntry[]>;

	/**
	 * Returns all resources for which history entries exist.
	 */
	getAll(token: CancellationToken): Promise<readonly URI[]>;

	/**
	 * Removes all entries from all of local history.
	 */
	removeAll(token: CancellationToken): Promise<void>;
}

/**
 * A limit on how many I/O operations we allow to run in parallel.
 * We do not want to spam the file system with too many requests
 * at the same time, so we limit to a maximum degree of parallellism.
 */
export const MAX_PARALLEL_HISTORY_IO_OPS = 20;
