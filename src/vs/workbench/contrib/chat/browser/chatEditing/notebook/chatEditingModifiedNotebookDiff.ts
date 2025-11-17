/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { computeDiff } from '../../../../notebook/common/notebookDiff.js';
import { INotebookEditorModelResolverService } from '../../../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookLoggingService } from '../../../../notebook/common/notebookLoggingService.js';
import { INotebookEditorWorkerService } from '../../../../notebook/common/services/notebookWorkerService.js';
import { IEditSessionEntryDiff, ISnapshotEntry } from '../../../common/chatEditingService.js';


export class ChatEditingModifiedNotebookDiff {
	static NewModelCounter: number = 0;
	constructor(
		private readonly original: ISnapshotEntry,
		private readonly modified: ISnapshotEntry,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@INotebookLoggingService private readonly notebookLoggingService: INotebookLoggingService,
		@INotebookEditorModelResolverService private readonly notebookEditorModelService: INotebookEditorModelResolverService,
	) {

	}

	async computeDiff(): Promise<IEditSessionEntryDiff> {

		let added = 0;
		let removed = 0;

		const disposables = new DisposableStore();
		try {
			const [modifiedRef, originalRef] = await Promise.all([
				this.notebookEditorModelService.resolve(this.modified.snapshotUri),
				this.notebookEditorModelService.resolve(this.original.snapshotUri)
			]);
			disposables.add(modifiedRef);
			disposables.add(originalRef);
			const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.original.snapshotUri, this.modified.snapshotUri);
			const result = computeDiff(originalRef.object.notebook, modifiedRef.object.notebook, notebookDiff);
			result.cellDiffInfo.forEach(diff => {
				switch (diff.type) {
					case 'modified':
					case 'insert':
						added++;
						break;
					case 'delete':
						removed++;
						break;
					default:
						break;
				}
			});
		} catch (e) {
			this.notebookLoggingService.error('Notebook Chat', 'Error computing diff:\n' + e);
		} finally {
			disposables.dispose();
		}

		return {
			added,
			removed,
			identical: added === 0 && removed === 0,
			quitEarly: false,
			isFinal: true,
			modifiedURI: this.modified.snapshotUri,
			originalURI: this.original.snapshotUri,
		};
	}
}
