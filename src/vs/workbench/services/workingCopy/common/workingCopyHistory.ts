/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopy';

export const IWorkingCopyHistoryService = createDecorator<IWorkingCopyHistoryService>('workingCopyHistoryService');

export interface IWorkingCopyHistoryService {

	readonly _serviceBrand: undefined;

	/**
	 * Adds a new entry to the history for the given working copy.
	 */
	addEntry(workingCopy: IWorkingCopy, token: CancellationToken): Promise<void>;
}
