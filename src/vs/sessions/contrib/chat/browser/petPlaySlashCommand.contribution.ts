/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { parseLeadingSlashCommand } from '../../../../platform/agentHost/common/agentHostSlashCommand.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { findChatPetMove } from '../../../../workbench/contrib/chat/browser/chatPetBuiltInMoves.js';
import { CHAT_PET_TAUGHT_MOVES_COMMAND_ID, toChatPetMoveName } from '../../../../workbench/contrib/chat/browser/chatPetMoves.js';
import { isChatPetBuiltInReaction } from '../../../../workbench/contrib/chat/browser/chatPetReactions.js';
import { IChatPetService } from '../../../../workbench/contrib/chat/browser/chatPetService.js';
import { IChatSubmitRequestHandlerService, type IChatSubmitRequest } from '../../../../workbench/contrib/chat/browser/chatSubmitRequestHandlerService.js';
import { IChatPetWidgetService } from '../../../../workbench/contrib/chat/browser/widget/chatPetWidgetService.js';

/**
 * `/pet-play <move>` plays a move the VS Code pet knows, taught or built in, right away, without
 * asking the agent. A name the pet doesn't know goes on to the agent, whose built-in `pet-play`
 * skill finds the move the user meant, such as "the salute one". Without a name, it opens the list
 * of the pet's moves.
 */
export class PetPlaySlashCommandContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.petPlaySlashCommand';

	constructor(
		@IChatSubmitRequestHandlerService submitRequestHandlerService: IChatSubmitRequestHandlerService,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IChatPetWidgetService private readonly chatPetWidgetService: IChatPetWidgetService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._register(submitRequestHandlerService.register({
			id: 'sessions.pet.play',
			tryHandle: async request => this._tryHandle(request),
		}));
	}

	private _tryHandle(request: IChatSubmitRequest): boolean {
		const slashCommand = parseLeadingSlashCommand(request.input);
		// A hidden pet can't play: the agent tells the user how to show it.
		if (slashCommand?.command !== 'pet-play' || !this.chatPetService.enabled.get()) {
			return false;
		}
		if (!slashCommand.rest) {
			void this.commandService.executeCommand(CHAT_PET_TAUGHT_MOVES_COMMAND_ID);
			return true;
		}
		const name = toChatPetMoveName(slashCommand.rest);
		if (!isChatPetBuiltInReaction(name) && !findChatPetMove(this.chatPetService.moves.get(), name)) {
			return false;
		}
		// Nothing is added to the chat, so screen readers hear what happened: the pet announces what it plays.
		if (!this.chatPetWidgetService.playReaction(name, this.chatWidgetService.getWidgetBySessionResource(request.sessionResource))) {
			status(localize('petPlay.cannotPlay', "The VS Code pet can't play {0} right now", name));
		}
		return true;
	}
}

registerWorkbenchContribution2(PetPlaySlashCommandContribution.ID, PetPlaySlashCommandContribution, WorkbenchPhase.AfterRestored);
