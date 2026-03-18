/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ChatViewId } from '../browser/chat.js';
import { ChatEditorInput } from '../browser/widgetHosts/editor/chatEditorInput.js';
import { ChatViewPane } from '../browser/widgetHosts/viewPane/chatViewPane.js';
import { AgentSessionProviders } from '../browser/agentSessions/agentSessions.js';
import { AgentHostContribution } from '../browser/agentSessions/agentHost/agentHostChatContribution.js';

registerWorkbenchContribution2(AgentHostContribution.ID, AgentHostContribution, WorkbenchPhase.AfterRestored);

// Register command for opening a new Agent Host session from the session type picker
CommandsRegistry.registerCommand(
	`workbench.action.chat.openNewChatSessionInPlace.${AgentSessionProviders.AgentHostCopilot}`,
	async (accessor, chatSessionPosition: string) => {
		const viewsService = accessor.get(IViewsService);
		const resource = URI.from({
			scheme: AgentSessionProviders.AgentHostCopilot,
			path: `/untitled-${generateUuid()}`,
		});

		if (chatSessionPosition === 'editor') {
			const editorService = accessor.get(IEditorService);
			await editorService.openEditor({
				resource,
				options: {
					override: ChatEditorInput.EditorID,
					pinned: true,
				},
			});
		} else {
			const view = await viewsService.openView(ChatViewId) as ChatViewPane;
			await view.loadSession(resource);
			view.focus();
		}
	}
);
