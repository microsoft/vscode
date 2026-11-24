/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IOutgoingTurn, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { getAgentHostAutomationResult } from '../../../common/meta/agentHostAutomationsMeta.js';
import { AutomationRunStatus, MessageKind, SessionOriginKind } from '../../../common/state/protocol/state.js';
import { IAgentHostChatOwnershipService } from '../../agentHostChatOwnershipService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { reportAutomationResultToolName } from '../../shared/automationResultServerTools.js';

export class AutomationResultsContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'automationResults';
	readonly order = 360;

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly stateManager: AgentHostStateManager,
		@IAgentHostChatOwnershipService private readonly chatOwnership: IAgentHostChatOwnershipService,
	) {
		super();
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		const origin = this.stateManager.getSessionState(turn.session)?.origin;
		if (origin?.kind !== SessionOriginKind.Automation || turn.message.origin.kind !== MessageKind.Automation
			|| this.chatOwnership.getDefaultChat(turn.session) !== turn.chat) {
			return undefined;
		}
		const run = this.stateManager.getAutomationRunState(origin.run);
		if (!run || run.lifecycle.status !== AutomationRunStatus.Running || !getAgentHostAutomationResult(run)) {
			return undefined;
		}
		return {
			instructions: [`Before finishing this automation, call ${reportAutomationResultToolName} with success, noOp, or needsAttention and a plain-text summary of at most 10 words. Use needsAttention when a person must investigate or act. Do not report success merely because the session can finish. Call the tool before ending the turn.`],
		};
	}
}
