/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../../../../../platform/agentHost/common/agent.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { INewSessionInAgentsWindowOptions, NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID } from '../../common/chatSessionsService.js';
import { AgentSessionProviders } from './agentSessions.js';
import { IChatWidgetService } from '../chat.js';

/** Starts a new chat with this window's own Copilot agent, with `prompt` in its input for the user to finish and send. */
export async function startCopilotChatWithPrompt(prompt: string, isSessionsWindow: boolean, commandService: ICommandService, chatWidgetService: IChatWidgetService): Promise<void> {
	if (isSessionsWindow) {
		// Named, as a chat without a workspace otherwise goes to the agent of the session that is showing.
		await commandService.executeCommand(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID, { prompt, prefillPrompt: true, noWorkspace: true, agentHostProvider: COPILOT_CLI_AGENT_PROVIDER_ID } satisfies INewSessionInAgentsWindowOptions);
		return;
	}
	const sessionResource = await commandService.executeCommand<URI | undefined>(`workbench.action.chat.openNewSessionSidebar.${AgentSessionProviders.AgentHostCopilot}`);
	const widget = sessionResource ? chatWidgetService.getWidgetBySessionResource(sessionResource) : undefined;
	if (!widget) {
		throw new Error(localize('marketplaceDetail.chatUnavailable', "The new Copilot session input is unavailable."));
	}
	widget.setInput(prompt);
	widget.focusInput();
}
