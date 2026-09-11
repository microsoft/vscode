/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IIncomingRequest, type IncomingRequestDisposition, type IOutgoingTurn, type ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { AgentMergeConfigKey, agentMergeRootConfigSchema, readAgentMergeSessionState } from '../../../common/agentMerge.js';
import { readPullRequestOperationMeta } from '../../../common/meta/agentPullRequestOperationMeta.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { IAgentConfigurationService } from '../../agentConfigurationService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** Applies PR form automation choices only once its creation turn is admitted. */
export class PullRequestChatContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'pullRequest';
	readonly order = 150;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		const options = readPullRequestOperationMeta(request.message);
		if (options?.agentMerge && !this._configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.Enabled)) {
			return {
				kind: 'reject',
				error: { errorType: 'invalidParams', message: localize('agentHost.pullRequestChat.agentMergeDisabled', "Agent Merge is disabled in the host configuration.") },
				stage: 'validation',
			};
		}
		return undefined;
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		const options = readPullRequestOperationMeta(turn.message);
		// Preparation can be cancelled before this hook runs; never configure an idle session.
		if (!options || this._stateManager.getChatState(turn.chat)?.activeTurn?.id !== turn.turnId) {
			return undefined;
		}
		const current = readAgentMergeSessionState(this._configurationService.getSessionConfigValues(turn.session));
		if (options.agentMerge) {
			const overrides = { ...current?.overrides, ...options.agentMergeOptions };
			this._configurationService.updateSessionConfig(turn.session, {
				[SessionConfigKey.AgentMerge]: { enabled: true, overrides },
				[SessionConfigKey.AgentMergeController]: current?.injectedConfiguration ? { injectedConfiguration: current.injectedConfiguration } : {},
			});
		} else if (current?.enabled) {
			this._configurationService.updateSessionConfig(turn.session, {
				[SessionConfigKey.AgentMerge]: { enabled: false, ...(current.overrides ? { overrides: current.overrides } : {}) },
			});
		}
		return undefined;
	}
}
