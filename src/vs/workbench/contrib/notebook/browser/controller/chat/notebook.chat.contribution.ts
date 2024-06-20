/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { ChatAgentLocation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import 'vs/workbench/contrib/notebook/browser/controller/chat/cellChatActions';
import { CTX_NOTEBOOK_CHAT_HAS_AGENT } from 'vs/workbench/contrib/notebook/browser/controller/chat/notebookChatContext';
import { NotebookChatController } from 'vs/workbench/contrib/notebook/browser/controller/chat/notebookChatController';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';

class NotebookChatContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.notebookChatContribution';

	private readonly _ctxHasProvider: IContextKey<boolean>;

	constructor(
		@IChatVariablesService private readonly _chatVariableService: IChatVariablesService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatAgentService chatAgentService: IChatAgentService
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

		this._ctxHasProvider = CTX_NOTEBOOK_CHAT_HAS_AGENT.bindTo(contextKeyService);

		const updateNotebookAgentStatus = () => {
			const hasNotebookAgent = Boolean(chatAgentService.getDefaultAgent(ChatAgentLocation.Notebook));
			this._ctxHasProvider.set(hasNotebookAgent);
		};

		updateNotebookAgentStatus();
		this._register(chatAgentService.onDidChangeAgents(updateNotebookAgentStatus));
	}
}

registerWorkbenchContribution2(NotebookChatContribution.ID, NotebookChatContribution, WorkbenchPhase.BlockRestore);
