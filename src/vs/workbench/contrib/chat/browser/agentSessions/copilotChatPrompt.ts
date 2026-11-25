/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { INewSessionInAgentsWindowOptions, NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID } from '../../common/chatSessionsService.js';
import { AgentSessionProviders } from './agentSessions.js';
import { IChatWidgetService } from '../chat.js';

/**
 * Starts a new chat with `prompt` in its input for the user to finish and send. In the Agents window the chat goes to
 * the agent of the session that is showing, unless `agentHostProvider` names the agent to use.
 */
export async function startCopilotChatWithPrompt(prompt: string, isSessionsWindow: boolean, commandService: ICommandService, chatWidgetService: IChatWidgetService, agentHostProvider?: string): Promise<void> {
	if (isSessionsWindow) {
		await commandService.executeCommand(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID, { prompt, prefillPrompt: true, noWorkspace: true, ...(agentHostProvider ? { agentHostProvider } : {}) } satisfies INewSessionInAgentsWindowOptions);
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
