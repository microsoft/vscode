/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ObservableGit } from '../../../platform/inlineEdits/common/observableGit';
import { WorkspaceDocumentEditHistory } from '../../../platform/inlineEdits/common/workspaceEditTracker/workspaceDocumentEditTracker';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { VSCodeWorkspace } from '../../inlineEdits/vscode-node/parts/vscodeWorkspace';

export class WorkspaceEditRecorder extends Disposable {

	private readonly _workspaceDocumentEditHistory: WorkspaceDocumentEditHistory;
	private readonly _workspace: VSCodeWorkspace;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._workspace = this._instantiationService.createInstance(VSCodeWorkspace);
		const git = this._instantiationService.createInstance(ObservableGit);
		this._workspaceDocumentEditHistory = this._register(new WorkspaceDocumentEditHistory(this._workspace, git, 100));
	}

	public getEditsAndReset() {
		const serializedEdits: { path: string; edits: string }[] = [];
		this._workspace.openDocuments.get().forEach(doc => {
			const edits = this._workspaceDocumentEditHistory.getRecentEdits(doc.id);
			if (edits && edits.edits.replacements.length > 0) {
				const docUri = vscode.Uri.parse(doc.id.path);
				const relativePath = vscode.workspace.asRelativePath(docUri, false);
				serializedEdits.push({
					path: relativePath,
					edits: JSON.stringify(edits.edits)
				});
			}
		});

		this._workspaceDocumentEditHistory.resetEditHistory();
		return serializedEdits;
	}
}