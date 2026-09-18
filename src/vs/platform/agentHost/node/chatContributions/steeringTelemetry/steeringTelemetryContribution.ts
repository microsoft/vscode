/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, PendingMessageKind } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from '../../agentHostTurnTracker.js';

export class SteeringTelemetryContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'steeringTelemetry';
	readonly order = 150;

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostTurnTracker private readonly _turnTracker: AgentHostTurnTracker,
	) {
		super();
	}

	onDidDispatchAction({ channel, action, rejectionReason }: IDispatchedAction): void {
		if (rejectionReason !== undefined || !isAhpChatChannel(channel)
			|| action.type !== ActionType.ChatPendingMessageSet || action.kind !== PendingMessageKind.Steering) {
			return;
		}
		if (this._stateManager.getChatState(channel)?.steeringMessage?.id !== action.id) {
			return;
		}
		const turnId = this._stateManager.getActiveTurnId(channel);
		if (turnId) {
			this._turnTracker.markSteering(channel, turnId, 'received');
		}
	}
}
