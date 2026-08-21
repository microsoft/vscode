/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatPetAchievementIds, hasChatPetImageAttachment } from '../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../workbench/contrib/chat/browser/chatPetService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class SessionsChatPetAchievementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.chatPetAchievements';

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IChatPetService chatPetService: IChatPetService,
	) {
		super();
		this._register(sessionsManagementService.onDidSendRequest(event => {
			chatPetService.unlockAchievement(ChatPetAchievementIds.FirstChatMessage);
			if (hasChatPetImageAttachment(event.options.attachedContext ?? [])) {
				chatPetService.unlockAchievement(ChatPetAchievementIds.ImageRequest);
			}
		}));
	}
}
