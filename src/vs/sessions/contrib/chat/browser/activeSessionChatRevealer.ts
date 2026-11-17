/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { whenChatWidgetForSession } from '../../../../workbench/contrib/sessions/browser/chat/chatWidgetUtils.js';
import { IFocusedSessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';

/**
 * Makes chat commands that do not name a widget, such as Open Chat with a query and attachments from an extension, act on
 * the chat of the focused host's session, instead of the last focused widget or the Chat view, which the Agents window
 * does not show.
 */
export class ActiveSessionChatRevealerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.activeSessionChatRevealer';

	constructor(
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IFocusedSessionHostService focusedSessionHostService: IFocusedSessionHostService,
	) {
		super();
		this._register(chatWidgetService.registerWidgetRevealer({
			revealWidget: async preserveFocus => {
				const chat = focusedSessionHostService.getFocusedHost().chat.get();
				// The full chat of the session, once its view has loaded it, rather than its row in the Inbox, which shows it too.
				const widget = chat && await whenChatWidgetForSession(chatWidgetService, chat.resource, { supportsInputRequests: true });
				if (widget && !preserveFocus) {
					widget.focusInput();
				}
				return widget;
			},
		}));
	}
}
