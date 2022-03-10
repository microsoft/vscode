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
	 * The associated working copy with the event.
	 */
	workingCopy: IWorkingCopy;
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
	addEntry(workingCopy: IWorkingCopy, token: CancellationToken): Promise<URI | undefined>;
}
