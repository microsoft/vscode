/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AgentSessionProviders } from './agentSessions.js';
import { IChatWidgetService } from '../chat.js';

/** Starts a new chat with this window's own Copilot agent, with `prompt` in its input for the user to finish and send. */
export async function startCopilotChatWithPrompt(prompt: string, isSessionsWindow: boolean, commandService: ICommandService, chatWidgetService: IChatWidgetService): Promise<void> {
	if (isSessionsWindow) {
		await commandService.executeCommand('workbench.action.sessions.newChat', { prompt, prefillPrompt: true, noWorkspace: true });
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
