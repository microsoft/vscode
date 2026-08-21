/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../log/common/log.js';
import { IAgentHostChatContributions, type IAgentHostChatContribution, type IOutgoingTurn, type ISendContribution } from '../../../common/agentHostChatContributionsService.js';

/** Adds a deferred rename reminder when the current chat still has an automatic title. */
export class RenameInstructionContribution extends Disposable implements IAgentHostChatContribution {

	readonly id = 'renameInstruction';
	readonly order = 400;

	constructor(
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async contributeSend(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		const host = this._chatContributions.getHost();
		if (!host) {
			this._logService.warn('[RenameInstructionContribution] Chat contribution host is not registered');
			return undefined;
		}
		const instruction = await host.prepareRenameInstruction(turn.session, turn.chat);
		return instruction ? { instructions: [instruction] } : undefined;
	}
}
