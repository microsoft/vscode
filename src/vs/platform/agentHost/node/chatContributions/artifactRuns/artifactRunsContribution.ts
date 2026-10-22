/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { AgentHostArtifactEventService, IAgentHostArtifactEventService } from '../../artifactIntegrations/agentHostArtifactRuntime.js';

export class ArtifactRunsContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'artifactRuns';
	readonly order = 700;

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostArtifactEventService private readonly artifactEventService: AgentHostArtifactEventService,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		switch (dispatched.action.type) {
			case ActionType.ChatTurnStarted:
			case ActionType.ChatTurnComplete:
			case ActionType.ChatTurnCancelled:
			case ActionType.ChatError:
			case ActionType.ChatPendingMessageSet:
			case ActionType.ChatPendingMessageRemoved:
			case ActionType.SessionMetaChanged:
			case ActionType.SessionIsArchivedChanged:
			case ActionType.SessionReady:
			case ActionType.SessionChatRemoved:
			case ActionType.SessionChatAdded:
			case ActionType.SessionChatUpdated:
				this.artifactEventService.accept(dispatched);
		}
	}
}
