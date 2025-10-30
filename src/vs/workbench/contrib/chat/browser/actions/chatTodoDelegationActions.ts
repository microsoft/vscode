/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ITodoItem } from '../../../../services/todoDetection/common/todoDetectionService.js';
import { IChatService } from '../../common/chatService.js';
import { generateTodoPrompt } from '../../common/chatTodoContext.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { AgentSelectionService } from '../agentSelectionService.js';
import { DELEGATE_TODO_TO_AGENT_COMMAND_ID } from '../todoCodeActionProvider.js';
import { showChatView } from '../chat.js';
import { IChatWidget } from '../chat.js';

export class DelegateTodoToAgentAction extends Action2 {

	constructor() {
		super({
			id: DELEGATE_TODO_TO_AGENT_COMMAND_ID,
			title: localize('delegateTodoToAgent', "Delegate TODO to Agent"),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, uri: URI, todo: ITodoItem): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const notificationService = accessor.get(INotificationService);
		const chatService = accessor.get(IChatService);
		const textModelService = accessor.get(ITextModelService);
		const viewsService = accessor.get(IViewsService);

		try {
			// Get or select an agent
			const agentSelectionService = instantiationService.createInstance(AgentSelectionService);
			const agent = await agentSelectionService.getOrSelectAgent(ChatAgentLocation.Chat);

			if (!agent) {
				notificationService.warn(localize('noAgent', "No chat agent available for delegation."));
				return;
			}

			// Generate context-rich prompt
			const prompt = await generateTodoPrompt(uri, todo, textModelService);

			// Open chat view and get the widget
			const widget: IChatWidget | undefined = await showChatView(viewsService);

			if (!widget || !widget.viewModel) {
				// Start a new session if no widget or session
				const session = await chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None);
				if (session) {
					// Try to get widget again after session creation
					const newWidget = await showChatView(viewsService);
					if (newWidget) {
						await newWidget.acceptInput(prompt);
					}
				}
			} else {
				// Use existing widget to send the request
				await widget.acceptInput(prompt);
			}

		} catch (error) {
			notificationService.error(localize('delegationError', "Failed to delegate TODO: {0}", String(error)));
		}
	}
}
