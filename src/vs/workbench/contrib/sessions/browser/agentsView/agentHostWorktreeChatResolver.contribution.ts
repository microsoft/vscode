/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IAgentHostWorktreeChat, IAgentHostWorktreeChatResolver, IAgentHostWorktreeChatResolverService } from '../../../chat/browser/agentSessions/agentHost/agentHostWorktreeChatResolver.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../common/agentHostSessionsProvider.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';

/**
 * The chats of the editor window's session layer, of the local agent host, as the folder follow reads them: where each works,
 * as the chat has it, else its session; and whether its session is archived.
 */
export class AgentHostWorktreeChatResolver implements IAgentHostWorktreeChatResolver {

	readonly onDidChange: Event<void>;

	constructor(@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService) {
		this.onDidChange = Event.signal(_sessionsManagementService.onDidChangeSession);
	}

	resolve(resource: URI): IAgentHostWorktreeChat | undefined {
		const found = this._sessionsManagementService.getSessionForChatResource(resource);
		if (found?.session.providerId !== LOCAL_AGENT_HOST_PROVIDER_ID) {
			return undefined;
		}
		return {
			workingDirectory: (found.chat.workspace.get() ?? found.session.workspace.get())?.folders[0]?.workingDirectory,
			isArchived: found.session.isArchived.get(),
		};
	}
}

/** Registers {@link AgentHostWorktreeChatResolver} in an editor window, whose folder follows the chat it shows. */
class AgentHostWorktreeChatResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostWorktreeChatResolver';

	constructor(
		@IAgentHostWorktreeChatResolverService resolverService: IAgentHostWorktreeChatResolverService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		if (!environmentService.isSessionsWindow) {
			this._register(resolverService.registerResolver(new AgentHostWorktreeChatResolver(sessionsManagementService)));
		}
	}
}

registerWorkbenchContribution2(AgentHostWorktreeChatResolverContribution.ID, AgentHostWorktreeChatResolverContribution, WorkbenchPhase.AfterRestored);
