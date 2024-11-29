/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IStoredFileWorkingCopy, StoredFileWorkingCopy } from '../../../../../services/workingCopy/common/storedFileWorkingCopy.js';
import { IUntitledFileWorkingCopy } from '../../../../../services/workingCopy/common/untitledFileWorkingCopy.js';
import { ChatEditingModifiedNotebookEntry } from '../../../../chat/browser/chatEditing/chatEditingModifiedNotebookEntry.js';
import { IChatEditingService } from '../../../../chat/common/chatEditingService.js';
import { NotebookFileWorkingCopyModel } from '../../../common/notebookEditorModel.js';
import { INotebookSynchronizerService } from '../../../common/notebookSynchronizerService.js';

export class NotebookSynchronizerService implements INotebookSynchronizerService {
	_serviceBrand: undefined;

	constructor(
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IFileService protected readonly fileService: IFileService,
	) {

	}

	async save(workingCopy: IStoredFileWorkingCopy<NotebookFileWorkingCopyModel> | IUntitledFileWorkingCopy<NotebookFileWorkingCopyModel>): Promise<void> {
		const session = this._chatEditingService.currentEditingSessionObs.get();

		if (!session) {
			return;
		}

		const entry = session.getEntry(workingCopy.resource);

		if (!entry) {
			return;
		}

		if (!(entry instanceof ChatEditingModifiedNotebookEntry)) {
			return;
		}

		await entry.saveMirrorDocument();

		if (workingCopy instanceof StoredFileWorkingCopy) {
			const metadata = await this.fileService.stat(workingCopy.resource);
			if (workingCopy.lastResolvedFileStat) {
				workingCopy.lastResolvedFileStat = {
					...workingCopy.lastResolvedFileStat,
					...metadata
				};
			}
		}
	}

	async revert(workingCopy: IStoredFileWorkingCopy<NotebookFileWorkingCopyModel> | IUntitledFileWorkingCopy<NotebookFileWorkingCopyModel>) {
		// check if we have mirror document
		const resource = workingCopy.resource;

		const session = this._chatEditingService.currentEditingSessionObs.get();

		if (session) {
			const entry = session.getEntry(resource);
			if (entry instanceof ChatEditingModifiedNotebookEntry) {
				await entry.revertMirrorDocument();
			}
		}
	}
}
