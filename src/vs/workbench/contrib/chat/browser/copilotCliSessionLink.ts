/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { isValidCopilotCliSessionId } from '../../../../platform/window/common/window.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IChatSessionsService } from '../common/chatSessionsService.js';
import { ChatViewPaneTarget, IChatWidgetService } from './chat.js';
import { COPILOT_CLI_EH_SCHEME } from './copilotCliEventsUri.js';

/**
 * Opens Copilot CLI sessions, identified by their CLI session id, in the Chat view.
 *
 * Used for product protocol links with a `copilotCliSession` query parameter,
 * such as the link that the Copilot CLI's `/code` command opens. The session
 * opens through the Copilot CLI chat session provider, which loads its history
 * from the CLI's session state on disk. When that provider is unavailable, the
 * user is told so instead of being shown a new, empty chat.
 */
export class CopilotCliSessionLinkOpener {

	constructor(
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) { }

	async open(sessionId: string): Promise<void> {
		if (!isValidCopilotCliSessionId(sessionId)) {
			this.logService.warn('[CopilotCliSessionLinkOpener] Ignoring a link with an invalid Copilot CLI session id');
			return;
		}

		if (this.chatEntitlementService.sentiment.hidden || !await this.chatSessionsService.canResolveChatSession(COPILOT_CLI_EH_SCHEME)) {
			this.logService.warn(`[CopilotCliSessionLinkOpener] Copilot CLI sessions are not available, cannot open session ${sessionId}`);
			this.notificationService.error(localize('copilotCliSessionUnavailable', "Couldn't open the Copilot CLI session because Copilot CLI sessions aren't available. Make sure the GitHub Copilot Chat extension is enabled."));
			return;
		}

		await this.chatWidgetService.openSession(URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${sessionId}` }), ChatViewPaneTarget);
	}
}
