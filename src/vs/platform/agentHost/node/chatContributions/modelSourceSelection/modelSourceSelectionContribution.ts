/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../log/common/log.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IIncomingRequest, type IncomingRequestDisposition } from '../../../common/agentHostChatContributionsService.js';
import { chatHasModelSourceSelection, getModelSourceSelectionError, supportsModelSourceSelection } from '../../../common/agentModelSelection.js';
import { IAgentHostClientConnectionService } from '../../agentHostClientConnectionService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

export class ModelSourceSelectionContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'modelSourceSelection';
	readonly order = 110;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostClientConnectionService private readonly _clients: IAgentHostClientConnectionService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		const provider = this._stateManager.getSessionSummary(request.session)?.provider;
		const agent = this._stateManager.rootState.agents.find(agent => agent.provider === provider);
		const chat = this._stateManager.getChatState(request.chat);
		const model = request.message.model ?? chat?.turns.findLast(turn => turn.message.model !== undefined)?.message.model ?? chat?.draft?.model;
		const qualified = model?.modelSourceId !== undefined || chatHasModelSourceSelection(chat);
		const incapable = qualified && request.source === 'direct' && request.clientId !== undefined && !this._clients.supportsModelSourceSelection(request.clientId);
		const selectionError = request.credentials && model?.modelSourceId !== undefined
			? supportsModelSourceSelection(agent?.capabilities) ? undefined : 'This agent does not support exact model-source selection.'
			: getModelSourceSelectionError(model, agent);
		const error = incapable
			? 'This client cannot execute source-qualified model selections.'
			: selectionError;
		if (error) {
			this._logService.warn(`[ModelSourceSelectionContribution] Rejecting model selection: ${error}`);
			return { kind: 'reject', error: { errorType: 'modelSelection', message: error }, stage: 'modelSelection' };
		}
		return undefined;
	}
}
