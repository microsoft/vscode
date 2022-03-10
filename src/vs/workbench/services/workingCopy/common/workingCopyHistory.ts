/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopy';

export const IWorkingCopyHistoryService = createDecorator<IWorkingCopyHistoryService>('workingCopyHistoryService');

export interface IWorkingCopyHistoryEvent {

	/**
	 * The entry this event is about.
	 */
	entry: IWorkingCopyHistoryEntry;
}

export interface IWorkingCopyHistoryEntry {

	/**
	 * Unique identifier of this entry for the working copy.
	 */
	id: string;

	/**
	 * The associated working copy resource of this history entry.
	 */
	resource: URI;

	/**
	 * The location on disk of this history entry.
	 */
	location: URI;

	/**
	 * The time when this history entry was created.
	 */
	timestamp: number;

	/**
	 * Optional associated label with the history entry.
	 */
	label?: string;
}

export interface IWorkingCopyHistoryService {

	readonly _serviceBrand: undefined;

	/**
	 * An event when entries are added to the history.
	 */
	onDidAddEntry: Event<IWorkingCopyHistoryEvent>;

	/**
	 * Adds a new entry to the history for the given working copy.
	 */
	addEntry(workingCopy: IWorkingCopy, token: CancellationToken): Promise<IWorkingCopyHistoryEntry | undefined>;

	/**
	 * Gets all history entries for the provided resource.
	 */
	getEntries(resource: URI, token: CancellationToken): Promise<readonly IWorkingCopyHistoryEntry[]>;
}
