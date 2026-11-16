/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IAgentHostWorktreeSendChoiceService } from '../../../chat/browser/agentSessions/agentHost/agentHostWorktreeSendChoice.js';
import { registerNewSessionWorktreeSendChoice } from '../chat/newSessionWorktreeSendChoice.js';

/**
 * Lets the chat area's new-session composer ask Work in Parallel as the Chat view's new chats do, with the agent host's send
 * choice: whether another chat recently worked in the folder, and the answer it remembers or asks for.
 */
export class AgentHostNewSessionWorktreeSendChoiceContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostNewSessionWorktreeSendChoice';

	constructor(@IAgentHostWorktreeSendChoiceService sendChoiceService: IAgentHostWorktreeSendChoiceService) {
		super();
		this._register(registerNewSessionWorktreeSendChoice({
			isRecentChatInFolder: (folder, draft) => sendChoiceService.isRecentChatInFolder(folder, draft),
			askWorktreeOnSend: control => sendChoiceService.askWorktreeOnSend(control),
		}));
	}
}

registerWorkbenchContribution2(AgentHostNewSessionWorktreeSendChoiceContribution.ID, AgentHostNewSessionWorktreeSendChoiceContribution, WorkbenchPhase.AfterRestored);
