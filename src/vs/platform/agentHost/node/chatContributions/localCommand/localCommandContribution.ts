/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IIncomingRequest, type IncomingRequestDisposition } from '../../../common/agentHostChatContributionsService.js';
import { IAgentHostSessionTitleController } from '../../agentHostSessionTitleController.js';
import { AgentHostLocalCommands, IAgentHostLocalCommands } from '../../localCommands/localChatCommand.js';

/**
 * Generic, agent-agnostic host commands (`/rename`, `!command`, …) are intercepted here and handled by the local-command dispatcher rather than forwarded to the agent SDK.
 */
export class LocalCommandContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'localCommand';
	// Run before turn admission so local commands remain available in read-only and archived chats.
	readonly order = 50;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostLocalCommands private readonly _localCommands: AgentHostLocalCommands,
		@IAgentHostSessionTitleController private readonly _titleController: IAgentHostSessionTitleController,
	) {
		super();
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		const handled = this._localCommands.tryHandle({
			turnChannel: request.turnChannel,
			turnId: request.turnId,
			text: request.message.text,
		});
		if (!handled) {
			return undefined;
		}
		if (handled.suggestedTitle !== undefined) {
			this._titleController.seedProvisionalTitle(request.session, handled.suggestedTitle, request.chat);
		}
		return { kind: 'handled' };
	}
}
