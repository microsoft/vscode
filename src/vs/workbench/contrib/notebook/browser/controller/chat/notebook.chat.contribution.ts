/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import 'vs/workbench/contrib/notebook/browser/controller/chat/cellChatActions';
import { NotebookChatController } from 'vs/workbench/contrib/notebook/browser/controller/chat/notebookChatController';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';

class NotebookChatVariables extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.notebookChatVariables';

	constructor(
		@IChatVariablesService private readonly _chatVariableService: IChatVariablesService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService
	) {
		super();

		this._register(this._chatVariableService.registerVariable(
			{ id: '_notebookChatInput', name: '_notebookChatInput', description: '', hidden: true },
			async (_message, _arg, model) => {
				const editors = this._notebookEditorService.listNotebookEditors();
				for (const editor of editors) {
					const chatController = editor.getContribution(NotebookChatController.id) as NotebookChatController | undefined;
					if (chatController?.hasSession(model)) {
						return chatController.getSessionInputUri();
					}
				}

				return undefined;
			}
		));
	}
}

registerWorkbenchContribution2(NotebookChatVariables.ID, NotebookChatVariables, WorkbenchPhase.BlockRestore);
