/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookDocument } from 'vscode';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { INotebookSummaryTracker } from '../common/notebookSummaryTracker';

export class NotebookSummaryTrackerImpl extends DisposableStore implements INotebookSummaryTracker {
	declare readonly _serviceBrand: undefined;
	private readonly trackedNotebooks = new WeakSet<NotebookDocument>();
	private readonly notebooksWithChanges = new WeakSet<NotebookDocument>();

	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IVSCodeExtensionContext vsCodeExtensionContext: IVSCodeExtensionContext) {
		super();
		vsCodeExtensionContext.subscriptions.push(this);

		this.add(this.workspaceService.onDidChangeNotebookDocument((e) => {
			if (!this.trackedNotebooks.has(e.notebook)) {
				return;
			}

			if (e.contentChanges.length) {
				this.notebooksWithChanges.add(e.notebook);
			}
			if (e.cellChanges.some(c => c.executionSummary)) {
				this.notebooksWithChanges.add(e.notebook);
			}

		}));
	}
	trackNotebook(notebook: NotebookDocument): void {
		this.trackedNotebooks.add(notebook);
	}

	clearState(notebook: NotebookDocument): void {
		this.notebooksWithChanges.delete(notebook);
	}

	listNotebooksWithChanges(): NotebookDocument[] {
		return this.workspaceService.notebookDocuments.filter((notebook) => this.notebooksWithChanges.has(notebook));
	}
}
