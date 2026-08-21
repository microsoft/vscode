/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { AgentHostChatContributionRegistry, IAgentHostChatContribution, IAgentHostChatContributionContext, IOutgoingTurn, ISendContribution } from '../chatContribution.js';

/** Adds a deferred rename reminder when the current chat still has an automatic title. */
class RenameInstructionContribution extends Disposable implements IAgentHostChatContribution {

	readonly id = 'renameInstruction';
	readonly order = 400;

	constructor(private readonly _context: IAgentHostChatContributionContext) {
		super();
	}

	async contributeSend(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		const instruction = await this._context.prepareRenameInstruction(turn.session, turn.chat);
		return instruction ? { instructions: [instruction] } : undefined;
	}
}

AgentHostChatContributionRegistry.register(RenameInstructionContribution);
