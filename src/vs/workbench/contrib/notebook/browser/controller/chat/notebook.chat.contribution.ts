/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { ChatAgentLocation, IChatAgentService } from '../../../../chat/common/chatAgents.js';
import './cellChatActions.js';
import { CTX_NOTEBOOK_CHAT_HAS_AGENT } from './notebookChatContext.js';

class NotebookChatContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.notebookChatContribution';

	private readonly _ctxHasProvider: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatAgentService chatAgentService: IChatAgentService
	) {
		super();

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
