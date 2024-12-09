/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel, StoredFileWorkingCopy } from '../../../../../services/workingCopy/common/storedFileWorkingCopy.js';
import { IUntitledFileWorkingCopy } from '../../../../../services/workingCopy/common/untitledFileWorkingCopy.js';
import { IStoredFileWorkingCopySaveParticipantContext, IWorkingCopyFileService } from '../../../../../services/workingCopy/common/workingCopyFileService.js';
import { ChatEditingModifiedNotebookEntry } from '../../../../chat/browser/chatEditing/chatEditingModifiedNotebookEntry.js';
import { IChatEditingService } from '../../../../chat/common/chatEditingService.js';
import { NotebookFileWorkingCopyModel } from '../../../common/notebookEditorModel.js';
import { INotebookSynchronizerService } from '../../../common/notebookSynchronizerService.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NotebookSaveParticipant } from '../saveParticipants/saveParticipants.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IProgress, IProgressStep } from '../../../../../../platform/progress/common/progress.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';

class NotebookSynchronizerSaveParticipant extends NotebookSaveParticipant {
	constructor(
		@IEditorService editorService: IEditorService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IFileService protected readonly _fileService: IFileService
	) {
		super(editorService);
	}

	override async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: IStoredFileWorkingCopySaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		console.log('notebook synchronizer participate');
		const session = this._chatEditingService.currentEditingSessionObs.get();

		if (!session) {
			return;
		}

		const entry = session.getEntry(workingCopy.resource);

		if (entry && entry instanceof ChatEditingModifiedNotebookEntry) {
			await entry.saveMirrorDocument();
		}

		const inWorkingSet = session.workingSet.has(workingCopy.resource);

		if (!(entry && entry instanceof ChatEditingModifiedNotebookEntry) && !inWorkingSet) {
			// file not in working set, no need to continue
			return;
		}

		if (workingCopy instanceof StoredFileWorkingCopy) {
			const metadata = await this._fileService.stat(workingCopy.resource);
			if (workingCopy.lastResolvedFileStat) {
				workingCopy.lastResolvedFileStat = {
					...workingCopy.lastResolvedFileStat,
					...metadata
				};
			}
		}
	}
}

export class NotebookSynchronizerService extends Disposable implements INotebookSynchronizerService {
	_serviceBrand: undefined;

	constructor(
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IFileService protected readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService) {
		super();
		this._register(this._workingCopyFileService.addSaveParticipant(this._instantiationService.createInstance(NotebookSynchronizerSaveParticipant)));
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
