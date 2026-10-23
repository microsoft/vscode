/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { IChatService } from '../common/chatService/chatService.js';
import { getChatSessionInitialMessageVariables } from '../common/chatSessionsService.js';
import { IChatSideChatService } from '../common/chatSideChatService.js';
import { ChatAgentLocation } from '../common/constants.js';
import { IChatSlashCommandService } from '../common/participants/chatSlashCommands.js';
import { IChatWidgetService } from './chat.js';
import { captureSideChatSelection } from './chatSideChat.js';

export class BtwSlashCommandContribution extends Disposable {

	static readonly ID = 'workbench.contrib.btwSlashCommand';

	constructor(
		@IChatSlashCommandService slashCommandService: IChatSlashCommandService,
		@IChatSideChatService sideChatService: IChatSideChatService,
		@IChatService chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@INotificationService notificationService: INotificationService,
	) {
		super();

		this._register(slashCommandService.registerSlashCommand({
			command: 'btw',
			detail: localize('btw', "Ask a side question without adding it to this conversation"),
			sortText: 'z2_btw',
			executeImmediately: false,
			executeDuringRequest: true,
			silent: true,
			locations: [ChatAgentLocation.Chat],
			when: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.inQuickChat.negate(),
				ChatContextKeys.readOnly.negate(),
				ChatContextKeys.chatSessionSupportsSideChat,
			),
		}, async (prompt, _progress, _history, _location, sessionResource, token, options, executionContext) => {
			const query = prompt.trim();
			if (!query) {
				notificationService.warn(localize('btw.missingPrompt', "Enter a question after `/btw`."));
				return;
			}
			if (!sideChatService.canAskInSideChat(sessionResource)) {
				const model = chatService.getSession(sessionResource);
				notificationService.warn(model && !model.isReadOnly.get() && !model.getRequests().length
					? localize('btw.noTurn', "Send a message in this conversation before starting a side chat.")
					: localize('btw.unsupported', "This conversation does not support side chats."));
				return;
			}
			const selection = captureSideChatSelection(chatWidgetService.getWidgetBySessionResource(sessionResource));
			const input = executionContext?.input ?? `/btw ${prompt}`;
			const textOffset = input.trimEnd().length - query.length;
			const variables = getChatSessionInitialMessageVariables({ text: query, textOffset, requestOptions: options });

			try {
				await sideChatService.askInSideChat(sessionResource, query, selection, { attachedContext: variables, token });
			} catch (error) {
				notificationService.error(localize('btw.failed', "The side chat could not be started: {0}", toErrorMessage(error)));
			}
		}));
	}
}
