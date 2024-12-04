/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStoredFileWorkingCopy } from '../../../services/workingCopy/common/storedFileWorkingCopy.js';
import { IUntitledFileWorkingCopy } from '../../../services/workingCopy/common/untitledFileWorkingCopy.js';
import { NotebookFileWorkingCopyModel } from './notebookEditorModel.js';

export const INotebookSynchronizerService = createDecorator<INotebookSynchronizerService>('notebookSynchronizerService');

export interface INotebookSynchronizerService {
	readonly _serviceBrand: undefined;
	revert(workingCopy: IStoredFileWorkingCopy<NotebookFileWorkingCopyModel> | IUntitledFileWorkingCopy<NotebookFileWorkingCopyModel>): Promise<void>;
}
